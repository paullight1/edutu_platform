import { EventEmitter } from 'node:events';
import type {
  AudioLevelObserver,
  Consumer,
  DtlsParameters,
  Producer,
  Router,
  RtpCapabilities,
  RtpParameters,
  WebRtcServer,
  WebRtcTransport,
} from 'mediasoup/types';
import { GatewayError } from '../shared/errors.js';
import type {
  ConsumerDescriptor,
  MediaStats,
  MediaRoom,
  PeerIdentity,
  ProducerDescriptor,
  TransportDescriptor,
  TransportDirection,
} from './contracts.js';

type TransportState = { transport: WebRtcTransport; direction: TransportDirection };
type PeerState = {
  identity: PeerIdentity;
  transports: Map<string, TransportState>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
};

export class MediasoupRoom extends EventEmitter implements MediaRoom {
  private readonly peers = new Map<string, PeerState>();

  public constructor(
    public readonly id: string,
    public readonly workerId: string,
    private readonly router: Router,
    private readonly webRtcServer: WebRtcServer,
    private readonly observer: AudioLevelObserver,
    private readonly maxTransportsPerPeer: number,
    private readonly maxConsumersPerPeer: number,
    private readonly enableUdp: boolean,
    private readonly enableTcp: boolean,
  ) {
    super();
    observer.on('volumes', (volumes) => {
      const speakers = volumes.flatMap(({ producer, volume }) => {
        const peerId = typeof producer.appData.peerId === 'string' ? producer.appData.peerId : undefined;
        return peerId ? [{ peerId, volume }] : [];
      });
      this.emit('activeSpeakers', { speakers });
    });
    observer.on('silence', () => this.emit('activeSpeakers', { speakers: [] }));
  }

  public get closed(): boolean {
    return this.router.closed;
  }

  public getRtpCapabilities(): unknown {
    return this.router.rtpCapabilities;
  }

  public addPeer(peer: PeerIdentity): void {
    if (this.closed) throw new GatewayError('CALL_ENDED', 'Call has ended', 410);
    if (!this.peers.has(peer.peerId)) {
      this.peers.set(peer.peerId, {
        identity: peer,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
      });
    }
  }

