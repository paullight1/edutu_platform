import type {
  Consumer,
  Device,
  Producer,
  RtpCapabilities,
  RtpParameters,
  Transport,
  TransportOptions,
} from "mediasoup-client/types";
import { z } from "zod";
import {
  consumeResponseSchema,
  emptyResponseSchema,
  producedAudioSchema,
  rtpCapabilitiesSchema,
  transportOptionsSchema,
  type CommunityCallSignaling,
} from "./signaling";

export type BrowserMediaSupport =
  | { supported: true }
  | { supported: false; reason: string };

export type MicrophonePreflightResult =
  | { ok: true; label: string }
  | { ok: false; code: "denied" | "missing" | "busy" | "unavailable"; message: string };

export interface RemoteAudioTrack {
  peerId: string;
  producerId: string;
  stream: MediaStream;
}

export class CommunityCallMediaAbortedError extends Error {
  constructor() {
    super("Voice media startup was cancelled.");
    this.name = "CommunityCallMediaAbortedError";
  }
}

export function detectBrowserMediaSupport(): BrowserMediaSupport {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { supported: false, reason: "Voice calling requires a browser." };
  }
  if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return { supported: false, reason: "Voice calling requires a secure HTTPS connection." };
  }
  if (
    !navigator.mediaDevices?.getUserMedia ||
    typeof RTCPeerConnection === "undefined" ||
    typeof WebSocket === "undefined"
  ) {
    return {
      supported: false,
      reason: "This browser does not support the audio technology used for community calls.",
    };
  }
  return { supported: true };
}

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

function stopStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

async function getUserMediaAbortSafe(
  constraints: MediaStreamConstraints,
  signal?: AbortSignal,
): Promise<MediaStream> {
  if (signal?.aborted) throw new CommunityCallMediaAbortedError();

  const mediaPromise = navigator.mediaDevices.getUserMedia(constraints);
  if (!signal) return mediaPromise;

  return new Promise<MediaStream>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", handleAbort);
    const handleAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new CommunityCallMediaAbortedError());
    };

    signal.addEventListener("abort", handleAbort, { once: true });
    void mediaPromise.then(
      (stream) => {
        if (settled || signal.aborted) {
          stopStream(stream);
          return;
        }
        settled = true;
        cleanup();
        resolve(stream);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}

function linkedAbortSignal(
  first: AbortSignal,
  second?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  if (!second) return { signal: first, cleanup: () => undefined };

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (first.aborted || second.aborted) controller.abort();
  else {
    first.addEventListener("abort", abort, { once: true });
    second.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      first.removeEventListener("abort", abort);
      second.removeEventListener("abort", abort);
    },
  };
}

export async function runMicrophonePreflight(
  signal?: AbortSignal,
): Promise<MicrophonePreflightResult> {
  const support = detectBrowserMediaSupport();
  if (!support.supported) {
    return { ok: false, code: "unavailable", message: support.reason };
  }

  let stream: MediaStream | null = null;
  try {
    stream = await getUserMediaAbortSafe(
      { audio: AUDIO_CONSTRAINTS, video: false },
      signal,
    );
    const track = stream.getAudioTracks()[0];
    if (!track) {
      return { ok: false, code: "missing", message: "No microphone was found." };
    }
    return { ok: true, label: track.label || "Default microphone" };
  } catch (error) {
    if (error instanceof CommunityCallMediaAbortedError) throw error;
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return {
        ok: false,
        code: "denied",
        message: "Microphone access is blocked. Allow it in your browser settings, then try again.",
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return { ok: false, code: "missing", message: "No microphone was found." };
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return {
        ok: false,
        code: "busy",
        message: "Your microphone is being used by another app or tab.",
      };
    }
    return {
      ok: false,
      code: "unavailable",
      message: "The microphone could not be started. Check your device and try again.",
    };
  } finally {
    if (stream) stopStream(stream);
  }
}

interface MediaCallbacks {
  onRemoteTrack: (track: RemoteAudioTrack) => void;
  onRemoteTrackRemoved: (producerId: string) => void;
  onConnectionIssue: () => void;
}

