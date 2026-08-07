import { EventEmitter } from 'node:events';
import * as mediasoup from 'mediasoup';
import type { WebRtcServer, Worker } from 'mediasoup/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerPool } from '../src/media/worker-pool.js';
import { silentLogger } from '../src/observability/logger.js';
import { Metrics } from '../src/observability/metrics.js';
import { testConfig } from './helpers.js';

vi.mock('mediasoup', () => ({ createWorker: vi.fn() }));

function fakeWorker(pid: number): { worker: Worker; webRtcServer: WebRtcServer } {
  const webRtcServer = { close: vi.fn() } as unknown as WebRtcServer;
  const worker = Object.assign(new EventEmitter(), {
    pid,
    close: vi.fn(),
    createWebRtcServer: vi.fn(async () => webRtcServer),
  }) as unknown as Worker;
  return { worker, webRtcServer };
}

describe('WorkerPool recovery lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(mediasoup.createWorker).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancels a pending replacement when the pool stops', async () => {
    const first = fakeWorker(1001);
    vi.mocked(mediasoup.createWorker).mockResolvedValue(first.worker);
    const pool = new WorkerPool(testConfig(), new Metrics(), silentLogger);
    await pool.start();

    first.worker.emit('died', new Error('worker exited'));
    await pool.stop();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mediasoup.createWorker).toHaveBeenCalledTimes(1);
  });

  it('closes a replacement worker that finishes spawning during shutdown', async () => {
    const first = fakeWorker(1001);
    const replacement = fakeWorker(1002);
    let resolveReplacement: ((worker: Worker) => void) | undefined;
    const pendingReplacement = new Promise<Worker>((resolve) => { resolveReplacement = resolve; });
    vi.mocked(mediasoup.createWorker)
      .mockResolvedValueOnce(first.worker)
      .mockImplementationOnce(() => pendingReplacement);
    const pool = new WorkerPool(testConfig(), new Metrics(), silentLogger);
    await pool.start();

    first.worker.emit('died', new Error('worker exited'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(mediasoup.createWorker).toHaveBeenCalledTimes(2);

    const stopping = pool.stop();
    resolveReplacement?.(replacement.worker);
    await stopping;

    expect(replacement.worker.close).toHaveBeenCalledOnce();
    expect(replacement.worker.createWebRtcServer).not.toHaveBeenCalled();
    expect(pool.size).toBe(0);
  });

  it('retries failed worker replacement with capped backoff', async () => {
    const first = fakeWorker(1001);
    const replacement = fakeWorker(1002);
    vi.mocked(mediasoup.createWorker)
      .mockResolvedValueOnce(first.worker)
      .mockRejectedValueOnce(new Error('temporary spawn failure'))
      .mockResolvedValueOnce(replacement.worker);
    const pool = new WorkerPool(testConfig(), new Metrics(), silentLogger);
    await pool.start();

    first.worker.emit('died', new Error('worker exited'));
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    expect(mediasoup.createWorker).toHaveBeenCalledTimes(3);
    expect(pool.size).toBe(1);
    await pool.stop();
  });

  it('isolates a failing death handler so remaining handlers still run', async () => {
    const first = fakeWorker(1001);
    vi.mocked(mediasoup.createWorker).mockResolvedValue(first.worker);
    const pool = new WorkerPool(testConfig(), new Metrics(), silentLogger);
    const healthyHandler = vi.fn();
    pool.onDeath(() => { throw new Error('handler failed'); });
    pool.onDeath(healthyHandler);
    await pool.start();

    first.worker.emit('died', new Error('worker exited'));

    expect(healthyHandler).toHaveBeenCalledWith(expect.objectContaining({ workerId: 'worker-0-1001' }));
    await pool.stop();
  });
});
