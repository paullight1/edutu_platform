import { afterAll, describe, expect, it } from 'vitest';
import { MediasoupAdapter } from '../src/media/mediasoup-adapter.js';
import { silentLogger } from '../src/observability/logger.js';
import { Metrics } from '../src/observability/metrics.js';
import { CALL_ID, testConfig } from './helpers.js';

const enabled = process.env.RUN_MEDIASOUP_SMOKE === '1';

describe.skipIf(!enabled)('real mediasoup worker smoke test', () => {
  const adapter = new MediasoupAdapter(
    testConfig({ rtcPortBase: 45990, enableTcp: true, enableUdp: true }),
    new Metrics(),
    silentLogger,
  );

  afterAll(async () => adapter.stop());

  it('starts a worker, binds WebRTC listeners, and creates an Opus-only Router', async () => {
    await adapter.start();
    expect(adapter.healthyWorkerCount).toBe(1);
    const room = await adapter.createRoom(CALL_ID);
    expect(room.getRtpCapabilities()).toMatchObject({
      codecs: [expect.objectContaining({ mimeType: 'audio/opus', clockRate: 48000 })],
    });
    room.close();
  });
});