export class CommunityCallMedia {
  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private receiveTransport: Transport | null = null;
  private producer: Producer | null = null;
  private microphoneTrack: MediaStreamTrack | null = null;
  private readonly consumers = new Map<string, Consumer>();
  private readonly pendingProducerIds = new Set<string>();
  private readonly consumingProducerIds = new Set<string>();
  private readonly closedProducerIds = new Set<string>();
  private readonly lifecycleController = new AbortController();
  private closed = false;
  private ready = false;

  constructor(
    private readonly signaling: CommunityCallSignaling,
    private readonly callbacks: MediaCallbacks,
  ) {}

  async start(signal?: AbortSignal): Promise<void> {
    const support = detectBrowserMediaSupport();
    if (!support.supported) throw new Error(support.reason);

    const linked = linkedAbortSignal(this.lifecycleController.signal, signal);
    try {
      this.assertActive(linked.signal);
      const { Device } = await import("mediasoup-client");
      this.assertActive(linked.signal);
      const device = await Device.factory();
      this.assertActive(linked.signal);
      this.device = device;

      const routerRtpCapabilities = await this.signaling.request(
        "getRouterRtpCapabilities",
        {},
        rtpCapabilitiesSchema,
        linked.signal,
      );
      this.assertActive(linked.signal);
      await device.load({ routerRtpCapabilities: routerRtpCapabilities as RtpCapabilities });
      this.assertActive(linked.signal);
      if (!device.canProduce("audio")) {
        throw new Error("This browser cannot send audio to the call.");
      }

      const [sendOptions, receiveOptions] = await Promise.all([
        this.signaling.request(
          "createTransport",
          { direction: "send" },
          transportOptionsSchema,
          linked.signal,
        ),
        this.signaling.request(
          "createTransport",
          { direction: "recv" },
          transportOptionsSchema,
          linked.signal,
        ),
      ]);
      this.assertActive(linked.signal);

      this.sendTransport = device.createSendTransport(
        this.normalizeTransportOptions(sendOptions),
      );
      this.receiveTransport = device.createRecvTransport(
        this.normalizeTransportOptions(receiveOptions),
      );
      this.bindTransport(this.sendTransport);
      this.bindTransport(this.receiveTransport);

      const stream = await getUserMediaAbortSafe(
        { audio: AUDIO_CONSTRAINTS, video: false },
        linked.signal,
      );
      this.assertActive(linked.signal, stream);
      const track = stream.getAudioTracks()[0];
      if (!track) {
        stopStream(stream);
        throw new Error("No microphone audio track was available.");
      }
      this.microphoneTrack = track;
      track.enabled = false;
      const producer = await this.sendTransport.produce({
        track,
        stopTracks: true,
        disableTrackOnPause: true,
        zeroRtpOnPause: true,
        appData: { source: "microphone" },
      });
      this.producer = producer;
      this.assertActive(linked.signal);
      await this.setMuted(true, linked.signal);
      this.assertActive(linked.signal);
      this.ready = true;
      await this.flushPendingProducers();
    } catch (error) {
      this.close();
      throw error;
    } finally {
      linked.cleanup();
    }
  }

  async consume(producerId: string): Promise<void> {
    if (
      this.closed ||
      this.closedProducerIds.has(producerId) ||
      this.consumers.has(producerId)
    ) return;
    if (!this.ready || !this.device || !this.receiveTransport) {
      this.pendingProducerIds.add(producerId);
      return;
    }
    if (this.consumingProducerIds.has(producerId)) return;
    this.consumingProducerIds.add(producerId);

    try {
      const data = await this.signaling.request(
        "consume",
        {
          producerId,
          transportId: this.receiveTransport.id,
          rtpCapabilities: this.device.recvRtpCapabilities,
        },
        consumeResponseSchema,
        this.lifecycleController.signal,
      );
      if (
        this.closed ||
        this.closedProducerIds.has(producerId) ||
        this.consumers.has(producerId)
      ) return;

      const consumer = await this.receiveTransport.consume({
        id: data.id,
        producerId: data.producerId,
        kind: data.kind,
        rtpParameters: data.rtpParameters as RtpParameters,
        appData: { peerId: data.peerId },
      });
      if (this.closed || this.closedProducerIds.has(producerId)) {
        consumer.close();
        return;
      }
      this.consumers.set(producerId, consumer);
      consumer.on("transportclose", () => this.removeConsumer(producerId));
      consumer.on("trackended", () => this.removeConsumer(producerId));

      try {
        await this.signaling.request(
          "resumeConsumer",
          { consumerId: consumer.id },
          emptyResponseSchema,
          this.lifecycleController.signal,
        );
      } catch (error) {
        this.removeConsumer(producerId);
        throw error;
      }
      if (this.closed) return;
      this.callbacks.onRemoteTrack({
        peerId: data.peerId,
        producerId,
        stream: new MediaStream([consumer.track]),
      });
    } finally {
      this.consumingProducerIds.delete(producerId);
    }
  }

