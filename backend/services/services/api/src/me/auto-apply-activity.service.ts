import { createPrivateKey, sign } from "node:crypto";
import { connect, type ClientHttp2Session } from "node:http2";
import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Expo } from "expo-server-sdk";
import { pool } from "../db";
import {
  autoApplyActivityActionLabels,
  autoApplyActivityActionSql,
  type AutoApplyActivityAction,
} from "./auto-apply-activity-action";
import { autoApplyReceiptConfig } from "./auto-apply-worker.service";

const statuses: Record<string, string> = {
  queued: "Waiting to start",
  running: "Preparing application",
  needs_input: "Your input is needed",
  needs_review: "Ready for review",
  submitting: "Submitting",
  unconfirmed: "Submission unconfirmed",
  submitted: "Submitted",
  cancelled: "Cancelled",
  failed: "Application attempt failed",
};
const terminal = new Set(["submitted", "cancelled", "failed", "unconfirmed"]);
// Failed and cancelled attempts can resume using the same Android binding.
const androidFinished = new Set(["submitted", "unconfirmed"]);

export function autoApplyActivityPayload(
  state: string,
  timestamp: number,
  opportunityTitle?: string | null,
  action?: AutoApplyActivityAction | null,
) {
  const title = opportunityTitle?.trim().slice(0, 80);
  return {
    aps: {
      timestamp,
      event: terminal.has(state) ? "end" : "update",
      ...(["queued", "running", "submitting"].includes(state)
        ? { "stale-date": timestamp + 120 }
        : {}),
      "content-state": {
        name: "AutoApplyProgress",
        props: JSON.stringify({
          status: (action && autoApplyActivityActionLabels[action]) || statuses[state] || "Open Edutu for status",
          actionRequired: [
            "needs_input",
            "needs_review",
            "unconfirmed",
          ].includes(state),
          ...(title ? { title } : {}),
        }),
      },
    },
  };
}

@Injectable()
export class AutoApplyActivityService {
  private running = false;
  private sendingAndroid = false;
  private readonly expo = new Expo();
  private authorization?: {
    team: string;
    keyId: string;
    expires: number;
    jwt: string;
  };

