import { EventEmitter } from 'node:events';
import type { AudioLevelObserver, Router, WebRtcServer, WebRtcTransport, Worker } from 'mediasoup/types';
import { describe, expect, it, vi } from 'vitest';
import { MediasoupRoom } from '../src/media/mediasoup-room.js';
import { WorkerPool, type WorkerSlot } from '../src/media/worker-pool.js';
import { Metrics } from '../src/observability/metrics.js';
import { silentLogger } from '../src/observability/logger.js';
import { CALL_ID, GROUP_ID, testConfig } from './helpers.js';

function mediaFakes() {
  const transport = Object.assign(new EventEmitter(), {
    id: 'transport-1',
    iceParameters: {},
    iceCandidates: [],
    dtlsParameters: {},
    close: vi.fn(),
    connect: vi.fn(async () => undefined),
  });
  let routerClosed = false;
  const router = Object.assign(new EventEmitter(), {
    get closed() { return routerClosed; },
    rtpCapabilities: { codecs: [{ mimeType: 'audio/opus' }] },
    createWebRtcTransport: vi.fn(async () => transport as unknown as WebRtcTransport),
    close: vi.fn(() => { routerClosed = true; }),
  });
  const observer = Object.assign(new EventEmitter(), {
    close: vi.fn(),
    addProducer: vi.fn(async () => undefined),
    removeProducer: vi.fn(async () => undefined),
  });
  return {
    transport,
    router: router as unknown as Router,
    observer: observer as unknown as AudioLevelObserver,
  };
}

describe('MediasoupRoom resource lifecycle', () => {
  it('releases reserved worker load when the room closes', () => {
    const config = testConfig();
    const pool = new WorkerPool(config, new Metrics(), silentLogger);
    const slot: WorkerSlot = {
      index: 0,
      id: 'worker-test',
      worker: {} as Worker,
      webRtcServer: {} as WebRtcServer,
      roomIds: new Set(),
    };
    const { router, observer } = mediaFakes();
    const room = new MediasoupRoom(CALL_ID, slot.id, router, slot.webRtcServer, observer, 2, 10, true, true);
    pool.reserveRoom(slot, CALL_ID);
    room.once('close', () => pool.releaseRoom(slot, CALL_ID));

    room.close();

    expect(slot.roomIds.size).toBe(0);
  });

  it('passes disabled UDP and enabled TCP settings to transport creation', async () => {
    const { router, observer } = mediaFakes();
    const room = new MediasoupRoom(
      CALL_ID,
      'worker-test',
      router,
      {} as WebRtcServer,
      observer,
      2,
      10,
      false,
      true,
    );
    room.addPeer({ peerId: 'peer-1', userId: 'user-1', groupId: GROUP_ID, role: 'member' });

    await room.createTransport('peer-1', 'send');

    expect(router.createWebRtcTransport).toHaveBeenCalledWith(expect.objectContaining({
      enableUdp: false,
      enableTcp: true,
      preferUdp: false,
    }));
  });
});
