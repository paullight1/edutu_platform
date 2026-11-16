import { validateSignalingUrl } from './api';

export type SignalingEventType = 'peerJoined' | 'peerLeft' | 'newProducer' | 'producerClosed' | 'participantMuted' | 'activeSpeakers' | 'callEnded' | 'membershipRevoked' | 'reconnectRequired';
export interface SignalingEvent { type: SignalingEventType; data: Record<string, unknown> }
export interface SignalingErrorBody { code: string; message: string }
export interface AuthenticatedSignalingSession { peerId: string; existingProducers: Array<{ producerId: string; peerId?: string }> }
export class SignalingProtocolError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'SignalingProtocolError'; }
}
type Listener = (event: SignalingEvent) => void;
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
type SocketLike = Pick<WebSocket, 'send' | 'close' | 'readyState'> & { onopen: ((event: Event) => void) | null; onmessage: ((event: MessageEvent) => void) | null; onerror: ((event: Event) => void) | null; onclose: ((event: CloseEvent) => void) | null };
type SocketFactory = (url: string) => SocketLike;
export type SignalingAction = 'authenticate' | 'getRouterRtpCapabilities' | 'createTransport' | 'connectTransport' | 'produceAudio' | 'pauseProducer' | 'resumeProducer' | 'closeProducer' | 'consume' | 'resumeConsumer' | 'leave';
const EVENTS = new Set<SignalingEventType>(['peerJoined','peerLeft','newProducer','producerClosed','participantMuted','activeSpeakers','callEnded','membershipRevoked','reconnectRequired']);

function record(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }

export function parseServerFrame(raw: unknown): { kind: 'response'; requestId: string; ok: boolean; data?: unknown; error?: SignalingErrorBody } | { kind: 'event'; event: SignalingEvent } | null {
  if (typeof raw !== 'string' || raw.length > 1_000_000) return null;
  let decoded: unknown; try { decoded = JSON.parse(raw); } catch { return null; }
  const frame = record(decoded); if (!frame) return null;
  if (frame.version !== 1) return null;
  if (typeof frame.requestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(frame.requestId) && typeof frame.ok === 'boolean') {
    const error = record(frame.error);
    if (!frame.ok && (!error || typeof error.code !== 'string' || typeof error.message !== 'string')) return null;
    const errorCode = typeof error?.code === 'string' ? error.code : undefined;
    const errorMessage = typeof error?.message === 'string' ? error.message : undefined;
    return { kind: 'response', requestId: frame.requestId, ok: frame.ok, data: frame.data,
      error: errorCode && errorMessage ? { code: errorCode.slice(0, 128), message: errorMessage.slice(0, 500) } : undefined };
  }
  const type = frame.event;
  if (typeof type !== 'string' || !EVENTS.has(type as SignalingEventType)) return null;
  const data = record(frame.data); if (!data) return null;
  return { kind: 'event', event: { type: type as SignalingEventType, data } };
}

export class CommunityCallSignaling {
  private socket: SocketLike | null = null;
  private pending = new Map<string, Pending>();
  private listeners = new Set<Listener>();
  private sequence = 0;
  private closedByClient = false;
  constructor(private readonly socketFactory: SocketFactory = (url) => new WebSocket(url)) {}

  async connect(signalingUrl: string, token: string): Promise<AuthenticatedSignalingSession> {
    this.close();
    this.closedByClient = false;
    const url = validateSignalingUrl(signalingUrl);
    const socket = this.socketFactory(url); this.socket = socket;
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void) => { if (settled) return; settled = true; clearTimeout(timer); callback(); };
        const timer = setTimeout(() => {
          socket.close(4000, 'connect timeout');
          finish(() => reject(new Error('Voice server connection timed out.')));
        }, 10_000);
        socket.onopen = () => finish(resolve);
        socket.onerror = () => finish(() => reject(new Error('Could not connect to the voice server.')));
        socket.onclose = () => finish(() => reject(new Error('Voice server connection was cancelled.')));
      });
    } catch (error) {
      if (this.socket === socket) this.socket = null;
      try { socket.close(4000, 'connect failed'); } catch { /* already closed */ }
      throw error;
    }
    socket.onmessage = (event) => this.receive(event.data);
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.failPending(new Error('Voice server disconnected.'));
      if (!this.closedByClient) this.emit({ type: 'reconnectRequired', data: { reason: 'socket_closed' } });
    };
    let authenticated: unknown;
    try {
      authenticated = await this.request('authenticate', { token });
    } catch (error) {
      this.closedByClient = true;
      try { socket.close(4001, 'authentication failed'); } catch { /* already closed */ }
      if (this.socket === socket) this.socket = null;
      throw error;
    } finally { token = ''; }
    const result = record(authenticated);
    if (typeof result?.peerId !== 'string' || !result.peerId || result.peerId.length > 256) {
      this.close();
      throw new SignalingProtocolError('INVALID_RESPONSE', 'Voice server returned an invalid authenticated session.');
    }
    const existing = Array.isArray(result?.existingProducers) ? result.existingProducers : Array.isArray(result?.existing_producers) ? result.existing_producers : [];
    return { peerId: result.peerId, existingProducers: existing.flatMap((value) => { const producer = record(value); return typeof producer?.producerId === 'string' ? [{ producerId: producer.producerId, ...(typeof producer.peerId === 'string' ? { peerId: producer.peerId } : {}) }] : []; }) };
  }

  onEvent(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  request(action: SignalingAction, data: Record<string, unknown> = {}, timeoutMs = 10_000): Promise<unknown> {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1) return Promise.reject(new Error('Voice server is not connected.'));
    const requestId = `mobile-${Date.now()}-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('Voice server request timed out.')); }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        socket.send(JSON.stringify({ version: 1, requestId, action, data }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error('Voice server request could not be sent.'));
      }
    });
  }
  close(): void {
    this.closedByClient = true;
    const socket = this.socket;
    this.socket = null;
    try { socket?.close(1000, 'client leave'); } catch { /* already closed */ }
    this.failPending(new Error('Call ended.'));
  }
  private receive(raw: unknown): void {
    const frame = parseServerFrame(raw); if (!frame) return;
    if (frame.kind === 'event') { this.emit(frame.event); return; }
    const pending = this.pending.get(frame.requestId); if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(frame.requestId);
    if (frame.ok) pending.resolve(frame.data); else pending.reject(new SignalingProtocolError(frame.error?.code || 'GATEWAY_ERROR', frame.error?.message || 'Voice server rejected the request.'));
  }
  private emit(event: SignalingEvent) { for (const listener of this.listeners) { try { listener(event); } catch { /* isolate observers */ } } }
  private failPending(error: Error) { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); } this.pending.clear(); }
}
