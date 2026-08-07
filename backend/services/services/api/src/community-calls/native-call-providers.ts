import { connect } from "node:http2";
import { importPKCS8, SignJWT } from "jose";

export type NativeCallPayload = {
  callId: string;
  groupId: string;
  groupName: string;
  title: string;
  ringExpiresAt: string;
  deepLink: string;
};

export type NativeProviderOutcome =
  | { status: "accepted" }
  | { status: "stale"; reason: string }
  | { status: "rejected"; reason: string }
  | { status: "unavailable"; reason: string };

export interface NativeCallProviderAdapter {
  readonly provider: "apns-voip" | "fcm";
  send(
    token: string,
    payload: NativeCallPayload,
    ttlSeconds: number,
  ): Promise<NativeProviderOutcome>;
}

export class ApnsVoipCallProvider implements NativeCallProviderAdapter {
  readonly provider = "apns-voip" as const;
  private cachedAuth: { token: string; expiresAt: number } | null = null;

  async send(
    deviceToken: string,
    payload: NativeCallPayload,
    ttlSeconds: number,
  ): Promise<NativeProviderOutcome> {
    const teamId = process.env.APNS_TEAM_ID;
    const keyId = process.env.APNS_KEY_ID;
    const bundleId = process.env.APNS_BUNDLE_ID;
    const privateKey = normalizedPrivateKey(process.env.APNS_PRIVATE_KEY);
    if (!teamId || !keyId || !bundleId || !privateKey) {
      return { status: "unavailable", reason: "apns_credentials_missing" };
    }
    let authorization: string;
    try {
      authorization = await this.authorization(teamId, keyId, privateKey);
    } catch {
      return { status: "unavailable", reason: "apns_credentials_invalid" };
    }
    const host =
      process.env.APNS_USE_SANDBOX === "true"
        ? "https://api.sandbox.push.apple.com"
        : "https://api.push.apple.com";
    const expiration = Math.floor(Date.now() / 1000) + ttlSeconds;
    const body = JSON.stringify({
      aps: { "content-available": 1 },
      ...payload,
    });
    try {
      const result = await new Promise<{ status: number; reason: string }>(
        (resolve, reject) => {
          const client = connect(host);
          let settled = false;
          let request: ReturnType<typeof client.request> | null = null;
          const finish = (
            error: Error | null,
            value?: { status: number; reason: string },
          ) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) {
              request?.destroy();
              client.destroy();
              reject(error);
            } else {
              client.close();
              resolve(value!);
            }
          };
          const timer = setTimeout(() => finish(new Error("timeout")), 5_000);
          client.once("error", () => finish(new Error("session error")));
          try {
            request = client.request({
              ":method": "POST",
              ":path": `/3/device/${encodeURIComponent(deviceToken)}`,
              authorization: `bearer ${authorization}`,
              "apns-topic": `${bundleId}.voip`,
              "apns-push-type": "voip",
              "apns-priority": "10",
              "apns-expiration": String(expiration),
              // Stable for every retry of this call. APNs coalesces queued
              // duplicates instead of presenting multiple incoming calls.
              "apns-collapse-id": payload.callId,
              "apns-id": payload.callId,
              "content-type": "application/json",
            });
          } catch {
            finish(new Error("request setup error"));
            return;
          }
          let status = 0;
          let response = "";
          request.setEncoding("utf8");
          request.on("response", (headers) => {
            status = Number(headers[":status"] || 0);
          });
          request.on("data", (chunk) => {
            response += chunk;
          });
          request.on("end", () => {
            let reason = "apns_rejected";
            try {
              reason = JSON.parse(response || "{}").reason || reason;
            } catch {
              // Provider prose is deliberately not surfaced or logged.
            }
            finish(null, { status, reason });
          });
          request.on("error", () => finish(new Error("request error")));
          request.end(body);
        },
      );
      if (result.status === 200) return { status: "accepted" };
      if (
        result.status === 410 ||
        result.reason === "BadDeviceToken" ||
        result.reason === "Unregistered"
      ) {
        return { status: "stale", reason: result.reason };
      }
      return { status: "rejected", reason: result.reason };
    } catch {
      return { status: "unavailable", reason: "apns_transport_unavailable" };
    }
  }

  private async authorization(
    teamId: string,
    keyId: string,
    privateKey: string,
  ) {
    if (this.cachedAuth && this.cachedAuth.expiresAt > Date.now()) {
      return this.cachedAuth.token;
    }
    const key = await importPKCS8(privateKey, "ES256");
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId })
      .setIssuer(teamId)
      .setIssuedAt()
      .sign(key);
    this.cachedAuth = { token, expiresAt: Date.now() + 45 * 60_000 };
    return token;
  }
}

export class FcmCallProvider implements NativeCallProviderAdapter {
  readonly provider = "fcm" as const;
  private cachedAccess: { token: string; expiresAt: number } | null = null;

  async send(
    deviceToken: string,
    payload: NativeCallPayload,
    ttlSeconds: number,
  ): Promise<NativeProviderOutcome> {
    const projectId = process.env.FCM_PROJECT_ID;
    if (!projectId) {
      return { status: "unavailable", reason: "fcm_credentials_missing" };
    }
    let accessToken: string;
    try {
      accessToken = await this.accessToken();
    } catch {
      return { status: "unavailable", reason: "fcm_credentials_invalid" };
    }
    let response: Response;
    try {
      response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: deviceToken,
              data: payload,
              android: {
                priority: "HIGH",
                ttl: `${ttlSeconds}s`,
                collapse_key: payload.callId,
              },
            },
          }),
          signal: AbortSignal.timeout(5_000),
        },
      );
    } catch {
      return { status: "unavailable", reason: "fcm_transport_unavailable" };
    }
    if (response.ok) return { status: "accepted" };
    const error = await safeJson(response);
    const providerCode = String(
      error?.error?.details?.find?.((item: any) => item?.errorCode)
        ?.errorCode ||
        error?.error?.status ||
        "fcm_rejected",
    );
    if (response.status === 404 || providerCode === "UNREGISTERED") {
      return { status: "stale", reason: providerCode };
    }
    return { status: "rejected", reason: providerCode };
  }

  private async accessToken(): Promise<string> {
    if (this.cachedAccess && this.cachedAccess.expiresAt > Date.now()) {
      return this.cachedAccess.token;
    }
    const email = process.env.FCM_CLIENT_EMAIL;
    const privateKey = normalizedPrivateKey(process.env.FCM_PRIVATE_KEY);
    if (!email || !privateKey) throw new Error("missing credentials");
    const now = Math.floor(Date.now() / 1000);
    const key = await importPKCS8(privateKey, "RS256");
    const assertion = await new SignJWT({
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(email)
      .setSubject(email)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error("oauth unavailable");
    const result = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!result.access_token) throw new Error("oauth response invalid");
    this.cachedAccess = {
      token: result.access_token,
      expiresAt:
        Date.now() + Math.max(60, (result.expires_in ?? 3600) - 120) * 1000,
    };
    return result.access_token;
  }
}

function normalizedPrivateKey(value: string | undefined): string | null {
  if (!value) return null;
  const decoded = value.includes("BEGIN PRIVATE KEY")
    ? value
    : Buffer.from(value, "base64").toString("utf8");
  return decoded.replace(/\\n/g, "\n");
}

async function safeJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
