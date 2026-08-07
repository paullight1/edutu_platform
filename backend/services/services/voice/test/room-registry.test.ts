import { describe, expect, it, vi } from 'vitest';
import type { MediaFailureReporter } from '../src/control-plane/media-failure-reporter.js';
import { Metrics } from '../src/observability/metrics.js';
import { silentLogger } from '../src/observability/logger.js';
import { RoomRegistry } from '../src/rooms/room-registry.js';
import { CALL_ID, GROUP_ID, MockMediaAdapter, testConfig } from './helpers.js';

describe('RoomRegistry', () => {
  it('prepares idempotently and closes idempotently', async () => {
    const media = new MockMediaAdapter();
    const registry = new RoomRegistry(media, testConfig(), new Metrics(), silentLogger);

    await expect(registry.prepare(CALL_ID)).resolves.toEqual({ roomId: CALL_ID, created: true });
    await expect(registry.prepare(CALL_ID)).resolves.toEqual({ roomId: CALL_ID, created: false });
    expect(media.rooms.size).toBe(1);
    expect(registry.end(CALL_ID)).toBe(true);
    expect(registry.end(CALL_ID)).toBe(false);
  });

  it('emits membershipRevoked and removes every device for the user', async () => {
    const media = new MockMediaAdapter();
    const registry = new RoomRegistry(media, testConfig(), new Metrics(), silentLogger);
    await registry.prepare(CALL_ID);
    const firstSink = vi.fn();
    const secondSink = vi.fn();
    registry.join(CALL_ID, { peerId: 'peer-1', userId: 'user-1', groupId: GROUP_ID, role: 'member' }, firstSink);
    registry.join(CALL_ID, { peerId: 'peer-2', userId: 'user-1', groupId: GROUP_ID, role: 'member' }, secondSink);

    expect(registry.revokeMembership(CALL_ID, 'user-1')).toBe(2);
    expect(firstSink).toHaveBeenCalledWith(expect.objectContaining({ event: 'membershipRevoked' }));
    expect(secondSink).toHaveBeenCalledWith(expect.objectContaining({ event: 'membershipRevoked' }));
    expect(media.rooms.get(CALL_ID)?.peers.size).toBe(0);
  });

  it('notifies peers to reconnect and ends the room after worker death', async () => {
    const media = new MockMediaAdapter();
    const mediaFailures: MediaFailureReporter = {
      report: vi.fn(() => true),
      stop: vi.fn(async () => undefined),
    };
    const registry = new RoomRegistry(media, testConfig(), new Metrics(), silentLogger, mediaFailures);
    await registry.prepare(CALL_ID);
    const sink = vi.fn();
    registry.join(CALL_ID, { peerId: 'peer-1', userId: 'user-1', groupId: GROUP_ID, role: 'member' }, sink);

    media.killWorker([CALL_ID]);

    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ event: 'reconnectRequired' }));
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ event: 'callEnded' }));
    expect(registry.has(CALL_ID)).toBe(false);
    expect(mediaFailures.report).toHaveBeenCalledWith(CALL_ID, 'MEDIA_WORKER_DIED');
  });

  it('still cleans up and reports worker death when a peer sink throws', async () => {
    const media = new MockMediaAdapter();
    const mediaFailures: MediaFailureReporter = {
      report: vi.fn(() => true),
      stop: vi.fn(async () => undefined),
    };
    const registry = new RoomRegistry(media, testConfig(), new Metrics(), silentLogger, mediaFailures);
    await registry.prepare(CALL_ID);
    registry.join(
      CALL_ID,
      { peerId: 'peer-1', userId: 'user-1', groupId: GROUP_ID, role: 'member' },
      () => { throw new Error('socket closed'); },
    );

    expect(() => media.killWorker([CALL_ID])).not.toThrow();

    expect(registry.has(CALL_ID)).toBe(false);
    expect(mediaFailures.report).toHaveBeenCalledWith(CALL_ID, 'MEDIA_WORKER_DIED');
  });

  it('still removes a dead room when media cleanup throws', async () => {
    const media = new MockMediaAdapter();
    const mediaFailures: MediaFailureReporter = {
      report: vi.fn(() => true),
      stop: vi.fn(async () => undefined),
    };
    const registry = new RoomRegistry(media, testConfig(), new Metrics(), silentLogger, mediaFailures);
    await registry.prepare(CALL_ID);
    const room = media.rooms.get(CALL_ID);
    if (!room) throw new Error('Expected prepared room');
    vi.spyOn(room, 'close').mockImplementation(() => { throw new Error('worker already gone'); });

    expect(() => media.killWorker([CALL_ID])).not.toThrow();

    expect(registry.has(CALL_ID)).toBe(false);
    expect(mediaFailures.report).toHaveBeenCalledWith(CALL_ID, 'MEDIA_WORKER_DIED');
  });
});
