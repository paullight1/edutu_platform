import type { VoiceConfig } from '../config.js';
import type { Logger } from '../observability/logger.js';
import type { Metrics } from '../observability/metrics.js';
import type { MediaAdapter, MediaRoom, WorkerDeath } from './contracts.js';
import { MediasoupRoom } from './mediasoup-room.js';
import { WorkerPool } from './worker-pool.js';

const opusCodecs = [
  {
    kind: 'audio' as const,
    mimeType: 'audio/opus' as const,
    clockRate: 48_000,
    channels: 2,
    parameters: { minptime: 10, useinbandfec: 1 },
  },
];

export class MediasoupAdapter implements MediaAdapter {
  private readonly pool: WorkerPool;

  public constructor(
    private readonly config: VoiceConfig,
    metrics: Metrics,
    logger: Logger,
  ) {
    this.pool = new WorkerPool(config, metrics, logger);
  }

  public get healthyWorkerCount(): number {
    return this.pool.size;
  }

  public get workerCount(): number {
    return this.config.workerCount;
  }

  public start(): Promise<void> {
    return this.pool.start();
  }

  public stop(): Promise<void> {
    return this.pool.stop();
  }

  public onWorkerDeath(handler: (death: WorkerDeath) => void): void {
    this.pool.onDeath(handler);
  }

  public async createRoom(callId: string): Promise<MediaRoom> {
    const slot = this.pool.leastLoaded();
    const router = await slot.worker.createRouter({ mediaCodecs: opusCodecs });
    const observer = await router.createAudioLevelObserver({
      maxEntries: 8,
      threshold: -70,
      interval: 500,
      appData: { callId },
    });
    this.pool.reserveRoom(slot, callId);
    const room = new MediasoupRoom(
      callId,
      slot.id,
      router,
      slot.webRtcServer,
      observer,
      this.config.maxTransportsPerPeer,
      this.config.maxConsumersPerPeer,
      this.config.enableUdp,
      this.config.enableTcp,
    );
    room.once('close', () => this.pool.releaseRoom(slot, callId));
    return room;
  }
}
