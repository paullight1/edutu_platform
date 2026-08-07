import type { AddressInfo } from 'node:net';
import { SignJWT } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import { createVoiceGateway, type VoiceGateway } from '../src/app.js';
import { silentLogger } from '../src/observability/logger.js';
import { CALL_ID, MockMediaAdapter, testConfig } from './helpers.js';

describe('HTTP control plane', () => {
  let gateway: VoiceGateway | undefined;

  afterEach(async () => {
    await gateway?.stop();
    gateway = undefined;
  });

  async function serviceToken(jti: string): Promise<string> {
    if (!gateway) throw new Error('Gateway not started');
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('edutu-api')
      .setIssuer('edutu-api')
      .setAudience('edutu-voice-internal')
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(gateway.config.jwtSecret);
  }

  it('returns the integration room contract and handles prepare/end idempotently', async () => {
    const config = testConfig({ signalingUrl: 'wss://voice.example.test/ws' });
    gateway = createVoiceGateway(config, { media: new MockMediaAdapter(), logger: silentLogger });
    await gateway.start();
    const port = (gateway.http.server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const first = await fetch(`${baseUrl}/internal/calls/${CALL_ID}/room`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${await serviceToken('service-jti-first')}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(first.status).toBe(201);
    await expect(first.json()).resolves.toEqual({
      nodeId: 'voice-test-1',
      roomId: CALL_ID,
      signalingUrl: 'wss://voice.example.test/ws',
    });

    const repeated = await fetch(`${baseUrl}/internal/calls/${CALL_ID}/room`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${await serviceToken('service-jti-second')}` },
    });
    expect(repeated.status).toBe(200);

    const ended = await fetch(`${baseUrl}/internal/calls/${CALL_ID}/room`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${await serviceToken('service-jti-third')}` },
    });
    expect(ended.status).toBe(204);
    const endedAgain = await fetch(`${baseUrl}/internal/calls/${CALL_ID}/room`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${await serviceToken('service-jti-fourth')}` },
    });
    expect(endedAgain.status).toBe(204);
  });

  it('rejects replayed control tokens', async () => {
    gateway = createVoiceGateway(testConfig(), { media: new MockMediaAdapter(), logger: silentLogger });
    await gateway.start();
    const port = (gateway.http.server.address() as AddressInfo).port;
    const url = `http://127.0.0.1:${port}/internal/calls/${CALL_ID}/room`;
    const token = await serviceToken('service-replay-jti');
    expect((await fetch(url, { method: 'PUT', headers: { authorization: `Bearer ${token}` } })).status).toBe(201);
    const replay = await fetch(url, { method: 'PUT', headers: { authorization: `Bearer ${token}` } });
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({ error: { code: 'AUTH_REPLAY' } });
  });
});
