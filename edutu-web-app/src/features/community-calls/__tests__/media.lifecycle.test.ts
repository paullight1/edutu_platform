import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityCallSignaling } from "../signaling";
import {
  CommunityCallMedia,
  CommunityCallMediaAbortedError,
  runMicrophonePreflight,
} from "../media";

const mediasoupMocks = vi.hoisted(() => ({
  factory: vi.fn(),
}));

vi.mock("mediasoup-client", () => ({
  Device: { factory: (...args: unknown[]) => mediasoupMocks.factory(...args) },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("community call media lifecycle", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    vi.stubGlobal("RTCPeerConnection", class {});
    vi.stubGlobal("WebSocket", class {});
  });

  it("buffers a producer announced while media startup is waiting for the microphone", async () => {
    const microphone = deferred<MediaStream>();
    const localTrack = { enabled: true, stop: vi.fn() } as unknown as MediaStreamTrack;
    const remoteTrack = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const localStream = {
      getAudioTracks: () => [localTrack],
      getTracks: () => [localTrack],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn(() => microphone.promise);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal("MediaStream", class {
      constructor(public readonly tracks: MediaStreamTrack[]) {}
    });

    const producer = {
      id: "local-producer",
      closed: false,
      paused: false,
      pause: vi.fn(),
      resume: vi.fn(),
      close: vi.fn(),
    };
    producer.pause.mockImplementation(() => { producer.paused = true; });
    producer.resume.mockImplementation(() => { producer.paused = false; });
    const consumer = {
      id: "consumer-late",
      closed: false,
      track: remoteTrack,
      close: vi.fn(),
      on: vi.fn(),
    };
    const sendTransport = {
      id: "send-transport",
      direction: "send",
      on: vi.fn(),
      produce: vi.fn().mockResolvedValue(producer),
      close: vi.fn(),
    };
    const receiveTransport = {
      id: "receive-transport",
      direction: "recv",
      on: vi.fn(),
      consume: vi.fn().mockResolvedValue(consumer),
      close: vi.fn(),
    };
    mediasoupMocks.factory.mockResolvedValue({
      load: vi.fn(),
      canProduce: vi.fn(() => true),
      recvRtpCapabilities: {},
      createSendTransport: vi.fn(() => sendTransport),
      createRecvTransport: vi.fn(() => receiveTransport),
    });

    const request = vi.fn(async (action: string) => {
      if (action === "getRouterRtpCapabilities") return { codecs: [] };
      if (action === "createTransport") {
        return {
          id: "transport",
          iceParameters: { usernameFragment: "u", password: "p" },
          iceCandidates: [],
          dtlsParameters: { fingerprints: [{ algorithm: "sha-256", value: "fingerprint" }] },
        };
      }
      if (action === "consume") {
        return {
          id: "consumer-late",
          producerId: "producer-late",
          peerId: "peer-late",
          kind: "audio",
          rtpParameters: {},
          type: "simple",
          producerPaused: false,
        };
      }
      return {};
    });
    const onRemoteTrack = vi.fn();
    const media = new CommunityCallMedia(
      { request } as unknown as CommunityCallSignaling,
      { onRemoteTrack, onRemoteTrackRemoved: vi.fn(), onConnectionIssue: vi.fn() },
    );

    const startPromise = media.start();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    await media.consume("producer-late");
    await media.consume("producer-closed-during-startup");
    media.removeProducer("producer-closed-during-startup");
    microphone.resolve(localStream);
    await startPromise;

    expect(request).toHaveBeenCalledWith(
      "consume",
      expect.objectContaining({ producerId: "producer-late" }),
      expect.anything(),
      expect.any(AbortSignal),
    );
    expect(receiveTransport.consume).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalledWith(
      "consume",
      expect.objectContaining({ producerId: "producer-closed-during-startup" }),
      expect.anything(),
      expect.anything(),
    );
    expect(onRemoteTrack).toHaveBeenCalledWith(expect.objectContaining({
      producerId: "producer-late",
      peerId: "peer-late",
    }));
    media.close();
  });

  it("rejects a cancelled microphone prompt and stops a stream granted afterward", async () => {
    const microphone = deferred<MediaStream>();
    const track = { label: "Late microphone", stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(() => microphone.promise) },
    });
    const controller = new AbortController();
    const preflight = runMicrophonePreflight(controller.signal);

    controller.abort();
    await expect(preflight).rejects.toBeInstanceOf(CommunityCallMediaAbortedError);
    microphone.resolve(stream);
    await Promise.resolve();
    await Promise.resolve();

    expect(track.stop).toHaveBeenCalledOnce();
  });
});
