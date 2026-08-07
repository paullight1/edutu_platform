import { toDatabaseUserId } from "../common/user-id";
import type { PushTokenStore } from "../notifications/push-token.store";
import { NativeCallDeliveryService } from "./native-call-delivery.service";
import type {
  NativeCallPayload,
  NativeCallProviderAdapter,
} from "./native-call-providers";

const payload: NativeCallPayload = {
  callId: "call-1",
  groupId: "group-1",
  groupName: "Group",
  title: "Call",
  ringExpiresAt: "2026-08-06T12:00:45.000Z",
  deepLink: "edutu://call-1",
};

describe("NativeCallDeliveryService", () => {
  it("combines native acceptance, stale cleanup, Expo fallback and unreachable outcomes", async () => {
    const rows = [
      token("1", "native-user", "apns-voip"),
      token("2", "fallback-user", "fcm"),
      token("3", "fallback-user", "expo"),
    ];
    const store = fakeStore(rows);
    const notifications = {
      broadcast: jest.fn().mockResolvedValue({ push: { sent: 1 } }),
    };
    const providers: NativeCallProviderAdapter[] = [
      {
        provider: "apns-voip",
        send: jest.fn().mockResolvedValue({ status: "accepted" }),
      },
      {
        provider: "fcm",
        send: jest
          .fn()
          .mockResolvedValue({ status: "stale", reason: "UNREGISTERED" }),
      },
    ];
    const service = new NativeCallDeliveryService(
      notifications as any,
      store,
      providers,
    );

    const result = await service.ring(
      ["native-user", "fallback-user", "unreachable-user"],
      payload,
      30,
    );
    expect(result.outcomes).toEqual([
      { userId: "native-user", status: "notified" },
      { userId: "fallback-user", status: "notified" },
      { userId: "unreachable-user", status: "unreachable" },
    ]);
    expect(result.retryableUserIds).toEqual([]);
    expect(store.deleteByIds).toHaveBeenCalledWith(["2"]);
    expect(notifications.broadcast).toHaveBeenCalledWith(
      "system",
      expect.objectContaining({ targetUserIds: ["fallback-user"] }),
    );
  });

  it("bounds concurrent native sends at eight", async () => {
    const rows = Array.from({ length: 20 }, (_, index) =>
      token(String(index), "many-devices", "fcm"),
    );
    let active = 0;
    let maximum = 0;
    const provider: NativeCallProviderAdapter = {
      provider: "fcm",
      send: jest.fn().mockImplementation(async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return { status: "accepted" };
      }),
    };
    const service = new NativeCallDeliveryService(
      { broadcast: jest.fn() } as any,
      fakeStore(rows),
      [provider],
    );
    await service.ring(["many-devices"], payload, 30);
    expect(maximum).toBeLessThanOrEqual(8);
    expect(maximum).toBeGreaterThan(1);
  });

  it("keeps transient provider failures pending for a leased retry", async () => {
    const provider: NativeCallProviderAdapter = {
      provider: "fcm",
      send: jest.fn().mockResolvedValue({
        status: "unavailable",
        reason: "fcm_transport_unavailable",
      }),
    };
    const service = new NativeCallDeliveryService(
      { broadcast: jest.fn() } as any,
      fakeStore([token("1", "retry-user", "fcm")]),
      [provider],
    );

    const result = await service.ring(["retry-user"], payload, 30);

    expect(result.outcomes).toEqual([]);
    expect(result.retryableUserIds).toEqual(["retry-user"]);
  });
});

function token(id: string, rawUserId: string, provider: string) {
  return {
    id,
    userId: toDatabaseUserId(rawUserId),
    provider,
    token: `secret-${id}`,
    device: {},
    lastSeenAt: new Date(),
    createdAt: new Date(),
  } as any;
}

function fakeStore(rows: any[]): PushTokenStore & {
  deleteByIds: jest.Mock;
} {
  return {
    claim: jest.fn(),
    listForUsers: jest
      .fn()
      .mockImplementation(async (ids: string[]) =>
        rows.filter((row) => ids.includes(row.userId)),
      ),
    deleteByIds: jest.fn().mockResolvedValue(undefined),
  };
}
