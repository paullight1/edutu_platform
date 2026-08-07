import { EventEmitter } from "node:events";

jest.mock("node:http2", () => ({ connect: jest.fn() }));
jest.mock("jose", () => ({
  importPKCS8: jest.fn().mockResolvedValue({}),
  SignJWT: class {
    setProtectedHeader() {
      return this;
    }
    setIssuer() {
      return this;
    }
    setIssuedAt() {
      return this;
    }
    sign() {
      return Promise.resolve("provider-auth");
    }
  },
}));

import { connect } from "node:http2";
import {
  ApnsVoipCallProvider,
  FcmCallProvider,
  type NativeCallPayload,
} from "./native-call-providers";

const payload: NativeCallPayload = {
  callId: "call-1",
  groupId: "group-1",
  groupName: "Group",
  title: "Call",
  ringExpiresAt: "2026-08-06T12:00:45.000Z",
  deepLink: "edutu://call-1",
};

describe("native call providers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.APNS_TEAM_ID;
    delete process.env.APNS_KEY_ID;
    delete process.env.APNS_BUNDLE_ID;
    delete process.env.APNS_PRIVATE_KEY;
    delete process.env.FCM_PROJECT_ID;
    delete process.env.FCM_CLIENT_EMAIL;
    delete process.env.FCM_PRIVATE_KEY;
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = originalEnv;
  });

  it("reports missing APNs and FCM credentials as unavailable", async () => {
    await expect(
      new ApnsVoipCallProvider().send("token", payload, 30),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "apns_credentials_missing",
    });
    await expect(
      new FcmCallProvider().send("token", payload, 30),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "fcm_credentials_missing",
    });
  });

  it("marks an APNs Unregistered response stale and closes the session", async () => {
    configureApns();
    const request = new EventEmitter() as any;
    request.setEncoding = jest.fn();
    request.destroy = jest.fn();
    request.end = jest.fn(() => {
      queueMicrotask(() => {
        request.emit("response", { ":status": 410 });
        request.emit("data", JSON.stringify({ reason: "Unregistered" }));
        request.emit("end");
      });
    });
    const client = new EventEmitter() as any;
    client.request = jest.fn(() => request);
    client.close = jest.fn();
    client.destroy = jest.fn();
    (connect as unknown as jest.Mock).mockReturnValue(client);

    await expect(
      new ApnsVoipCallProvider().send("token", payload, 30),
    ).resolves.toEqual({
      status: "stale",
      reason: "Unregistered",
    });
    expect(client.close).toHaveBeenCalledTimes(1);
    expect(client.destroy).not.toHaveBeenCalled();
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        "apns-collapse-id": payload.callId,
        "apns-id": payload.callId,
      }),
    );
  });

  it("clears timeout resources and destroys a hung APNs session", async () => {
    jest.useFakeTimers();
    configureApns();
    const request = new EventEmitter() as any;
    request.setEncoding = jest.fn();
    request.destroy = jest.fn();
    request.end = jest.fn();
    const client = new EventEmitter() as any;
    client.request = jest.fn(() => request);
    client.close = jest.fn();
    client.destroy = jest.fn();
    (connect as unknown as jest.Mock).mockReturnValue(client);

    const pending = new ApnsVoipCallProvider().send("token", payload, 30);
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toEqual({
      status: "unavailable",
      reason: "apns_transport_unavailable",
    });
    expect(request.destroy).toHaveBeenCalledTimes(1);
    expect(client.destroy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});

function configureApns() {
  process.env.APNS_TEAM_ID = "TEAM";
  process.env.APNS_KEY_ID = "KEY";
  process.env.APNS_BUNDLE_ID = "org.edutu.app";
  process.env.APNS_PRIVATE_KEY =
    "-----BEGIN PRIVATE KEY-----\nmock\n-----END PRIVATE KEY-----";
}
