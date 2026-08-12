describe("RealtimeVoiceService", () => {
  it("is available to create authenticated Realtime sessions", () => {
    const serviceModule = "./realtime-voice.service";

    expect(() => require(serviceModule)).not.toThrow();
  });
});