  public removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    for (const producer of peer.producers.values()) producer.close();
    for (const consumer of peer.consumers.values()) consumer.close();
    for (const state of peer.transports.values()) state.transport.close();
    this.peers.delete(peerId);
  }

  public async createTransport(peerId: string, direction: TransportDirection): Promise<TransportDescriptor> {
    const peer = this.requirePeer(peerId);
    if (peer.transports.size >= this.maxTransportsPerPeer) {
      throw new GatewayError('CONFLICT', 'Peer transport capacity reached', 409);
    }
    if ([...peer.transports.values()].some((state) => state.direction === direction)) {
      throw new GatewayError('CONFLICT', `Peer already has a ${direction} transport`, 409);
    }
    const transport = await this.router.createWebRtcTransport({
      webRtcServer: this.webRtcServer,
      enableUdp: this.enableUdp,
      enableTcp: this.enableTcp,
      preferUdp: this.enableUdp,
      enableSctp: false,
      appData: { peerId, direction },
    });
    peer.transports.set(transport.id, { transport, direction });
    transport.on('dtlsstatechange', (state) => {
      if (state === 'closed' || state === 'failed') this.closeTransport(peer, transport.id);
    });
    transport.on('routerclose', () => peer.transports.delete(transport.id));
    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  public async connectTransport(peerId: string, transportId: string, dtlsParameters: unknown): Promise<void> {
    const state = this.requireTransport(this.requirePeer(peerId), transportId);
    await state.transport.connect({ dtlsParameters: dtlsParameters as DtlsParameters });
  }

  public async produceAudio(
    peerId: string,
    transportId: string,
    rtpParameters: unknown,
  ): Promise<ProducerDescriptor> {
    const peer = this.requirePeer(peerId);
    const state = this.requireTransport(peer, transportId);
    if (state.direction !== 'send') throw new GatewayError('BAD_REQUEST', 'A send transport is required', 400);
    if (peer.producers.size > 0) throw new GatewayError('CONFLICT', 'Peer already has an audio producer', 409);
    this.assertOpus(rtpParameters);
    const producer = await state.transport.produce({
      kind: 'audio',
      rtpParameters: rtpParameters as RtpParameters,
      paused: true,
      appData: { peerId },
    });
    peer.producers.set(producer.id, producer);
    await this.observer.addProducer({ producerId: producer.id });
    producer.on('transportclose', () => this.removeProducer(peer, producer.id));
    producer.observer.on('close', () => this.removeProducer(peer, producer.id));
    return { id: producer.id };
  }

  public async pauseProducer(peerId: string, producerId: string): Promise<void> {
    const producer = this.requireProducer(this.requirePeer(peerId), producerId);
    await producer.pause();
    this.emit('participantMuted', { peerId, muted: true });
  }

  public async resumeProducer(peerId: string, producerId: string): Promise<void> {
    const producer = this.requireProducer(this.requirePeer(peerId), producerId);
    await producer.resume();
    this.emit('participantMuted', { peerId, muted: false });
  }

  public closeProducer(peerId: string, producerId: string): void {
    const peer = this.requirePeer(peerId);
    const producer = this.requireProducer(peer, producerId);
    producer.close();
    this.removeProducer(peer, producerId);
  }

  public async consume(
    peerId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: unknown,
  ): Promise<ConsumerDescriptor> {
    const peer = this.requirePeer(peerId);
    const state = this.requireTransport(peer, transportId);
    if (state.direction !== 'recv') throw new GatewayError('BAD_REQUEST', 'A receive transport is required', 400);
    if (peer.consumers.size >= this.maxConsumersPerPeer) {
      throw new GatewayError('CONFLICT', 'Peer consumer capacity reached', 409);
    }
    const owner = this.findProducer(producerId);
    if (!owner) throw new GatewayError('PRODUCER_NOT_FOUND', 'Producer not found', 404);
    if (owner.peerId === peerId) throw new GatewayError('BAD_REQUEST', 'Cannot consume own producer', 400);
    const capabilities = rtpCapabilities as RtpCapabilities;
    if (!this.router.canConsume({ producerId, rtpCapabilities: capabilities })) {
      throw new GatewayError('BAD_REQUEST', 'RTP capabilities cannot consume this producer', 400);
    }
    const consumer = await state.transport.consume({ producerId, rtpCapabilities: capabilities, paused: true });
    peer.consumers.set(consumer.id, consumer);
    consumer.on('transportclose', () => peer.consumers.delete(consumer.id));
    consumer.on('producerclose', () => peer.consumers.delete(consumer.id));
    return {
      id: consumer.id,
      producerId,
      peerId: owner.peerId,
      kind: 'audio',
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused,
    };
  }

  public async resumeConsumer(peerId: string, consumerId: string): Promise<void> {
    const peer = this.requirePeer(peerId);
    const consumer = peer.consumers.get(consumerId);
    if (!consumer) throw new GatewayError('PRODUCER_NOT_FOUND', 'Consumer not found', 404);
    await consumer.resume();
  }

  public listProducers(exceptPeerId?: string): Array<{ producerId: string; peerId: string }> {
    const result: Array<{ producerId: string; peerId: string }> = [];
    for (const [peerId, peer] of this.peers) {
      if (peerId === exceptPeerId) continue;
      for (const producerId of peer.producers.keys()) result.push({ producerId, peerId });
    }
    return result;
  }

  public async getStats(): Promise<MediaStats> {
    const transports = [...this.peers.values()].flatMap((peer) => [...peer.transports.values()]);
    const stats = await Promise.all(
      transports.map(async ({ transport }) => (await transport.getStats())[0]).map((promise) => promise.catch(() => undefined)),
    );
    return {
      transports: transports.length,
      consumers: [...this.peers.values()].reduce((total, peer) => total + peer.consumers.size, 0),
      receiveBitrate: stats.reduce((total, stat) => total + (stat?.recvBitrate ?? 0), 0),
      sendBitrate: stats.reduce((total, stat) => total + (stat?.sendBitrate ?? 0), 0),
      packetLossReceived: stats.reduce((total, stat) => total + (stat?.rtpPacketLossReceived ?? 0), 0),
      packetLossSent: stats.reduce((total, stat) => total + (stat?.rtpPacketLossSent ?? 0), 0),
    };
  }

  public close(): void {
    if (this.closed) return;
    for (const peerId of [...this.peers.keys()]) this.removePeer(peerId);
    this.observer.close();
    this.router.close();
    this.emit('close');
    this.removeAllListeners();
  }

  private requirePeer(peerId: string): PeerState {
    const peer = this.peers.get(peerId);
    if (!peer) throw new GatewayError('PEER_NOT_FOUND', 'Peer not found', 404);
    return peer;
  }

  private requireTransport(peer: PeerState, transportId: string): TransportState {
    const state = peer.transports.get(transportId);
    if (!state) throw new GatewayError('TRANSPORT_NOT_FOUND', 'Transport not found', 404);
    return state;
  }

  private requireProducer(peer: PeerState, producerId: string): Producer {
    const producer = peer.producers.get(producerId);
    if (!producer) throw new GatewayError('PRODUCER_NOT_FOUND', 'Producer not found', 404);
    return producer;
  }

  private findProducer(producerId: string): { peerId: string; producer: Producer } | undefined {
    for (const [peerId, peer] of this.peers) {
      const producer = peer.producers.get(producerId);
      if (producer) return { peerId, producer };
    }
    return undefined;
  }

  private removeProducer(peer: PeerState, producerId: string): void {
    const producer = peer.producers.get(producerId);
    if (!producer) return;
    peer.producers.delete(producerId);
    void this.observer.removeProducer({ producerId }).catch(() => undefined);
    this.emit('producerClosed', { producerId, peerId: peer.identity.peerId });
  }

  private closeTransport(peer: PeerState, transportId: string): void {
    const state = peer.transports.get(transportId);
    if (!state) return;
    state.transport.close();
    peer.transports.delete(transportId);
  }

  private assertOpus(value: unknown): void {
    if (!value || typeof value !== 'object' || !('codecs' in value) || !Array.isArray(value.codecs)) {
      throw new GatewayError('BAD_REQUEST', 'Invalid RTP parameters', 400);
    }
    const codecs = value.codecs as Array<{ mimeType?: unknown }>;
    if (codecs.length === 0 || codecs.some((codec) => String(codec.mimeType).toLowerCase() !== 'audio/opus')) {
      throw new GatewayError('BAD_REQUEST', 'Only Opus audio is supported', 400);
    }
  }
}
