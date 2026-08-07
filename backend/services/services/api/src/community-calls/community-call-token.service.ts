import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { callError } from "./community-calls.errors";
import {
  COMMUNITY_CALLS_CONFIG,
  communityCallsConfig,
} from "./community-calls.config";
import type { CommunityCallsConfig } from "./community-calls.types";

export type JoinTokenClaims = JWTPayload & {
  sub: string;
  callId: string;
  groupId: string;
  role: string;
  jti: string;
};

export type GatewayCallbackClaims = JWTPayload & {
  sub: "edutu-voice";
  callId: string;
  action: "media-failed" | "participant-joined";
  jti: string;
  userId?: string;
  joinTokenJti?: string;
};

@Injectable()
export class CommunityCallTokenService {
  constructor(
    @Inject(COMMUNITY_CALLS_CONFIG)
    private readonly config: CommunityCallsConfig = communityCallsConfig(),
  ) {}

  async signJoinToken(input: {
    userId: string;
    callId: string;
    groupId: string;
    role: string;
    idempotencyKey: string;
  }): Promise<{ token: string; expiresAt: string; jti: string }> {
    const secret = this.secret();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + this.config.joinTokenTtlSeconds;
    const jti = this.joinTokenJti(input);
    const token = await new SignJWT({
      callId: input.callId,
      groupId: input.groupId,
      role: input.role,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(this.config.issuer)
      .setAudience(this.config.joinAudience)
      .setSubject(input.userId)
      .setJti(jti)
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .sign(secret);
    return {
      token,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      jti,
    };
  }

  async signGatewayInternalToken(
    callId: string,
    action: "prepare" | "close",
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ callId, action })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(this.config.issuer)
      .setAudience(this.config.gatewayAudience)
      .setSubject("edutu-api")
      .setJti(randomUUID())
      .setIssuedAt(now)
      .setExpirationTime(now + 30)
      .sign(this.secret());
  }

  async verifyGatewayCallbackToken(
    token: string,
    callId: string,
  ): Promise<GatewayCallbackClaims> {
    const payload = await this.verifyGatewayToken(token);
    if (
      payload.sub !== "edutu-voice" ||
      payload.callId !== callId ||
      payload.action !== "media-failed" ||
      typeof payload.jti !== "string" ||
      payload.jti.length < 8
    ) {
      throw callError.forbidden();
    }
    return payload;
  }

  async verifyGatewayParticipationToken(
    token: string,
    callId: string,
    userId: string,
    joinTokenJti: string,
  ): Promise<GatewayCallbackClaims> {
    const payload = await this.verifyGatewayToken(token);
    if (
      payload.sub !== "edutu-voice" ||
      payload.callId !== callId ||
      payload.action !== "participant-joined" ||
      payload.userId !== userId ||
      payload.joinTokenJti !== joinTokenJti ||
      typeof payload.jti !== "string" ||
      payload.jti.length < 8
    ) {
      throw callError.forbidden();
    }
    return payload;
  }

  private joinTokenJti(input: {
    userId: string;
    callId: string;
    idempotencyKey: string;
  }) {
    return createHash("sha256")
      .update(`${input.callId}:${input.userId}:${input.idempotencyKey}`)
      .digest("hex");
  }

  private async verifyGatewayToken(
    token: string,
  ): Promise<GatewayCallbackClaims> {
    try {
      const { payload } = await jwtVerify(token, this.secret(), {
        algorithms: ["HS256"],
        issuer: this.config.callbackIssuer,
        audience: this.config.callbackAudience,
        clockTolerance: 5,
        maxTokenAge: "2m",
      });
      return payload as GatewayCallbackClaims;
    } catch {
      throw callError.forbidden();
    }
  }

  private secret(): Uint8Array {
    const secret = this.config.tokenSecret;
    if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
      throw callError.mediaUnavailable();
    }
    return new TextEncoder().encode(secret);
  }
}
