import { z } from "zod";

const PROTOCOL_VERSION = 1 as const;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_MESSAGE_BYTES = 64 * 1024;
const signalingIdSchema = z.string().min(1).max(256);
const requestIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const opaqueObjectSchema = z.record(z.string().max(128), z.unknown());

const requestBaseSchema = z.object({
  version: z.literal(PROTOCOL_VERSION),
  requestId: requestIdSchema,
});

export const clientSignalingRequestSchema = z.discriminatedUnion("action", [
  requestBaseSchema.extend({
    action: z.literal("authenticate"),
    data: z.object({ token: z.string().min(1).max(8192) }).strict(),
  }).strict(),
  requestBaseSchema.extend({
    action: z.literal("getRouterRtpCapabilities"),
    data: z.object({}).strict(),
  }).strict(),
  requestBaseSchema.extend({
    action: z.literal("createTransport"),
    data: z.object({ direction: z.enum(["send", "recv"]) }).strict(),
  }).strict(),
  requestBaseSchema.extend({
    action: z.literal("connectTransport"),
    data: z.object({ transportId: signalingIdSchema, dtlsParameters: opaqueObjectSchema }).strict(),
  }).strict(),
  requestBaseSchema.extend({
    action: z.literal("produceAudio"),
    data: z.object({ transportId: signalingIdSchema, rtpParameters: opaqueObjectSchema }).strict(),
  }).strict(),
  ...(["pauseProducer", "resumeProducer", "closeProducer"] as const).map((action) =>
    requestBaseSchema.extend({
      action: z.literal(action),
      data: z.object({ producerId: signalingIdSchema }).strict(),
    }).strict(),
  ),
  requestBaseSchema.extend({
    action: z.literal("consume"),
    data: z.object({
      transportId: signalingIdSchema,
      producerId: signalingIdSchema,
      rtpCapabilities: opaqueObjectSchema,
    }).strict(),
  }).strict(),
  requestBaseSchema.extend({
    action: z.literal("resumeConsumer"),
    data: z.object({ consumerId: signalingIdSchema }).strict(),
  }).strict(),
  requestBaseSchema.extend({
    action: z.literal("leave"),
    data: z.object({}).strict(),
  }).strict(),
]);

export type SignalingAction = z.infer<typeof clientSignalingRequestSchema>["action"];

export function buildSignalingRequest(
  requestId: string,
  action: SignalingAction,
  data: unknown,
): z.infer<typeof clientSignalingRequestSchema> {
  return clientSignalingRequestSchema.parse({
    version: PROTOCOL_VERSION,
    requestId,
    action,
    data,
  });
}

export const rtpCapabilitiesSchema = z
  .object({
    codecs: z.array(
      z.object({
        kind: z.enum(["audio", "video"]),
        mimeType: z.string().min(1),
        clockRate: z.number().positive(),
      }).passthrough(),
    ),
    headerExtensions: z.array(z.object({}).passthrough()).optional(),
  })
  .passthrough();

const iceParametersSchema = z.object({
  usernameFragment: z.string().min(1),
  password: z.string().min(1),
  iceLite: z.boolean().optional(),
});

const iceCandidateSchema = z.object({
  foundation: z.string(),
  priority: z.number(),
  address: z.string().min(1),
  ip: z.string().optional(),
  protocol: z.enum(["udp", "tcp"]),
  port: z.number().int().min(1).max(65535),
  type: z.enum(["host", "srflx", "prflx", "relay"]),
  tcpType: z.enum(["active", "passive", "so"]).optional(),
});

const dtlsParametersSchema = z.object({
  role: z.enum(["auto", "client", "server"]).optional(),
  fingerprints: z.array(
    z.object({
      algorithm: z.enum(["sha-1", "sha-224", "sha-256", "sha-384", "sha-512"]),
      value: z.string().min(1),
    }),
  ).min(1),
});

export const transportOptionsSchema = z.object({
  id: z.string().min(1),
  iceParameters: iceParametersSchema,
  iceCandidates: z.array(iceCandidateSchema),
  dtlsParameters: dtlsParametersSchema,
}).strict();

export const producedAudioSchema = z.object({ id: z.string().min(1) }).strict();
export const emptyResponseSchema = z.object({}).strict();

export const consumeResponseSchema = z.object({
  id: z.string().min(1),
  producerId: z.string().min(1),
  peerId: z.string().min(1),
  kind: z.literal("audio"),
  rtpParameters: z.object({}).passthrough(),
  type: z.string().min(1),
  producerPaused: z.boolean(),
}).strict();

const participantEventSchema = z.object({
  peerId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(["owner", "mod", "member"]),
}).strict();

