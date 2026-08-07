import type { VoiceConfig } from '../config.js';
import type { MediaFailureReporter } from '../control-plane/media-failure-reporter.js';
import { serverEvent, type ServerEvent } from '../contracts/protocol.js';
import type { MediaAdapter, MediaRoom, PeerIdentity, TransportDirection } from '../media/contracts.js';
import type { Logger } from '../observability/logger.js';
import type { Metrics } from '../observability/metrics.js';
import { GatewayError } from '../shared/errors.js';

type EventSink = (event: ServerEvent) => void;
type ConnectedPeer = PeerIdentity & { sink: EventSink; disconnectTimer?: NodeJS.Timeout };
type RoomState = { room: MediaRoom; peers: Map<string, ConnectedPeer> };

export type PreparedRoom = { roomId: string; created: boolean };

export class RoomRegistry {
  private readonly rooms = new Map<string, RoomState>();

  public constructor(
    private readonly media: MediaAdapter,
    private readonly config: VoiceConfig,
    private readonly metrics: Metrics,
    private readonly logger: Logger,
    private readonly mediaFailures?: MediaFailureReporter,
  ) {
    media.onWorkerDeath(({ workerId, roomIds }) => {
      for (const roomId of roomIds) this.handleWorkerDeath(roomId, workerId);
    });
  }

  public get size(): number {
    return this.rooms.size;
  }

  public has(callId: string): boolean {
    return this.rooms.has(callId);
  }

  public async prepare(callId: string): Promise<PreparedRoom> {
    const current = this.rooms.get(callId);
    if (current && !current.room.closed) return { roomId: current.room.id, created: false };
    if (this.rooms.size >= this.config.maxRooms) throw new GatewayError('CONFLICT', 'Room capacity reached', 503);
    const room = await this.media.createRoom(callId);
    const state: RoomState = { room, peers: new Map() };
    this.bindMediaEvents(state);
    this.rooms.set(callId, state);
    this.metrics.increment('voice_rooms_created_total', 1, 'Prepared voice rooms');
    this.updateMetrics();
    this.logger.info('room_prepared', { callId, roomId: room.id, workerId: room.workerId });
    return { roomId: room.id, created: true };
  }

  public end(callId: string, reason = 'ended_by_api'): boolean {
    const state = this.rooms.get(callId);
    if (!state) return false;
    this.broadcast(state, serverEvent('callEnded', { callId, reason }));
    this.closeState(callId, state);
    this.metrics.increment('voice_rooms_ended_total', 1, 'Ended voice rooms');
    this.logger.info('room_ended', { callId, reason });
    return true;
  }

  public join(callId: string, identity: PeerIdentity, sink: EventSink): { existingProducers: unknown[] } {
    const state = this.requireRoom(callId);
    const existing = state.peers.get(identity.peerId);
    if (existing?.disconnectTimer) clearTimeout(existing.disconnectTimer);
    if (!existing && state.peers.size >= this.config.maxPeersPerRoom) {
      throw new GatewayError('CALL_FULL', 'Call participant capacity reached', 409);
    }
    state.room.addPeer(identity);
    state.peers.set(identity.peerId, { ...identity, sink });
    if (!existing) {
      this.broadcast(state, serverEvent('peerJoined', {
        peerId: identity.peerId,
        userId: identity.userId,
        role: identity.role,
      }), identity.peerId);
      this.metrics.increment('voice_peer_joins_total', 1, 'Successful peer joins');
    }
    this.updateMetrics();
    return { existingProducers: state.room.listProducers(identity.peerId) };
  }

  public disconnect(callId: string, peerId: string): void {
    const state = this.rooms.get(callId);
    const peer = state?.peers.get(peerId);
    if (!state || !peer || peer.disconnectTimer) return;
    const remove = () => this.leave(callId, peerId, 'disconnected');
    if (this.config.disconnectGraceMs === 0) remove();
    else peer.disconnectTimer = setTimeout(remove, this.config.disconnectGraceMs).unref();
  }

  public leave(callId: string, peerId: string, reason = 'left'): void {
    const state = this.rooms.get(callId);
    const peer = state?.peers.get(peerId);
    if (!state || !peer) return;
    if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
    state.peers.delete(peerId);
    state.room.removePeer(peerId);
    this.broadcast(state, serverEvent('peerLeft', { peerId, userId: peer.userId, reason }));
    this.metrics.increment('voice_peer_leaves_total', 1, 'Peer leaves');
    this.updateMetrics();
  }

  public revokeMembership(callId: string, userId: string): number {
    const state = this.rooms.get(callId);
    if (!state) return 0;
    const targets = [...state.peers.values()].filter((peer) => peer.userId === userId);
    for (const peer of targets) {
      this.sendToPeer(peer, serverEvent('membershipRevoked', { callId, peerId: peer.peerId }));
      this.leave(callId, peer.peerId, 'membership_revoked');
    }
    return targets.length;
  }

  public getRouterRtpCapabilities(callId: string): unknown {
    return this.requireRoom(callId).room.getRtpCapabilities();
  }

  public createTransport(callId: string, peerId: string, direction: TransportDirection) {
    return this.requireRoom(callId).room.createTransport(peerId, direction);
  }

  public connectTransport(callId: string, peerId: string, transportId: string, dtlsParameters: unknown) {
    return this.requireRoom(callId).room.connectTransport(peerId, transportId, dtlsParameters);
  }

