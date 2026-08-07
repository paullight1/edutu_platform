import * as mediasoup from 'mediasoup';
import type { WebRtcServer, Worker } from 'mediasoup/types';
import type { VoiceConfig } from '../config.js';
import type { Logger } from '../observability/logger.js';
import type { Metrics } from '../observability/metrics.js';
import type { WorkerDeath } from './contracts.js';

export type WorkerSlot = {
  index: number;
  id: string;
  worker: Worker;
  webRtcServer: WebRtcServer;
  roomIds: Set<string>;
};

export class WorkerPool {
  private readonly slots = new Map<number, WorkerSlot>();
  private readonly deathHandlers = new Set<(death: WorkerDeath) => void>();
  private readonly restartTimers = new Map<number, NodeJS.Timeout>();
  private readonly replacementSpawns = new Set<Promise<void>>();
  private stopping = false;

  public constructor(
    private readonly config: VoiceConfig,
    private readonly metrics: Metrics,
    private readonly logger: Logger,
  ) {}

  public get size(): number {
    return this.slots.size;
  }

  public async start(): Promise<void> {
    this.stopping = false;
    const starts = Array.from({ length: this.config.workerCount }, (_, index) => this.spawn(index));
    await Promise.all(starts);
    this.updateMetrics();
  }

  public onDeath(handler: (death: WorkerDeath) => void): void {
    this.deathHandlers.add(handler);
  }

  public leastLoaded(): WorkerSlot {
    const candidates = [...this.slots.values()].sort(
      (left, right) => left.roomIds.size - right.roomIds.size || left.index - right.index,
    );
    const slot = candidates[0];
    if (!slot) throw new Error('No healthy mediasoup worker is available');
    return slot;
  }

  public releaseRoom(slot: WorkerSlot, roomId: string): void {
    slot.roomIds.delete(roomId);
    this.updateMetrics();
  }

  public reserveRoom(slot: WorkerSlot, roomId: string): void {
    slot.roomIds.add(roomId);
    this.updateMetrics();
  }

  public async stop(): Promise<void> {
    this.stopping = true;
    for (const timer of this.restartTimers.values()) clearTimeout(timer);
    this.restartTimers.clear();
    for (const slot of this.slots.values()) {
      slot.webRtcServer.close();
      slot.worker.close();
    }
    this.slots.clear();
    await Promise.allSettled([...this.replacementSpawns]);
    this.updateMetrics();
  }

  private async spawn(index: number): Promise<void> {
    const worker = await mediasoup.createWorker({ logLevel: this.config.workerLogLevel });
    if (this.stopping) {
      worker.close();
      return;
    }
    const listenInfos = [];
    const port = this.config.rtcPortBase + index;
    if (this.config.enableUdp) {
      listenInfos.push({ protocol: 'udp' as const, ip: this.config.listenIp, announcedAddress: this.config.announcedAddress, port });
    }
    if (this.config.enableTcp) {
      listenInfos.push({ protocol: 'tcp' as const, ip: this.config.listenIp, announcedAddress: this.config.announcedAddress, port });
    }
    let webRtcServer: WebRtcServer;
    try {
      webRtcServer = await worker.createWebRtcServer({ listenInfos });
    } catch (error) {
      worker.close();
      throw error;
    }
    if (this.stopping) {
      webRtcServer.close();
      worker.close();
      return;
    }
    const id = `worker-${index}-${worker.pid}`;
    const slot: WorkerSlot = { index, id, worker, webRtcServer, roomIds: new Set() };
    this.slots.set(index, slot);
    worker.on('died', (error) => this.handleDeath(slot, error));
    this.logger.info('media_worker_started', { workerId: id, workerIndex: index, rtcPort: port });
  }

  private handleDeath(slot: WorkerSlot, error: Error): void {
    if (this.slots.get(slot.index)?.id !== slot.id) return;
    this.slots.delete(slot.index);
    const roomIds = [...slot.roomIds];
    this.metrics.increment('voice_worker_deaths_total', 1, 'Mediasoup worker subprocess deaths');
    this.updateMetrics();
    this.logger.error('media_worker_died', {
      workerId: slot.id,
      workerIndex: slot.index,
      affectedRooms: roomIds.length,
      errorName: error.name,
    });
    for (const handler of this.deathHandlers) {
      try {
        handler({ workerId: slot.id, roomIds });
      } catch (handlerError) {
        this.logger.error('media_worker_death_handler_failed', {
          workerId: slot.id,
          errorName: handlerError instanceof Error ? handlerError.name : 'UnknownError',
        });
      }
    }

    this.scheduleRestart(slot.index, 1);
  }

  private scheduleRestart(index: number, attempt: number): void {
    if (this.stopping || this.restartTimers.has(index)) return;
    const delayMs = Math.min(1000 * (2 ** (attempt - 1)), 30_000);
    const timer = setTimeout(() => {
      this.restartTimers.delete(index);
      if (this.stopping) return;
      const replacement = this.spawn(index)
        .then(() => this.updateMetrics())
        .catch((spawnError: unknown) => {
          this.logger.error('media_worker_restart_failed', {
            workerIndex: index,
            attempt,
            errorName: spawnError instanceof Error ? spawnError.name : 'UnknownError',
          });
          this.scheduleRestart(index, attempt + 1);
        })
        .finally(() => this.replacementSpawns.delete(replacement));
      this.replacementSpawns.add(replacement);
    }, delayMs);
    timer.unref();
    this.restartTimers.set(index, timer);
  }

  private updateMetrics(): void {
    this.metrics.set('voice_workers_healthy', this.slots.size, 'Healthy mediasoup workers');
  }
}