const peerLeftEventSchema = z.object({
  peerId: z.string().min(1),
  userId: z.string().min(1),
  reason: z.string().min(1).max(160),
}).strict();

export const authenticateResponseSchema = z.object({
  peerId: z.string().min(1),
  callId: z.string().uuid(),
  groupId: z.string().uuid(),
  existingProducers: z.array(
    z.object({ producerId: z.string().min(1), peerId: z.string().min(1) }).strict(),
  ).max(500),
}).strict();

export const serverEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("peerJoined"), data: participantEventSchema }).strict(),
  z.object({ event: z.literal("peerLeft"), data: peerLeftEventSchema }).strict(),
  z.object({
    event: z.literal("newProducer"),
    data: z.object({ producerId: z.string().min(1), peerId: z.string().min(1) }).strict(),
  }).strict(),
  z.object({
    event: z.literal("producerClosed"),
    data: z.object({ producerId: z.string().min(1), peerId: z.string().min(1) }).strict(),
  }).strict(),
  z.object({
    event: z.literal("participantMuted"),
    data: z.object({ peerId: z.string().min(1), muted: z.boolean() }).strict(),
  }).strict(),
  z.object({
    event: z.literal("activeSpeakers"),
    data: z.object({
      speakers: z.array(
        z.object({ peerId: z.string().min(1), volume: z.number().finite() }).strict(),
      ).max(50),
    }).strict(),
  }).strict(),
  z.object({
    event: z.literal("callEnded"),
    data: z.object({ callId: z.string().uuid(), reason: z.string().min(1).max(160) }).strict(),
  }).strict(),
  z.object({
    event: z.literal("membershipRevoked"),
    data: z.object({ callId: z.string().uuid(), peerId: z.string().min(1) }).strict(),
  }).strict(),
  z.object({
    event: z.literal("reconnectRequired"),
    data: z.object({ callId: z.string().uuid(), reason: z.string().min(1).max(160) }).strict(),
  }).strict(),
]);

export const responseMessageSchema = z.discriminatedUnion("ok", [
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    requestId: requestIdSchema,
    ok: z.literal(true),
    data: z.unknown().optional(),
  }).strict(),
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    requestId: requestIdSchema,
    ok: z.literal(false),
    error: z.object({
      code: z.string().min(1).max(100),
      message: z.string().min(1).max(500),
    }).strict(),
  }).strict(),
]);

export const eventMessageSchema = z
  .object({
    version: z.literal(PROTOCOL_VERSION),
    event: z.string(),
    data: z.unknown(),
  })
  .strict()
  .transform(({ event, data }) => ({ event, data }))
  .pipe(serverEventSchema);

export type CommunityCallServerEvent = z.infer<typeof serverEventSchema>;
type EventListener = (event: CommunityCallServerEvent) => void;
type CloseListener = (event: CloseEvent) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: number;
  cleanupAbort: () => void;
}

export class SignalingError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "SignalingError";
  }
}

export class CommunityCallSignaling {
  private socket: WebSocket | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly eventListeners = new Set<EventListener>();
  private readonly closeListeners = new Set<CloseListener>();
  private intentionallyClosed = false;
  private authenticated = false;

  constructor(private readonly url: string) {}

