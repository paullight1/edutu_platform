import { Expo } from "expo-server-sdk";
import { generateKeyPairSync } from "node:crypto";
import { EventEmitter } from "node:events";
import { connect } from "node:http2";
import { pool } from "../db";
import {
  AutoApplyActivityService,
  autoApplyActivityPayload,
} from "./auto-apply-activity.service";

jest.mock("../db", () => ({ pool: { query: jest.fn() } }));
jest.mock("node:http2", () => ({ connect: jest.fn() }));

it("uses the Expo widgets state format without application data", () => {
  const { aps } = autoApplyActivityPayload("needs_input", 123);
  expect(aps.event).toBe("update");
  expect(aps["content-state"].name).toBe("AutoApplyProgress");
  expect(JSON.parse(aps["content-state"].props)).toEqual({
    status: "Your input is needed",
    actionRequired: true,
  });
  expect(aps).not.toHaveProperty("stale-date");
  expect(aps).not.toHaveProperty("dismissal-date");
});

it.each(["submitted", "cancelled", "failed", "unconfirmed"])(
  "dismisses a %s activity immediately",
  (state) => {
    expect(autoApplyActivityPayload(state, 100).aps).toMatchObject({
      event: "end",
      "dismissal-date": 99,
    });
  },
);

it("ages stale work while the attempt is running", () => {
  expect(autoApplyActivityPayload("running", 100).aps).toMatchObject({
    event: "update",
    "stale-date": 220,
  });
});

it("keeps the public opportunity title on the live activity when its state changes", () => {
  const title = "Example Scholarship";
  const json = autoApplyActivityPayload("needs_review", 100, title).aps[
    "content-state"
  ].props;
  expect(JSON.parse(json)).toEqual({
    status: "Ready for review",
    actionRequired: true,
    title,
  });
});

it("uses a fixed next action for a provider checkpoint", () => {
  const json = autoApplyActivityPayload(
    "needs_input",
    100,
    "Example Scholarship",
    "provider_step",
  ).aps["content-state"].props;
  expect(JSON.parse(json)).toEqual({
    status: "Complete a provider step",
    actionRequired: true,
    title: "Example Scholarship",
  });
});

it("retires a rejected Android binding and retries a temporary gateway failure", async () => {
  const env = process.env;
  process.env = { ...env, AUTO_APPLY_PILOT_OPPORTUNITIES: "fixture" };
  const query = jest.spyOn(pool, "query");
  const inactive = {
    token: "ExpoPushToken[retired]",
    id: "retired",
    version: 3,
    state: "needs_input",
  };
  const pending = {
    token: "ExpoPushToken[retry]",
    id: "retry",
    version: 5,
    state: "submitted",
  };
  query.mockImplementation(
    (statement) =>
      Promise.resolve({
        rows: String(statement).includes("where activity.delivered_version")
          ? [inactive, pending]
          : [],
      }) as never,
  );
  const send = jest
    .spyOn(Expo.prototype, "sendPushNotificationsAsync")
    .mockResolvedValueOnce([
      {
        status: "error",
        message: "Device expired",
        details: { error: "DeviceNotRegistered" },
      },
      {
        status: "error",
        message: "Try later",
        details: { error: "MessageRateExceeded" },
      },
    ])
    .mockResolvedValueOnce([{ status: "ok", id: "accepted-retry" }]);
  const service = new AutoApplyActivityService();
  try {
    await service.sendAndroidUpdates();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("and attempt_id = $2"),
      [inactive.token, inactive.id],
    );
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining("and attempt_id = $2"),
      [pending.token, pending.id],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("retry_after = now() + interval '45 seconds'"),
    );
    query.mockImplementation(
      (statement) =>
        Promise.resolve({
          rows: String(statement).includes("where activity.delivered_version")
            ? [pending]
            : [],
        }) as never,
    );
    await service.sendAndroidUpdates();
    expect(send).toHaveBeenLastCalledWith([
      expect.objectContaining({
        to: pending.token,
        data: {
          source: "auto-apply-progress",
          attemptId: pending.id,
          state: "submitted",
          version: pending.version,
        },
      }),
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("and attempt_id = $2"),
      [pending.token, pending.id],
    );
  } finally {
    process.env = env;
    query.mockReset();
    send.mockRestore();
  }
});

