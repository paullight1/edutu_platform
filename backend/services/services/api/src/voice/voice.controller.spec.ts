import { VoiceController } from "./voice.controller";
import type { RealtimeVoiceService } from "./realtime-voice.service";

describe("VoiceController", () => {
  it("creates a Realtime session for the authenticated principal", async () => {
    const service = {
      createSession: jest.fn(async () => ({
        sdp: "answer-sdp",
        callId: "rtc_123",
        expiresAt: "2026-08-30T17:00:55.000Z",
      })),
    };
    const controller = new VoiceController(
      service as unknown as RealtimeVoiceService,
    );

    await expect(
      controller.createRealtimeSession("canonical-user", {
        sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111",
        voice: "cedar",
        locale: "fr",
      }),
    ).resolves.toMatchObject({ callId: "rtc_123" });
    expect(service.createSession).toHaveBeenCalledWith("canonical-user", {
      sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111",
      voice: "cedar",
      locale: "fr",
    });
  });
});
