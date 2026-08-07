import type { EventEmitter } from 'node:events';

export type PeerIdentity = {
  peerId: string;
  userId: string;
  groupId: string;
  role: 'owner' | 'mod' | 'member';
};

export type TransportDirection = 'send' | 'recv';

export type TransportDescriptor = {
  id: string;
  iceParameters: unknown;
  iceCandidates: unknown;
  dtlsParameters: unknown;
};

export type ProducerDescriptor = { id: string };

export type ConsumerDescriptor = {
  id: string;
  producerId: string;
  peerId: string;
  kind: 'audio';
  rtpParameters: unknown;
  type: string;
  producerPaused: boolean;
};

export type MediaStats = {
  transports: number;
  consumers: number;
  receiveBitrate: number;
  sendBitrate: number;
  packetLossReceived: number;
  packetLossSent: number;
};

export type MediaRoomEvents = {
  producerClosed: [{ producerId: string; peerId: string }];
  participantMuted: [{ peerId: string; muted: boolean }];
  activeSpeakers: [{ speakers: Array<{ peerId: string; volume: number }> }];
};

export interface MediaRoom extends EventEmitter {
  readonly id: string;
  readonly workerId: string;
  readonly closed: boolean;
  getRtpCapabilities(): unknown;
  addPeer(peer: PeerIdentity): void;
  removePeer(peerId: string): void;
  createTransport(peerId: string, direction: TransportDirection): Promise<TransportDescriptor>;
  connectTransport(peerId: string, transportId: string, dtlsParameters: unknown): Promise<void>;
  produceAudio(peerId: string, transportId: string, rtpParameters: unknown): Promise<ProducerDescriptor>;
  pauseProducer(peerId: string, producerId: string): Promise<void>;
  resumeProducer(peerId: string, producerId: string): Promise<void>;
  closeProducer(peerId: string, producerId: string): void;
  consume(
    peerId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: unknown,
  ): Promise<ConsumerDescriptor>;
  resumeConsumer(peerId: string, consumerId: string): Promise<void>;
  listProducers(exceptPeerId?: string): Array<{ producerId: string; peerId: string }>;
  getStats(): Promise<MediaStats>;
  close(): void;
}

export type WorkerDeath = { workerId: string; roomIds: string[] };

export interface MediaAdapter {
  readonly healthyWorkerCount: number;
  readonly workerCount: number;
  start(): Promise<void>;
  stop(): Promise<void>;
  createRoom(callId: string): Promise<MediaRoom>;
  onWorkerDeath(handler: (death: WorkerDeath) => void): void;
}