  public async produceAudio(callId: string, peerId: string, transportId: string, rtpParameters: unknown) {
    const state = this.requireRoom(callId);
    const producer = await state.room.produceAudio(peerId, transportId, rtpParameters);
    this.broadcast(state, serverEvent('newProducer', { producerId: producer.id, peerId }), peerId);
    this.metrics.increment('voice_producers_created_total', 1, 'Audio producers created');
    this.updateMetrics();
    return producer;
  }

  public pauseProducer(callId: string, peerId: string, producerId: string) {
    return this.requireRoom(callId).room.pauseProducer(peerId, producerId);
  }

  public resumeProducer(callId: string, peerId: string, producerId: string) {
    return this.requireRoom(callId).room.resumeProducer(peerId, producerId);
  }

  public closeProducer(callId: string, peerId: string, producerId: string): void {
    this.requireRoom(callId).room.closeProducer(peerId, producerId);
    this.updateMetrics();
  }

  public async consume(
    callId: string,
    peerId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: unknown,
  ) {
    const result = await this.requireRoom(callId).room.consume(peerId, transportId, producerId, rtpCapabilities);
    this.metrics.increment('voice_consumers_created_total', 1, 'Audio consumers created');
    this.updateMetrics();
    return result;
  }

  public resumeConsumer(callId: string, peerId: string, consumerId: string) {
    return this.requireRoom(callId).room.resumeConsumer(peerId, consumerId);
  }

  public closeAll(): void {
    for (const [callId, state] of this.rooms) {
      this.broadcast(state, serverEvent('callEnded', { callId, reason: 'gateway_shutdown' }));
      this.closeState(callId, state);
    }
  }

  public async refreshMediaMetrics(): Promise<void> {
    const stats = await Promise.all([...this.rooms.values()].map((state) => state.room.getStats()));
    this.metrics.set('voice_transports_active', stats.reduce((total, item) => total + item.transports, 0), 'Active WebRTC transports');
    this.metrics.set('voice_consumers_active', stats.reduce((total, item) => total + item.consumers, 0), 'Active audio consumers');
    this.metrics.set('voice_receive_bitrate_bps', stats.reduce((total, item) => total + item.receiveBitrate, 0), 'Aggregate incoming bitrate');
    this.metrics.set('voice_send_bitrate_bps', stats.reduce((total, item) => total + item.sendBitrate, 0), 'Aggregate outgoing bitrate');
    this.metrics.set('voice_packet_loss_received', stats.reduce((total, item) => total + item.packetLossReceived, 0), 'Aggregate received RTP packet loss');
    this.metrics.set('voice_packet_loss_sent', stats.reduce((total, item) => total + item.packetLossSent, 0), 'Aggregate sent RTP packet loss');
  }

  private requireRoom(callId: string): RoomState {
    const state = this.rooms.get(callId);
    if (!state || state.room.closed) throw new GatewayError('CALL_NOT_FOUND', 'Prepared call room not found', 404);
    return state;
  }

  private bindMediaEvents(state: RoomState): void {
    state.room.on('producerClosed', (data: { producerId: string; peerId: string }) => {
      this.broadcast(state, serverEvent('producerClosed', data));
      this.updateMetrics();
    });
    state.room.on('participantMuted', (data: { peerId: string; muted: boolean }) => {
      this.broadcast(state, serverEvent('participantMuted', data));
    });
    state.room.on('activeSpeakers', (data: { speakers: Array<{ peerId: string; volume: number }> }) => {
      this.broadcast(state, serverEvent('activeSpeakers', data));
    });
  }

  private handleWorkerDeath(callId: string, workerId: string): void {
    const state = this.rooms.get(callId);
    if (!state) return;
    this.broadcast(state, serverEvent('reconnectRequired', { callId, reason: 'worker_died' }));
    this.metrics.increment('voice_reconnect_required_total', state.peers.size, 'Peers instructed to reconnect');
    this.broadcast(state, serverEvent('callEnded', { callId, reason: 'media_worker_died' }));
    this.closeState(callId, state);
    this.mediaFailures?.report(callId, 'MEDIA_WORKER_DIED');
    this.logger.error('room_lost_on_worker_death', { callId, workerId });
  }

  private broadcast(state: RoomState, event: ServerEvent, exceptPeerId?: string): void {
    for (const peer of state.peers.values()) {
      if (peer.peerId !== exceptPeerId) this.sendToPeer(peer, event);
    }
  }

  private sendToPeer(peer: ConnectedPeer, event: ServerEvent): void {
    try {
      peer.sink(event);
    } catch (error) {
      // A stale or broken socket must not prevent room cleanup or control-plane
      // failure reporting for every other participant in the room.
      this.logger.warn('peer_event_delivery_failed', {
        peerId: peer.peerId,
        event: event.event,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  private closeState(callId: string, state: RoomState): void {
    for (const peer of state.peers.values()) if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
    state.peers.clear();
    this.rooms.delete(callId);
    try {
      state.room.close();
    } catch (error) {
      this.logger.error('room_media_cleanup_failed', {
        callId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
    this.updateMetrics();
  }

  private updateMetrics(): void {
    let peers = 0;
    let producers = 0;
    for (const state of this.rooms.values()) {
      peers += state.peers.size;
      producers += state.room.listProducers().length;
    }
    this.metrics.set('voice_rooms_active', this.rooms.size, 'Currently prepared voice rooms');
    this.metrics.set('voice_peers_connected', peers, 'Connected signaling peers');
    this.metrics.set('voice_producers_active', producers, 'Active audio producers');
  }
}
