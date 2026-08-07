import { CommunityCallGatewayClient } from "./community-call-gateway.client";
import type { CommunityCallsConfig } from "./community-calls.types";

const config: CommunityCallsConfig = {
  enabled: true,
  gatewayUrl: "http://voice.internal:4000",
  tokenSecret: "x".repeat(32),
  issuer: "edutu-api",
  joinAudience: "edutu-voice",
  gatewayAudience: "edutu-voice-internal",
  callbackIssuer: "edutu-voice",
  callbackAudience: "edutu-api-internal",
  gatewayTimeoutMs: 1000,
  joinTokenTtlSeconds: 60,
  startEarlyMinutes: 5,
  startLateMinutes: 30,
  reminderMinutes: 15,
  ringSeconds: 45,
  maximumDurationMinutes: 120,
  participantCap: 3,
  lifecycleBatchSize: 25,
  startingTimeoutMinutes: 5,
};

describe("CommunityCallGatewayClient", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sends the gateway's strict empty prepare body and trusts its signalingUrl", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        nodeId: "node-1",
        roomId: "room-1",
        signalingUrl: "wss://voice.edutu.test/ws",
      }),
    } as Response);
    const client = new CommunityCallGatewayClient(
      {
        signGatewayInternalToken: jest.fn().mockResolvedValue("internal-jwt"),
      } as any,
      config,
    );

    const room = await client.prepare({
      callId: "11111111-1111-4111-8111-111111111111",
      groupId: "22222222-2222-4222-8222-222222222222",
      participantCap: 3,
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({});
    expect(room.signalingUrl).toBe("wss://voice.edutu.test/ws");
  });

  it("rejects an HTTP signaling URL instead of deriving a public WSS URL", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        nodeId: "node-1",
        roomId: "room-1",
        signalingUrl: "https://voice.internal/ws",
      }),
    } as Response);
    const client = new CommunityCallGatewayClient(
      {
        signGatewayInternalToken: jest.fn().mockResolvedValue("internal-jwt"),
      } as any,
      config,
    );
    await expect(
      client.prepare({ callId: "call", groupId: "group", participantCap: 3 }),
    ).rejects.toMatchObject({ code: "MEDIA_UNAVAILABLE" });
  });
});
