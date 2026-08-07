import { EventEmitter } from 'node:events';
import { vi } from 'vitest';
import type { VoiceConfig } from '../src/config.js';
import type {
  ConsumerDescriptor,
  MediaAdapter,
  MediaRoom,
  PeerIdentity,
  ProducerDescriptor,
  TransportDescriptor,
  TransportDirection,
  WorkerDeath,
} from '../src/media/contracts.js';

export const CALL_ID = '11111111-1111-4111-8111-111111111111';
export const GROUP_ID = '22222222-2222-4222-8222-222222222222';

export function testConfig(overrides: Partial<VoiceConfig> = {}): VoiceConfig {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 0,
    nodeId: 'voice-test-1',
    signalingUrl: 'ws://127.0.0.1/ws',
    jwtSecret: new TextEncoder().encode('test-secret-that-is-at-least-32-bytes-long'),
    apiCallbackUrl: null,
    apiCallbackTimeoutMs: 1000,
    apiCallbackMaxAttempts: 3,
    apiCallbackMaxConcurrency: 2,
    apiCallbackQueueCapacity: 10,
    listenIp: '127.0.0.1',
    announcedAddress: '127.0.0.1',
    rtcPortBase: 45000,
    workerCount: 1,
    maxRooms: 10,
    maxPeersPerRoom: 10,
    maxTransportsPerPeer: 2,
    maxConsumersPerPeer: 20,
    httpBodyLimitBytes: 1024,
    wsMaxPayloadBytes: 8192,
    authTimeoutMs: 1000,
    disconnectGraceMs: 0,
    requestsPer10Seconds: 100,
    replayTtlSeconds: 120,
    enableTcp: true,
    enableUdp: true,
    workerLogLevel: 'none',
    ...overrides,
  };
}

export class MockMediaRoom extends EventEmitter implements MediaRoom {
  public closed = false;
  public readonly peers = new Map<string, PeerIdentity>();
  public readonly producers = new Map<string, string>();
  public readonly id: string;
  public readonly workerId = 'mock-worker-1';
  public readonly createTransport = vi.fn(async (_peerId: string, _direction: TransportDirection): Promise<TransportDescriptor> => ({
    id: 'transport-1', iceParameters: {}, iceCandidates: [], dtlsParameters: {},
  }));
  public readonly connectTransport = vi.fn(async () => undefined);
  public readonly produceAudio = vi.fn(async (peerId: string): Promise<ProducerDescriptor> => {
    const id = `producer-${peerId}`;
    this.producers.set(id, peerId);
    return { id };
  });
  public readonly pauseProducer = vi.fn(async () => undefined);
  public readonly resumeProducer = vi.fn(async () => undefined);
  public readonly consume = vi.fn(async (
    _peerId: string,
    _transportId: string,
    producerId: string,
  ): Promise<ConsumerDescriptor> => ({
    id: 'consumer-1', producerId, peerId: this.producers.get(producerId) ?? 'remote', kind: 'audio',
    rtpParameters: {}, type: 'simple', producerPaused: false,
  }));
  public readonly resumeConsumer = vi.fn(async () => undefined);

  public constructor(id = CALL_ID) {
    super();
    this.id = id;
  }

  public getRtpCapabilities(): unknown {
    return { codecs: [{ mimeType: 'audio/opus', clockRate: 48000, channels: 2 }] };
  }

  public addPeer(peer: PeerIdentity): void {
    this.peers.set(peer.peerId, peer);
  }

  public removePeer(peerId: string): void {
    this.peers.delete(peerId);
  }

  public closeProducer(peerId: string, producerId: string): void {
    if (this.producers.get(producerId) === peerId) this.producers.delete(producerId);
  }

  public listProducers(exceptPeerId?: string): Array<{ producerId: string; peerId: string }> {
    return [...this.producers].flatMap(([producerId, peerId]) => peerId === exceptPeerId ? [] : [{ producerId, peerId }]);
  }

  public async getStats() {
    return {
      transports: this.createTransport.mock.calls.length,
      consumers: this.consume.mock.calls.length,
      receiveBitrate: 0,
      sendBitrate: 0,
      packetLossReceived: 0,
      packetLossSent: 0,
    };
  }

  public close(): void {
    this.closed = true;
    this.peers.clear();
    this.producers.clear();
    this.emit('close');
  }
}

export class MockMediaAdapter implements MediaAdapter {
  public healthyWorkerCount = 1;
  public readonly workerCount = 1;
  public readonly rooms = new Map<string, MockMediaRoom>();
  public readonly start = vi.fn(async () => undefined);
  public readonly stop = vi.fn(async () => undefined);
  private deathHandler?: (death: WorkerDeath) => void;

  public async createRoom(callId: string): Promise<MediaRoom> {
    const room = new MockMediaRoom(callId);
    this.rooms.set(callId, room);
    return room;
  }

  public onWorkerDeath(handler: (death: WorkerDeath) => void): void {
    this.deathHandler = handler;
  }

  public killWorker(roomIds: string[]): void {
    this.healthyWorkerCount = 0;
    this.deathHandler?.({ workerId: 'mock-worker-1', roomIds });
  }
}
