import { Inject, Injectable } from "@nestjs/common";
import { toDatabaseUserId } from "../common/user-id";
import { NotificationsService } from "../notifications/notifications.service";
import {
  PUSH_TOKEN_STORE,
  type PushTokenStore,
} from "../notifications/push-token.store";
import {
  ApnsVoipCallProvider,
  FcmCallProvider,
  type NativeCallPayload,
  type NativeCallProviderAdapter,
} from "./native-call-providers";
import type { DeliveryOutcome } from "./community-calls.repository";

export type RingDeliverySummary = {
  outcomes: DeliveryOutcome[];
  retryableUserIds: string[];
  telemetry: Record<string, number>;
};

export const NATIVE_CALL_PROVIDERS = Symbol("NATIVE_CALL_PROVIDERS");

@Injectable()
export class NativeCallDeliveryService {
  private readonly adapters: Map<string, NativeCallProviderAdapter>;

  constructor(
    private readonly notifications: NotificationsService,
    @Inject(PUSH_TOKEN_STORE) private readonly pushTokens: PushTokenStore,
    @Inject(NATIVE_CALL_PROVIDERS)
    providers: NativeCallProviderAdapter[] = [
      new ApnsVoipCallProvider(),
      new FcmCallProvider(),
    ],
  ) {
    this.adapters = new Map(
      providers.map((adapter) => [adapter.provider, adapter]),
    );
  }

  async ring(
    userIds: string[],
    payload: NativeCallPayload,
    ttlSeconds: number,
  ): Promise<RingDeliverySummary> {
    const uniqueUserIds = Array.from(new Set(userIds));
    if (!uniqueUserIds.length)
      return { outcomes: [], retryableUserIds: [], telemetry: {} };
    const rawByDatabaseId = new Map(
      uniqueUserIds.map((userId) => [toDatabaseUserId(userId), userId]),
    );
    const rows = await this.pushTokens.listForUsers(
      Array.from(rawByDatabaseId.keys()),
    );
    const rowsByUser = new Map<string, typeof rows>();
    for (const row of rows) {
      const raw = rawByDatabaseId.get(row.userId);
      if (!raw) continue;
      const list = rowsByUser.get(raw) ?? [];
      list.push(row);
      rowsByUser.set(raw, list);
    }

    const telemetry: Record<string, number> = {};
    const staleIds: string[] = [];
    const fallbackUsers: string[] = [];
    const retryableUserIds: string[] = [];
    const outcomes: DeliveryOutcome[] = [];
    const nativeResults = await mapWithConcurrency(
      uniqueUserIds.flatMap((userId) =>
        (rowsByUser.get(userId) ?? [])
          .filter((token) => this.adapters.has(token.provider))
          .map((token) => ({ userId, token })),
      ),
      8,
      async ({ userId, token }) => ({
        userId,
        token,
        result: await this.safeSend(
          this.adapters.get(token.provider)!,
          token.token,
          payload,
          ttlSeconds,
        ),
      }),
    );
    const resultsByUser = new Map<string, typeof nativeResults>();
    for (const result of nativeResults) {
      const list = resultsByUser.get(result.userId) ?? [];
      list.push(result);
      resultsByUser.set(result.userId, list);
      telemetry[`${result.token.provider}.${result.result.status}`] =
        (telemetry[`${result.token.provider}.${result.result.status}`] ?? 0) +
        1;
      if (result.result.status === "stale") staleIds.push(result.token.id);
    }

    for (const userId of uniqueUserIds) {
      const tokens = rowsByUser.get(userId) ?? [];
      const accepted = (resultsByUser.get(userId) ?? []).some(
        (item) => item.result.status === "accepted",
      );
      if (accepted) {
        outcomes.push({ userId, status: "notified" });
      } else if (tokens.some((token) => token.provider === "expo")) {
        fallbackUsers.push(userId);
        telemetry["expo.fallback"] = (telemetry["expo.fallback"] ?? 0) + 1;
      } else if (
        (resultsByUser.get(userId) ?? []).some(
          (item) => item.result.status === "unavailable",
        )
      ) {
        retryableUserIds.push(userId);
        telemetry.retryable = (telemetry.retryable ?? 0) + 1;
      } else {
        outcomes.push({ userId, status: "unreachable" });
        telemetry.unreachable = (telemetry.unreachable ?? 0) + 1;
      }
    }

    if (staleIds.length) {
      await this.pushTokens.deleteByIds(staleIds);
    }
    if (fallbackUsers.length) {
      const fallbackResults = await mapWithConcurrency(
        fallbackUsers,
        8,
        async (userId) => {
          const result = await this.notifications.broadcast("system", {
            title: payload.groupName,
            body: `${payload.title} is starting now`,
            kind: "community-call-started",
            severity: "critical",
            audience: "specific",
            targetUserIds: [userId],
            channels: { inApp: false, push: true, email: false },
            metadata: {
              callId: payload.callId,
              groupId: payload.groupId,
              ringExpiresAt: payload.ringExpiresAt,
              deepLink: payload.deepLink,
              pushTtlSeconds: ttlSeconds,
              pushProvider: "expo",
              bypassQuietHours: true,
            },
          });
          return {
            userId,
            sent: Number("push" in result ? (result.push?.sent ?? 0) : 0),
          };
        },
      );
      for (const result of fallbackResults) {
        const delivered = result.sent > 0;
        outcomes.push({
          userId: result.userId,
          status: delivered ? "notified" : "unreachable",
        });
        const telemetryKey = `expo.${delivered ? "accepted" : "rejected"}`;
        telemetry[telemetryKey] = (telemetry[telemetryKey] ?? 0) + 1;
      }
    }
    const outcomeByUser = new Map(outcomes.map((item) => [item.userId, item]));
    return {
      outcomes: uniqueUserIds
        .map((userId) => outcomeByUser.get(userId))
        .filter((outcome): outcome is DeliveryOutcome => Boolean(outcome)),
      retryableUserIds,
      telemetry,
    };
  }

  private async safeSend(
    adapter: NativeCallProviderAdapter,
    token: string,
    payload: NativeCallPayload,
    ttlSeconds: number,
  ) {
    try {
      return await adapter.send(token, payload, ttlSeconds);
    } catch {
      return {
        status: "unavailable",
        reason: "provider_adapter_failed",
      } as const;
    }
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
  return results;
}