  async connect(
    joinToken: string,
    signal?: AbortSignal,
  ): Promise<z.infer<typeof authenticateResponseSchema>> {
    if (this.socket) throw new SignalingError("Signaling is already connected.", "ALREADY_CONNECTED");
    if (signal?.aborted) throw new SignalingError("Voice connection was cancelled.", "ABORTED");
    this.intentionallyClosed = false;
    this.authenticated = false;

    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.binaryType = "arraybuffer";
    socket.addEventListener("message", this.handleMessage);
    socket.addEventListener("close", this.handleClose);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        finish(new SignalingError("The voice server did not respond.", "CONNECT_TIMEOUT"));
      }, REQUEST_TIMEOUT_MS);

      const cleanup = () => {
        window.clearTimeout(timeout);
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("error", handleError);
        socket.removeEventListener("close", handleOpeningClose);
        signal?.removeEventListener("abort", handleAbort);
      };
      const finish = (error?: SignalingError) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) {
          this.close(1000, "connection cancelled");
          reject(error);
        } else {
          resolve();
        }
      };
      const handleOpen = () => finish();
      const handleError = () => finish(
        new SignalingError("Could not connect to the voice server.", "CONNECT_FAILED"),
      );
      const handleOpeningClose = () => finish(
        new SignalingError("The voice server closed the connection.", "CONNECT_CLOSED"),
      );
      const handleAbort = () => finish(
        new SignalingError("Voice connection was cancelled.", "ABORTED"),
      );

      socket.addEventListener("open", handleOpen, { once: true });
      socket.addEventListener("error", handleError, { once: true });
      socket.addEventListener("close", handleOpeningClose, { once: true });
      signal?.addEventListener("abort", handleAbort, { once: true });
    });

    try {
      const authenticated = await this.request(
        "authenticate",
        { token: joinToken },
        authenticateResponseSchema,
        signal,
      );
      this.authenticated = true;
      return authenticated;
    } catch (error) {
      this.close(1000, "authentication cancelled");
      throw error;
    }
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onUnexpectedClose(listener: CloseListener): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  async request<T>(
    action: SignalingAction,
    data: unknown,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new SignalingError("Voice signaling is disconnected.", "DISCONNECTED");
    }
    if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
      throw new SignalingError("Secure request IDs are unavailable.", "UNSUPPORTED_BROWSER");
    }
    if (signal?.aborted) {
      throw new SignalingError("Voice request was cancelled.", "ABORTED");
    }

    const requestId = crypto.randomUUID();
    const response = new Promise<unknown>((resolve, reject) => {
      const cleanupAbort = () => signal?.removeEventListener("abort", handleAbort);
      const timeout = window.setTimeout(() => {
        this.pending.delete(requestId);
        cleanupAbort();
        reject(new SignalingError(`Voice request timed out: ${action}`, "REQUEST_TIMEOUT"));
      }, REQUEST_TIMEOUT_MS);
      const handleAbort = () => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        window.clearTimeout(pending.timeout);
        this.pending.delete(requestId);
        cleanupAbort();
        reject(new SignalingError("Voice request was cancelled.", "ABORTED"));
      };
      this.pending.set(requestId, { resolve, reject, timeout, cleanupAbort });
      signal?.addEventListener("abort", handleAbort, { once: true });
    });

    let request: z.infer<typeof clientSignalingRequestSchema>;
    try {
      request = buildSignalingRequest(requestId, action, data);
    } catch {
      const pending = this.pending.get(requestId);
      window.clearTimeout(pending?.timeout);
      pending?.cleanupAbort();
      this.pending.delete(requestId);
      throw new SignalingError(`Invalid signaling payload for ${action}.`, "INVALID_REQUEST");
    }
    try {
      socket.send(JSON.stringify(request));
    } catch {
      const pending = this.pending.get(requestId);
      if (pending) {
        window.clearTimeout(pending.timeout);
        pending.cleanupAbort();
        this.pending.delete(requestId);
      }
      throw new SignalingError("Voice signaling could not send the request.", "SEND_FAILED");
    }

    const payload = await response;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new SignalingError(
        `Voice server returned invalid data for ${action}.`,
        "INVALID_RESPONSE",
      );
    }
    return parsed.data;
  }

  close(code = 1000, reason = "client leave"): void {
    this.intentionallyClosed = true;
    this.authenticated = false;
    const socket = this.socket;
    this.socket = null;
    socket?.removeEventListener("message", this.handleMessage);
    socket?.removeEventListener("close", this.handleClose);
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(code, reason);
    this.rejectPending(new SignalingError("Voice signaling closed.", "DISCONNECTED"));
  }

  private readonly handleMessage = (event: MessageEvent<unknown>) => {
    if (typeof event.data !== "string" || event.data.length > MAX_MESSAGE_BYTES) {
      this.socket?.close(1003, "unsupported message");
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(event.data) as unknown;
    } catch {
      this.socket?.close(1007, "invalid json");
      return;
    }

    const response = responseMessageSchema.safeParse(payload);
    if (response.success) {
      const pending = this.pending.get(response.data.requestId);
      if (!pending) return;
      window.clearTimeout(pending.timeout);
      pending.cleanupAbort();
      this.pending.delete(response.data.requestId);
      if (response.data.ok) pending.resolve(response.data.data);
      else pending.reject(new SignalingError(response.data.error.message, response.data.error.code));
      return;
    }

    const serverEvent = eventMessageSchema.safeParse(payload);
    if (!serverEvent.success) return;
    this.eventListeners.forEach((listener) => listener(serverEvent.data));
  };

  private readonly handleClose = (event: CloseEvent) => {
    this.socket = null;
    this.rejectPending(new SignalingError("Voice signaling disconnected.", "DISCONNECTED"));
    if (!this.intentionallyClosed && this.authenticated) {
      this.closeListeners.forEach((listener) => listener(event));
    }
    this.authenticated = false;
  };

  private rejectPending(error: Error): void {
    for (const request of this.pending.values()) {
      window.clearTimeout(request.timeout);
      request.cleanupAbort();
      request.reject(error);
    }
    this.pending.clear();
  }
}
