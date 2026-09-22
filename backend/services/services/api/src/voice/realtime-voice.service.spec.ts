import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { MonetizationService } from "../monetization/monetization.service";
import {
  OPENAI_REALTIME_VOICES,
  RealtimeVoiceService,
} from "./realtime-voice.service";

const SDP_OFFER = [
  "v=0",
  "o=- 4611731400430051336 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
  "a=rtpmap:111 opus/48000/2",
].join("\r\n");

function charge() {
  return {
    userId: "user-db-id",
    action: "voicePerMinute" as const,
    charged: 0,
    ledgerId: null,
    chatCounted: false,
    actionCredited: 0,
    voiceMinutesCredited: 1,
    remaining: null,
    day: "2026-08-30",
  };
}

function buildService(response?: Response) {
  const monetization = {
    meter: jest.fn(async () => charge()),
    refund: jest.fn(async () => undefined),
  };
  const fetchMock = jest.fn(
    async () =>
      response ??
      new Response("answer-sdp", {
        status: 201,
        headers: { Location: "/v1/realtime/calls/rtc_edutu_123" },
      }),
  );
  const service = new RealtimeVoiceService(
    monetization as unknown as MonetizationService,
    fetchMock as typeof fetch,
  );
  return { service, monetization, fetchMock };
}

describe("RealtimeVoiceService", () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_REALTIME_MODEL;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-server-only-key";
    delete process.env.OPENAI_REALTIME_MODEL;
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.OPENAI_REALTIME_MODEL;
    else process.env.OPENAI_REALTIME_MODEL = originalModel;
  });

  it("creates a metered unified WebRTC call configured for low-latency Edutu turns", async () => {
    const now = Date.now();
    jest.spyOn(Date, "now").mockReturnValue(now);
    const { service, monetization, fetchMock } = buildService();

    const result = await service.createSession("user-db-id", {
      sdp: SDP_OFFER,
      voice: "marin",
      locale: "pt-BR",
    });

    expect(monetization.meter).toHaveBeenCalledWith(
      "user-db-id",
      "voicePerMinute",
      1,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/realtime/calls");
    expect(request?.method).toBe("POST");
    expect(request?.headers).toMatchObject({
      Authorization: "Bearer test-server-only-key",
      "OpenAI-Safety-Identifier": expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(request?.headers?.["OpenAI-Safety-Identifier"]).not.toContain(
      "user-db-id",
    );

    const body = request?.body as FormData;
    expect(body.get("sdp")).toBe(SDP_OFFER);
    const session = JSON.parse(String(body.get("session")));
    expect(session).toMatchObject({
      type: "realtime",
      model: "gpt-realtime-2.1",
      output_modalities: ["audio"],
      audio: {
        input: {
          noise_reduction: { type: "near_field" },
          transcription: { model: "gpt-live-transcribe", language: "pt" },
          turn_detection: {
            type: "semantic_vad",
            create_response: true,
            interrupt_response: true,
          },
        },
        output: { voice: "marin" },
      },
      tool_choice: "required",
      tools: [
        {
          type: "function",
          name: "ask_edutu",
          parameters: {
            type: "object",
            additionalProperties: false,
            required: ["message"],
            properties: { message: { type: "string" } },
          },
        },
      ],
    });
    expect(session.instructions).toContain("ask_edutu");
    expect(session.instructions).toContain("Never answer the user directly");
    expect(result).toEqual({
      sdp: "answer-sdp",
      callId: "rtc_edutu_123",
      expiresAt: new Date(now + 55_000).toISOString(),
    });
  });

  it.each(OPENAI_REALTIME_VOICES)(
    "accepts the supported built-in Realtime voice %s",
    async (voice) => {
      const { service, fetchMock } = buildService();

      await service.createSession("user-db-id", { sdp: SDP_OFFER, voice });

      const body = fetchMock.mock.calls[0][1]?.body as FormData;
      const session = JSON.parse(String(body.get("session")));
      expect(session.audio.output.voice).toBe(voice);
    },
  );

  it("rejects malformed, oversized, and unsupported session inputs before charging", async () => {
    const { service, monetization, fetchMock } = buildService();

    await expect(
      service.createSession("user-db-id", { sdp: "not-sdp" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createSession("user-db-id", {
        sdp: `v=0\r\n${"x".repeat(70_000)}`,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createSession("user-db-id", {
        sdp: SDP_OFFER,
        voice: "nova",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(monetization.meter).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed before charging when the server key is unavailable", async () => {
    delete process.env.OPENAI_API_KEY;
    const { service, monetization, fetchMock } = buildService();

    await expect(
      service.createSession("user-db-id", { sdp: SDP_OFFER }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(monetization.meter).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refunds the reserved minute when OpenAI rejects session setup", async () => {
    const { service, monetization } = buildService(
      new Response("provider unavailable", { status: 503 }),
    );

    await expect(
      service.createSession("user-db-id", { sdp: SDP_OFFER }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(monetization.refund).toHaveBeenCalledWith(
      expect.objectContaining({ voiceMinutesCredited: 1 }),
    );
  });

  it("refunds the reserved minute when the provider transport fails", async () => {
    const monetization = {
      meter: jest.fn(async () => charge()),
      refund: jest.fn(async () => undefined),
    };
    const service = new RealtimeVoiceService(
      monetization as unknown as MonetizationService,
      jest.fn(async () => {
        throw new Error("offline");
      }) as typeof fetch,
    );

    await expect(
      service.createSession("user-db-id", { sdp: SDP_OFFER }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(monetization.refund).toHaveBeenCalledTimes(1);
  });
});
