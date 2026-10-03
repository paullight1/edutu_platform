import { afterEach, expect, it, vi } from "vitest";
import { RealtimeVoiceSession } from "./voiceSession";
afterEach(() => vi.useRealTimers());
it("routes a voice tool call once, preserves its thread and stops tracks on close", async () => {
  let channel!: {
    readyState: string;
    onmessage: ((event: { data: string }) => void) | null;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  const track = { enabled: true, stop: vi.fn() };
  class Peer {
    connectionState = "connected";
    localDescription = { sdp: "v=0" };
    ontrack = null;
    onconnectionstatechange = null;
    addTrack() {}
    createOffer = async () => ({ sdp: "v=0" });
    setLocalDescription = async () => {};
    setRemoteDescription = async () => {};
    close = vi.fn();
    createDataChannel() {
      channel = {
        readyState: "open",
        onmessage: null,
        send: vi.fn(),
        close: vi.fn(),
      };
      return channel;
    }
  }
  const sendMessage = vi.fn().mockResolvedValue({
    threadId: "thread-1",
    assistantMessage: { content: "Here is your next step" },
  });
  let tokenWait: Promise<string> | null = null;
  const transcript = vi.fn();
  const session = new RealtimeVoiceSession(
    {
      userId: "owner",
      getAuthToken: () => tokenWait ?? Promise.resolve("token"),
      handlers: { onUserTranscript: transcript },
      voice: "marin",
      locale: "en",
    },
    {
      rtc: {
        RTCPeerConnection: Peer,
        RTCSessionDescription: class {},
        mediaDevices: {
          getUserMedia: async () => ({
            getTracks: () => [track],
            getAudioTracks: () => [track],
          }),
        },
      } as never,
      sendMessage,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            sdp: "answer",
            expiresAt: new Date(Date.now() + 55000).toISOString(),
          }),
        ),
      apiBaseUrl: "http://api",
    },
  );
  await session.start();
  const event = {
    data: JSON.stringify({
      type: "response.function_call_arguments.done",
      call_id: "call-1",
      name: "ask_edutu",
      arguments: '{"message":"Help me apply"}',
    }),
  };
  channel.onmessage!(event);
  channel.onmessage!(event);
  await new Promise((r) => setTimeout(r, 0));
  expect(sendMessage).toHaveBeenCalledTimes(1);
  expect(channel.send.mock.calls.some(([s]) => s.includes("thread-1"))).toBe(
    true,
  );
  let resolveToken!: (value: string) => void;
  tokenWait = new Promise((resolve) => {
    resolveToken = resolve;
  });
  channel.onmessage!({
    data: JSON.stringify({
      type: "response.function_call_arguments.done",
      call_id: "call-2",
      name: "ask_edutu",
      arguments: '{"message":"Late question"}',
    }),
  });
  session.close();
  resolveToken("token");
  await new Promise((r) => setTimeout(r, 0));
  expect(transcript).toHaveBeenCalledTimes(1);
  expect(sendMessage).toHaveBeenCalledTimes(1);
  expect(track.stop).toHaveBeenCalledOnce();
  expect(channel.close).toHaveBeenCalledOnce();
});
it("requests renewal before the reservation ends", async () => {
  vi.useFakeTimers();
  let ch: { readyState: string; send: () => void; close: () => void };
  class Peer {
    connectionState = "connected";
    localDescription = { sdp: "v=0" };
    ontrack = null;
    onconnectionstatechange = null;
    addTrack() {}
    createOffer = async () => ({ sdp: "v=0" });
    setLocalDescription = async () => {};
    setRemoteDescription = async () => {};
    close() {}
    createDataChannel() {
      ch = { readyState: "open", send() {}, close() {} };
      return ch;
    }
  }
  const expired = vi.fn();
  const session = new RealtimeVoiceSession(
    {
      userId: "owner",
      getAuthToken: async () => "token",
      voice: "marin",
      locale: "en",
      handlers: { onExpiring: expired },
    },
    {
      rtc: {
        RTCPeerConnection: Peer,
        RTCSessionDescription: class {},
        mediaDevices: {
          getUserMedia: async () => ({
            getTracks: () => [],
            getAudioTracks: () => [],
          }),
        },
      } as never,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            sdp: "answer",
            expiresAt: new Date(Date.now() + 55000).toISOString(),
          }),
        ),
      apiBaseUrl: "http://api",
    },
  );
  await session.start();
  await vi.advanceTimersByTimeAsync(54000);
  expect(expired).toHaveBeenCalledOnce();
  session.close();
});
