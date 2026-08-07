import type { VoiceConfig } from '../config.js';
import type { Logger } from '../observability/logger.js';
import type { Metrics } from '../observability/metrics.js';
import { ApiCallbackClient } from './api-callback-client.js';

export type MediaFailureCode = 'MEDIA_WORKER_DIED';

type FailureTask = {
  callId: string;
  failureCode: MediaFailureCode;
};

export interface MediaFailureReporter {
  report(callId: string, failureCode: MediaFailureCode): boolean;
  stop(): Promise<void>;
}

export class ApiMediaFailureReporter implements MediaFailureReporter {
  private readonly queue: FailureTask[] = [];
  private readonly pendingCallIds = new Set<string>();
  private readonly active = new Set<Promise<void>>();
  private readonly idleWaiters = new Set<() => void>();
  private readonly callbacks: ApiCallbackClient;
  private inFlight = 0;
  private stopping = false;

  public constructor(
    private readonly config: VoiceConfig,
    private readonly metrics: Metrics,
    private readonly logger: Logger,
    callbacks?: ApiCallbackClient,
  ) {
    this.callbacks = callbacks ?? new ApiCallbackClient(config, metrics);
    this.updateMetrics();
  }

  public report(callId: string, failureCode: MediaFailureCode): boolean {
    if (!this.config.apiCallbackUrl) {
      this.metrics.increment('voice_api_callbacks_disabled_total', 1, 'Media failures without a configured API callback');
      return false;
    }
    if (this.stopping) {
      this.metrics.increment('voice_api_callbacks_dropped_total', 1, 'Media failure callbacks dropped before delivery');
      return false;
    }
    if (this.pendingCallIds.has(callId)) return true;
    if (this.pendingCallIds.size >= this.config.apiCallbackQueueCapacity) {
      this.metrics.increment('voice_api_callbacks_dropped_total', 1, 'Media failure callbacks dropped before delivery');
      this.logger.error('media_failure_callback_queue_full', {
        callId,
        queueCapacity: this.config.apiCallbackQueueCapacity,
      });
      return false;
    }

    this.pendingCallIds.add(callId);
    this.queue.push({ callId, failureCode });
    this.metrics.increment('voice_api_callbacks_enqueued_total', 1, 'Media failure callbacks accepted for delivery');
    this.updateMetrics();
    this.drain();
    return true;
  }

  public async stop(): Promise<void> {
    this.stopping = true;
    const queued = this.queue.splice(0);
    for (const task of queued) this.pendingCallIds.delete(task.callId);
    if (queued.length > 0) {
      this.metrics.increment('voice_api_callbacks_dropped_total', queued.length, 'Media failure callbacks dropped before delivery');
    }
    await this.callbacks.stop();
    await Promise.allSettled([...this.active]);
    this.updateMetrics();
  }

  public waitForIdle(): Promise<void> {
    if (this.queue.length === 0 && this.inFlight === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }

  private drain(): void {
    while (
      !this.stopping
      && this.inFlight < this.config.apiCallbackMaxConcurrency
      && this.queue.length > 0
    ) {
      const task = this.queue.shift();
      if (!task) break;
      this.inFlight += 1;
      const delivery = this.deliver(task)
        .catch((error: unknown) => {
          this.metrics.increment('voice_api_callbacks_exhausted_total', 1, 'Media failure callbacks that exhausted retries');
          this.logger.error('media_failure_callback_exhausted', {
            callId: task.callId,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          });
        })
        .finally(() => {
          this.inFlight -= 1;
          this.pendingCallIds.delete(task.callId);
          this.active.delete(delivery);
          this.updateMetrics();
          this.resolveIdleIfNeeded();
          this.drain();
        });
      this.active.add(delivery);
    }
    this.updateMetrics();
  }

  private async deliver(task: FailureTask): Promise<void> {
    await this.callbacks.post({
      path: `/internal/community-calls/${encodeURIComponent(task.callId)}/media-failed`,
      action: 'media-failed',
      claims: { callId: task.callId },
      body: { failureCode: task.failureCode },
      acceptNotFound: true,
    });
    this.metrics.increment('voice_api_callbacks_succeeded_total', 1, 'Media failure callbacks accepted by the API');
  }

  private resolveIdleIfNeeded(): void {
    if (this.queue.length !== 0 || this.inFlight !== 0) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }

  private updateMetrics(): void {
    this.metrics.set('voice_api_callbacks_queued', this.queue.length, 'Queued media failure callbacks');
    this.metrics.set('voice_api_callbacks_in_flight', this.inFlight, 'In-flight media failure callbacks');
  }
}
