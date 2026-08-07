import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyClientToken, type ClientClaims } from '../auth/jwt.js';
import type { VoiceConfig } from '../config.js';
import type { ParticipantJoinedConfirmer } from '../control-plane/participant-joined-confirmer.js';
import {
  errorResponse,
  signalingRequestSchema,
  successResponse,
  type ServerEvent,
  type SignalingRequest,
  type SignalingResponse,
} from '../contracts/protocol.js';
import type { Logger } from '../observability/logger.js';
import type { Metrics } from '../observability/metrics.js';
import { WindowRateLimiter } from '../rate-limit/window-limiter.js';
import type { RoomRegistry } from '../rooms/room-registry.js';
import { asGatewayError, GatewayError } from '../shared/errors.js';

type Session = {
  id: string;
  socket: WebSocket;
  claims?: ClientClaims;
  peerId?: string;
  provisionalPeer?: { callId: string; peerId: string };
  responses: Map<string, SignalingResponse>;
  queue: Promise<void>;
  alive: boolean;
  authTimer: NodeJS.Timeout;
};

export class SignalingServer {
  private readonly server: WebSocketServer;
  private readonly sessions = new Set<Session>();
  private readonly limiter: WindowRateLimiter;
  private readonly heartbeat: NodeJS.Timeout;

  public constructor(
    httpServer: HttpServer,
    private readonly registry: RoomRegistry,
    private readonly config: VoiceConfig,
    private readonly metrics: Metrics,
    private readonly logger: Logger,
    private readonly participantJoined: ParticipantJoinedConfirmer,
  ) {
    this.limiter = new WindowRateLimiter(config.requestsPer10Seconds, 10_000);
    this.server = new WebSocketServer({ noServer: true, clientTracking: false, maxPayload: config.wsMaxPayloadBytes });
    httpServer.on('upgrade', (request, socket, head) => this.upgrade(request, socket, head));
    this.server.on('connection', (socket) => this.accept(socket));
    this.heartbeat = setInterval(() => this.checkHeartbeats(), 30_000);
    this.heartbeat.unref();
  }