  async setMuted(muted: boolean, signal?: AbortSignal): Promise<void> {
    const producer = this.producer;
    if (!producer || producer.closed) throw new Error("Your microphone is not connected.");

    const linked = linkedAbortSignal(this.lifecycleController.signal, signal);
    try {
      this.assertActive(linked.signal);
      if (muted) {
        if (!producer.paused) producer.pause();
        if (this.microphoneTrack) this.microphoneTrack.enabled = false;
        await this.signaling.request(
          "pauseProducer",
          { producerId: producer.id },
          emptyResponseSchema,
          linked.signal,
        );
        return;
      }

      if (this.microphoneTrack) this.microphoneTrack.enabled = true;
      if (producer.paused) producer.resume();
      try {
        await this.signaling.request(
          "resumeProducer",
          { producerId: producer.id },
          emptyResponseSchema,
          linked.signal,
        );
      } catch (error) {
        producer.pause();
        if (this.microphoneTrack) this.microphoneTrack.enabled = false;
        throw error;
      }
    } finally {
      linked.cleanup();
    }
  }

  removeProducer(producerId: string): void {
    this.closedProducerIds.add(producerId);
    this.pendingProducerIds.delete(producerId);
    this.removeConsumer(producerId);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    this.lifecycleController.abort();
    this.pendingProducerIds.clear();
    this.consumingProducerIds.clear();
    this.closedProducerIds.clear();
    this.producer?.close();
    this.producer = null;
    this.microphoneTrack?.stop();
    this.microphoneTrack = null;
    this.consumers.forEach((consumer) => consumer.close());
    this.consumers.clear();
    this.sendTransport?.close();
    this.receiveTransport?.close();
    this.sendTransport = null;
    this.receiveTransport = null;
    this.device = null;
  }

  private bindTransport(transport: Transport): void {
    transport.on("connect", ({ dtlsParameters }, callback, errback) => {
      void this.signaling
        .request(
          "connectTransport",
          { transportId: transport.id, dtlsParameters },
          emptyResponseSchema,
          this.lifecycleController.signal,
        )
        .then(() => callback(), errback);
    });

    if (transport.direction === "send") {
      transport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
        if (kind !== "audio") {
          errback(new Error("Only audio producers are allowed."));
          return;
        }
        void this.signaling
          .request(
            "produceAudio",
            { transportId: transport.id, rtpParameters },
            producedAudioSchema,
            this.lifecycleController.signal,
          )
          .then(({ id }) => callback({ id }), errback);
      });
    }

    transport.on("connectionstatechange", (state) => {
      if (state === "failed" || state === "disconnected") {
        this.callbacks.onConnectionIssue();
      }
    });
  }

  private normalizeTransportOptions(
    options: z.infer<typeof transportOptionsSchema>,
  ): TransportOptions {
    return {
      ...options,
      iceCandidates: options.iceCandidates.map((candidate) => ({
        ...candidate,
        ip: candidate.ip ?? candidate.address,
      })),
    } as TransportOptions;
  }

  private removeConsumer(producerId: string): void {
    const consumer = this.consumers.get(producerId);
    if (!consumer) return;
    this.consumers.delete(producerId);
    if (!consumer.closed) consumer.close();
    this.callbacks.onRemoteTrackRemoved(producerId);
  }

  private assertActive(signal: AbortSignal, stream?: MediaStream): void {
    if (!this.closed && !signal.aborted) return;
    if (stream) stopStream(stream);
    throw new CommunityCallMediaAbortedError();
  }

  private async flushPendingProducers(): Promise<void> {
    while (!this.closed && this.pendingProducerIds.size > 0) {
      const producerIds = [...this.pendingProducerIds];
      this.pendingProducerIds.clear();
      await Promise.allSettled(producerIds.map((producerId) => this.consume(producerId)));
    }
  }
}