  @Cron("*/15 * * * * *")
  async sendUpdates() {
    const team = process.env.AUTO_APPLY_APNS_TEAM_ID;
    const keyId = process.env.AUTO_APPLY_APNS_KEY_ID;
    const secret = process.env.AUTO_APPLY_APNS_PRIVATE_KEY;
    const bundle = process.env.AUTO_APPLY_APNS_BUNDLE_ID;
    if (this.running || !team || !keyId || !secret || !bundle) return;
    this.running = true;
    let client: ClientHttp2Session | undefined;
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const jwt = this.providerToken(team, keyId, secret, timestamp);
      await pool.query(
        "delete from private.auto_apply_live_activities where platform = 'ios' and expires_at <= now()",
      );
      const { rows } = await pool.query<{
        token: string;
        version: number;
        state: string;
        title: string | null;
        activity_action: AutoApplyActivityAction | null;
      }>(
        `with due as (
           select activity.token, attempt.version, attempt.state, left(opportunity.title, 80) as title,
             ${autoApplyActivityActionSql} as activity_action
           from private.auto_apply_live_activities activity
           join private.auto_apply_attempts attempt on attempt.id = activity.attempt_id
           join public.opportunity_applications application on application.id = attempt.application_id
           left join public.opportunities opportunity on opportunity.id = application.opportunity_id
           where activity.platform = 'ios' and activity.delivered_version < attempt.version and activity.retry_after <= now()
           order by activity.retry_after limit 20 for update of activity skip locked
         )
         update private.auto_apply_live_activities activity set retry_after = now() + interval '45 seconds'
         from due where activity.token = due.token
         returning activity.token, due.version, due.state, due.title, due.activity_action`,
      );
      if (!rows.length) return;

      const sandbox = process.env.AUTO_APPLY_APNS_SANDBOX === "true";
      client = connect(
        sandbox
          ? "https://api.sandbox.push.apple.com"
          : "https://api.push.apple.com",
      );
      client.on("error", () => {});
      const connection = client;
      await Promise.all(
        rows.map(async ({ token, version, state, title, activity_action }) => {
          const status = await this.push(
            connection,
            token,
            bundle,
            jwt,
            autoApplyActivityPayload(state, timestamp, title, activity_action),
          );
          if (status === 410 || (status === 200 && terminal.has(state))) {
            await pool.query(
              "delete from private.auto_apply_live_activities where token = $1",
              [token],
            );
          } else if (status === 200) {
            await pool.query(
              "update private.auto_apply_live_activities set delivered_version = greatest(delivered_version, $2), retry_after = now() where token = $1",
              [token, version],
            );
          }
        }),
      );
    } finally {
      client?.destroy();
      this.running = false;
    }
  }

  @Cron("*/15 * * * * *")
  async sendAndroidUpdates() {
    if (
      this.sendingAndroid ||
      (!process.env.AUTO_APPLY_PILOT_OPPORTUNITIES?.trim() && !autoApplyReceiptConfig())
    )
      return;
    this.sendingAndroid = true;
    try {
      await Promise.all([
        pool.query("delete from private.auto_apply_android_activities where expires_at <= now()"),
        pool.query("delete from private.auto_apply_live_activities where platform = 'android' and expires_at <= now()"),
      ]);
      const { rows } = await pool.query<{
        token: string;
        id: string;
        version: number;
        state: string;
        activity_action: AutoApplyActivityAction | null;
      }>(
        `with due as (
           select activity.token, attempt.id, attempt.version, attempt.state,
             ${autoApplyActivityActionSql} as activity_action
           from private.auto_apply_android_activities activity
           join private.auto_apply_attempts attempt on attempt.id = activity.attempt_id
           join public.opportunity_applications application on application.id = attempt.application_id
           join public.notification_push_tokens push on push.token = activity.token and push.provider = 'expo'
             and push.user_id::text = public.clerk_id_to_uuid(application.user_id)
             and push.device->>'platform' = 'android'
           left join public.notification_preferences preference on preference.user_id = push.user_id
           where activity.delivered_version < attempt.version
             and activity.retry_after <= now() and coalesce(preference.push_notifications, true)
           order by activity.retry_after limit 20 for update of activity skip locked
         )
         update private.auto_apply_android_activities activity set retry_after = now() + interval '45 seconds'
         from due where activity.token = due.token and activity.attempt_id = due.id
         returning activity.token, due.id, due.version, due.state, due.activity_action`,
      );
      if (!rows.length) return;
      const tickets = await this.expo.sendPushNotificationsAsync(
        rows.map(({ token, id, version, state, activity_action }) => ({
          to: token,
          _contentAvailable: true,
          priority: "high",
          ttl: 120,
          data: {
            source: "auto-apply-progress",
            attemptId: id,
            state,
            version,
            ...(activity_action ? { activityAction: activity_action } : {}),
          },
        })),
      );
      await Promise.all(
        tickets.map(async (ticket, index) => {
          const { token, id, version, state } = rows[index];
          if (
            ticket.status === "error" &&
            ticket.details?.error !== "DeviceNotRegistered"
          )
            return;
          if (ticket.status === "error" || androidFinished.has(state)) {
            await pool.query(
              "delete from private.auto_apply_android_activities where token = $1 and attempt_id = $2",
              [token, id],
            );
          } else {
            await pool.query(
              "update private.auto_apply_android_activities set delivered_version = greatest(delivered_version, $3), retry_after = now() where token = $1 and attempt_id = $2",
              [token, id, version],
            );
          }
        }),
      );
    } finally {
      this.sendingAndroid = false;
    }
  }

  private providerToken(
    team: string,
    keyId: string,
    secret: string,
    timestamp: number,
  ) {
    const cached = this.authorization;
    if (
      cached?.team === team &&
      cached.keyId === keyId &&
      cached.expires > timestamp
    ) {
      return cached.jwt;
    }
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const message =
      encode({ alg: "ES256", kid: keyId }) +
      "." +
      encode({ iss: team, iat: timestamp });
    const jwt =
      message +
      "." +
      sign("sha256", Buffer.from(message), {
        key: createPrivateKey(secret.replace(/\\n/g, "\n")),
        dsaEncoding: "ieee-p1363",
      }).toString("base64url");
    this.authorization = { team, keyId, expires: timestamp + 45 * 60, jwt };
    return jwt;
  }

  private push(
    client: ClientHttp2Session,
    token: string,
    bundle: string,
    jwt: string,
    payload: unknown,
  ) {
    return new Promise<number>((resolve) => {
      try {
        const request = client.request({
          ":method": "POST",
          ":path": "/3/device/" + token,
          authorization: "bearer " + jwt,
          "apns-topic": bundle + ".push-type.liveactivity",
          "apns-push-type": "liveactivity",
          "apns-priority": "10",
        });
        let status = 0;
        request.on("response", (headers) => {
          status = Number(headers[":status"]);
        });
        request.on("data", () => {});
        const deadline = setTimeout(() => {
          request.close();
          resolve(0);
        }, 5000);
        request.on("end", () => {
          clearTimeout(deadline);
          resolve(status);
        });
        request.on("error", () => {
          clearTimeout(deadline);
          resolve(0);
        });
        request.on("close", () => {
          clearTimeout(deadline);
          resolve(status);
        });
        request.end(JSON.stringify(payload));
      } catch {
        resolve(0);
      }
    });
  }
}