  public async close(): Promise<void> {
    clearInterval(this.heartbeat);
    const sessions = [...this.sessions];
    for (const session of sessions) session.socket.close(1001, 'Gateway shutting down');
    await Promise.allSettled(sessions.map((session) => session.queue));
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private upgrade(request: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer): void {
    let pathname: string;
    try {
      pathname = new URL(request.url ?? '/', 'http://voice.local').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }
    this.server.handleUpgrade(request, socket, head, (webSocket) => this.server.emit('connection', webSocket, request));
  }

  private accept(socket: WebSocket): void {
    const session: Session = {
      id: randomUUID(),
      socket,
      responses: new Map(),
      queue: Promise.resolve(),
      alive: true,
      authTimer: setTimeout(() => socket.close(4001, 'Authentication timeout'), this.config.authTimeoutMs),
    };
    session.authTimer.unref();
    this.sessions.add(session);
    this.metrics.increment('voice_signaling_connections_total', 1, 'Accepted WebSocket connections');
    this.updateConnectionMetric();

    socket.on('pong', () => { session.alive = true; });
    socket.on('message', (raw, isBinary) => {
      session.queue = session.queue
        .then(() => this.handleMessage(session, raw, isBinary))
        .catch((error: unknown) => this.handleUnexpected(session, error));
    });
    socket.on('close', () => this.cleanup(session));
    socket.on('error', () => {
      this.metrics.increment('voice_signaling_socket_errors_total', 1, 'WebSocket transport errors');
    });
  }

  private async handleMessage(session: Session, raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean): Promise<void> {
    if (isBinary) {
      this.send(session, errorResponse('invalid', 'BAD_REQUEST', 'Binary frames are not supported'));
      return;
    }
    let input: unknown;
    try {
      input = JSON.parse(raw.toString());
    } catch {
      this.send(session, errorResponse('invalid', 'BAD_REQUEST', 'Frame must be valid JSON'));
      return;
    }
    const parsed = signalingRequestSchema.safeParse(input);
    if (!parsed.success) {
      const rawCandidate = input && typeof input === 'object' && 'requestId' in input ? String(input.requestId).slice(0, 128) : '';
      const candidate = /^[A-Za-z0-9._:-]{1,128}$/.test(rawCandidate) ? rawCandidate : 'invalid';
      this.send(session, errorResponse(candidate, 'BAD_REQUEST', 'Frame does not match signaling protocol v1'));
      return;
    }
    if (!this.limiter.consume(session.id)) {
      this.metrics.increment('voice_signaling_rate_limited_total', 1, 'Rate-limited signaling requests');
      this.send(session, errorResponse(parsed.data.requestId, 'RATE_LIMITED', 'Too many signaling requests'));
      return;
    }
    const cached = session.responses.get(parsed.data.requestId);
    if (cached) {
      this.send(session, cached);
      return;
    }

    let response: SignalingResponse;
    try {
      const data = await this.dispatch(session, parsed.data);
      response = successResponse(parsed.data.requestId, data);
    } catch (error) {
      const gatewayError = asGatewayError(error);
      response = errorResponse(parsed.data.requestId, gatewayError.code, gatewayError.message);
      this.metrics.increment('voice_signaling_request_errors_total', 1, 'Rejected signaling requests');
    }
    this.cacheResponse(session, parsed.data.requestId, response);
    this.send(session, response);
    if (parsed.data.action === 'leave' && response.ok) setImmediate(() => session.socket.close(1000, 'Left call'));
  }

  private async dispatch(session: Session, request: SignalingRequest): Promise<unknown> {
    if (request.action === 'authenticate') return this.authenticate(session, request.data.token);
    const claims = session.claims;
    const peerId = session.peerId;
    if (!claims || !peerId) throw new GatewayError('AUTH_REQUIRED', 'Authenticate before other requests', 401);

    switch (request.action) {
      case 'getRouterRtpCapabilities':
        return this.registry.getRouterRtpCapabilities(claims.callId);
      case 'createTransport': {
        const transport = await this.registry.createTransport(claims.callId, peerId, request.data.direction);
        this.metrics.increment('voice_transports_created_total', 1, 'WebRTC transports created');
        return transport;
      }
      case 'connectTransport':
        await this.registry.connectTransport(claims.callId, peerId, request.data.transportId, request.data.dtlsParameters);
        return {};
      case 'produceAudio':
        return this.registry.produceAudio(claims.callId, peerId, request.data.transportId, request.data.rtpParameters);
      case 'pauseProducer':
        await this.registry.pauseProducer(claims.callId, peerId, request.data.producerId);
        return {};
      case 'resumeProducer':
        await this.registry.resumeProducer(claims.callId, peerId, request.data.producerId);
        return {};
      case 'closeProducer':
        this.registry.closeProducer(claims.callId, peerId, request.data.producerId);
        return {};
      case 'consume':
        return this.registry.consume(
          claims.callId,
          peerId,
          request.data.transportId,
          request.data.producerId,
          request.data.rtpCapabilities,
        );
      case 'resumeConsumer':
        await this.registry.resumeConsumer(claims.callId, peerId, request.data.consumerId);
        return {};
      case 'leave':
        this.registry.leave(claims.callId, peerId);
        return {};
      default:
        request satisfies never;
        throw new GatewayError('BAD_REQUEST', 'Unknown action', 400);
    }
  }

  private async authenticate(session: Session, token: string): Promise<unknown> {
    if (session.claims) throw new GatewayError('CONFLICT', 'Session is already authenticated', 409);
    const claims = await verifyClientToken(token, this.config.jwtSecret);
    // The client met the authentication deadline. API attendance confirmation
    // has its own bounded timeout/retry policy and must not race this timer.
    clearTimeout(session.authTimer);
    if (!this.isSessionLive(session)) {
      throw new GatewayError('MEDIA_UNAVAILABLE', 'Signaling connection closed during authentication', 503);
    }
    const peerId = createHash('sha256').update(claims.jti).digest('base64url').slice(0, 32);
    const joined = this.registry.join(
      claims.callId,
      { peerId, userId: claims.sub, groupId: claims.groupId, role: claims.role },
      (event) => this.sendEvent(session, event),
    );
    session.provisionalPeer = { callId: claims.callId, peerId };
    try {
      await this.participantJoined.confirm({
        callId: claims.callId,
        userId: claims.sub,
        joinTokenJti: claims.jti,
      });
    } catch {
      this.removeProvisionalPeer(session, 'attendance_unconfirmed');
      this.metrics.increment(
        'voice_signaling_auth_confirmation_failures_total',
        1,
        'Signaling authentications rejected because attendance could not be confirmed',
      );
      throw new GatewayError(
        'MEDIA_UNAVAILABLE',
        'Call attendance confirmation is temporarily unavailable',
        503,
      );
    }
    if (!this.isSessionLive(session)) {
      this.removeProvisionalPeer(session, 'signaling_closed_during_confirmation');
      throw new GatewayError('MEDIA_UNAVAILABLE', 'Signaling connection closed during authentication', 503);
    }
    session.claims = claims;
    session.peerId = peerId;
    delete session.provisionalPeer;
    this.metrics.increment('voice_signaling_auth_success_total', 1, 'Authenticated signaling sessions');
    return { peerId, callId: claims.callId, groupId: claims.groupId, existingProducers: joined.existingProducers };
  }

  private sendEvent(session: Session, event: ServerEvent): void {
    this.send(session, event);
    if (event.event === 'membershipRevoked') setImmediate(() => session.socket.close(4003, 'Membership revoked'));
    if (event.event === 'callEnded') setImmediate(() => session.socket.close(4004, 'Call ended'));
  }

  private send(session: Session, payload: SignalingResponse | ServerEvent): void {
    if (session.socket.readyState === WebSocket.OPEN) session.socket.send(JSON.stringify(payload));
  }

  private cacheResponse(session: Session, requestId: string, response: SignalingResponse): void {
    if (session.responses.size >= 256) {
      const oldest = session.responses.keys().next().value as string | undefined;
      if (oldest) session.responses.delete(oldest);
    }
    session.responses.set(requestId, response);
  }

  private handleUnexpected(session: Session, error: unknown): void {
    this.logger.error('signaling_handler_failed', {
      sessionId: session.id,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    this.send(session, errorResponse('internal', 'INTERNAL_ERROR', 'Unexpected gateway error'));
  }

  private cleanup(session: Session): void {
    if (!this.sessions.delete(session)) return;
    clearTimeout(session.authTimer);
    this.limiter.delete(session.id);
    if (session.provisionalPeer) this.removeProvisionalPeer(session, 'signaling_closed_during_confirmation');
    else if (session.claims && session.peerId) this.registry.disconnect(session.claims.callId, session.peerId);
    this.updateConnectionMetric();
  }

  private isSessionLive(session: Session): boolean {
    return this.sessions.has(session) && session.socket.readyState === WebSocket.OPEN;
  }

  private removeProvisionalPeer(session: Session, reason: string): void {
    const provisional = session.provisionalPeer;
    if (!provisional) return;
    delete session.provisionalPeer;
    this.registry.leave(provisional.callId, provisional.peerId, reason);
  }

  private checkHeartbeats(): void {
    for (const session of this.sessions) {
      if (!session.alive) {
        this.metrics.increment('voice_signaling_heartbeat_timeouts_total', 1, 'WebSocket heartbeat timeouts');
        session.socket.terminate();
        continue;
      }
      session.alive = false;
      session.socket.ping();
    }
  }

  private updateConnectionMetric(): void {
    this.metrics.set('voice_signaling_connections_active', this.sessions.size, 'Open WebSocket connections');
  }
}