it.each(["failed", "cancelled"])(
  "preserves an Android progress binding after %s so the same attempt can resume",
  async (state) => {
    const env = process.env;
    process.env = { ...env, AUTO_APPLY_PILOT_OPPORTUNITIES: "fixture" };
    const query = jest.spyOn(pool, "query");
    const attempt = {
      token: "ExpoPushToken[device]",
      id: "attempt",
      version: 7,
      state,
    };
    query.mockImplementation(
      (statement) =>
        Promise.resolve({
          rows: String(statement).includes("where activity.delivered_version")
            ? [attempt]
            : [],
        }) as never,
    );
    const send = jest
      .spyOn(Expo.prototype, "sendPushNotificationsAsync")
      .mockResolvedValue([{ status: "ok", id: "accepted" }]);
    const service = new AutoApplyActivityService();
    try {
      await service.sendAndroidUpdates();
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("set delivered_version = greatest"),
        [attempt.token, attempt.id, 7],
      );
      expect(query).not.toHaveBeenCalledWith(
        expect.stringContaining(
          "delete from private.auto_apply_android_activities where token",
        ),
        [attempt.token, attempt.id],
      );
      attempt.version = 8;
      attempt.state = "queued";
      await service.sendAndroidUpdates();
      expect(send).toHaveBeenLastCalledWith([
        expect.objectContaining({
          to: attempt.token,
          data: {
            source: "auto-apply-progress",
            attemptId: attempt.id,
            state: "queued",
            version: 8,
          },
        }),
      ]);
    } finally {
      process.env = env;
      query.mockReset();
      send.mockRestore();
    }
  },
);

it("retains ActivityKit progress on APNs failure and retires an expired token", async () => {
  const env = process.env;
  const { privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  process.env = {
    ...env,
    AUTO_APPLY_APNS_TEAM_ID: "fixture-team",
    AUTO_APPLY_APNS_KEY_ID: "fixture-key",
    AUTO_APPLY_APNS_PRIVATE_KEY: privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    AUTO_APPLY_APNS_BUNDLE_ID: "com.edutu.fixture",
    AUTO_APPLY_APNS_SANDBOX: "true",
  };
  const query = jest.spyOn(pool, "query");
  query.mockResolvedValueOnce({ rows: [] } as never).mockResolvedValueOnce({
    rows: [
      { token: "expired", state: "needs_input", version: 3, title: null },
      { token: "pending", state: "submitted", version: 4, title: null },
    ],
  } as never);
  const request = jest.fn(({ ":path": path }: { ":path": string }) =>
    Object.assign(new EventEmitter(), {
      end(this: EventEmitter) {
        queueMicrotask(() => {
          this.emit("response", {
            ":status": path.endsWith("/expired") ? 410 : 503,
          });
          this.emit("end");
        });
      },
      close: jest.fn(),
    }),
  );
  jest
    .mocked(connect)
    .mockReturnValue({ request, on: jest.fn(), destroy: jest.fn() } as never);
  try {
    await new AutoApplyActivityService().sendUpdates();
    expect(connect).toHaveBeenCalledWith("https://api.sandbox.push.apple.com");
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        ":method": "POST",
        ":path": "/3/device/pending",
        "apns-topic": "com.edutu.fixture.push-type.liveactivity",
        "apns-push-type": "liveactivity",
      }),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "delete from private.auto_apply_live_activities where token",
      ),
      ["expired"],
    );
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining("where token = $1"),
      ["pending"],
    );
  } finally {
    process.env = env;
    query.mockReset();
    jest.mocked(connect).mockReset();
  }
});
