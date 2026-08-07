import type { AddressInfo } from 'node:net';
import { SignJWT } from 'jose';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVoiceGateway, type VoiceGateway } from '../src/app.js';
import type {
  ParticipantJoinedConfirmation,
  ParticipantJoinedConfirmer,
} from '../src/control-plane/participant-joined-confirmer.js';
import { silentLogger } from '../src/observability/logger.js';
import { CALL_ID, GROUP_ID, MockMediaAdapter, testConfig } from './helpers.js';

describe('WebSocket signaling contract', () => {
  let gateway: VoiceGateway | undefined;
  let socket: WebSocket | undefined;

  afterEach(async () => {
    socket?.terminate();
    await gateway?.stop();
    socket = undefined;
    gateway = undefined;
  });

  function nextMessage(): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!socket) return reject(new Error('Socket unavailable'));
      socket.once('message', (data) => {
        try { resolve(JSON.parse(data.toString()) as Record<string, unknown>); }
        catch (error) { reject(error); }
      });
    });
  }

  function send(action: string, requestId: string, data: Record<string, unknown> = {}) {
    if (!socket) throw new Error('Socket unavailable');
    const response = nextMessage();
    socket.send(JSON.stringify({ version: 1, requestId, action, data }));
    return response;
  }

  function successfulConfirmer(): ParticipantJoinedConfirmer {
    return {
      confirm: async () => undefined,
      stop: async () => undefined,
    };
  }

  it('returns Router RTP capabilities directly in response.data', async () => {
    gateway = createVoiceGateway(testConfig(), {
      media: new MockMediaAdapter(),
      logger: silentLogger,
      participantJoined: successfulConfirmer(),
    });
    await gateway.start();
    await gateway.rooms.prepare(CALL_ID);
    const token = await new SignJWT({ callId: CALL_ID, groupId: GROUP_ID, role: 'member' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuer('edutu-api')
      .setAudience('edutu-voice')
      .setJti('join-signaling-jti')
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(gateway.config.jwtSecret);
    const port = (gateway.http.server.address() as AddressInfo).port;
    socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => {
      socket?.once('open', () => resolve());
      socket?.once('error', reject);
    });

    await expect(send('authenticate', 'req-auth', { token })).resolves.toMatchObject({ ok: true });
    const response = await send('getRouterRtpCapabilities', 'req-caps');

    expect(response).toMatchObject({
      version: 1,
      requestId: 'req-caps',
      ok: true,
      data: { codecs: [{ mimeType: 'audio/opus' }] },
    });
    expect(response.data).not.toHaveProperty('rtpCapabilities');
  });

  it('awaits API attendance confirmation before authentication succeeds', async () => {
    let releaseConfirmation: (() => void) | undefined;
    let received: ParticipantJoinedConfirmation | undefined;
    const participantJoined: ParticipantJoinedConfirmer = {
      confirm: async (confirmation) => {
        received = confirmation;
        await new Promise<void>((resolve) => { releaseConfirmation = resolve; });
      },
      stop: async () => { releaseConfirmation?.(); },
    };
    const media = new MockMediaAdapter();
    gateway = createVoiceGateway(testConfig(), { media, logger: silentLogger, participantJoined });
    await gateway.start();
    await gateway.rooms.prepare(CALL_ID);
    const token = await new SignJWT({ callId: CALL_ID, groupId: GROUP_ID, role: 'member' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-confirmed')
      .setIssuer('edutu-api')
      .setAudience('edutu-voice')
      .setJti('join-confirmation-jti')
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(gateway.config.jwtSecret);
    const port = (gateway.http.server.address() as AddressInfo).port;
    socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => {
      socket?.once('open', () => resolve());
      socket?.once('error', reject);
    });

    const authentication = send('authenticate', 'req-confirmed', { token });
    await expect.poll(() => received).toEqual({
      callId: CALL_ID,
      userId: 'user-confirmed',
      joinTokenJti: 'join-confirmation-jti',
    });
    expect(media.rooms.get(CALL_ID)?.peers.size).toBe(1);
    releaseConfirmation?.();

    await expect(authentication).resolves.toMatchObject({
      ok: true,
      data: { callId: CALL_ID },
    });
  });

  it('removes the joined peer and returns MEDIA_UNAVAILABLE when confirmation fails', async () => {
    const participantJoined: ParticipantJoinedConfirmer = {
      confirm: async () => { throw new Error('API unavailable'); },
      stop: async () => undefined,
    };
    const media = new MockMediaAdapter();
    gateway = createVoiceGateway(testConfig(), { media, logger: silentLogger, participantJoined });
    await gateway.start();
    await gateway.rooms.prepare(CALL_ID);
    const token = await new SignJWT({ callId: CALL_ID, groupId: GROUP_ID, role: 'member' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-unconfirmed')
      .setIssuer('edutu-api')
      .setAudience('edutu-voice')
      .setJti('join-unconfirmed-jti')
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(gateway.config.jwtSecret);
    const port = (gateway.http.server.address() as AddressInfo).port;
    socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => {
      socket?.once('open', () => resolve());
      socket?.once('error', reject);
    });

    await expect(send('authenticate', 'req-unconfirmed', { token })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'MEDIA_UNAVAILABLE',
        message: 'Call attendance confirmation is temporarily unavailable',
      },
    });
    expect(media.rooms.get(CALL_ID)?.peers.size).toBe(0);
    expect(gateway.metrics.snapshot()).toEqual(expect.objectContaining({
      voice_signaling_auth_confirmation_failures_total: 1,
      voice_peers_connected: 0,
    }));
    expect(gateway.metrics.snapshot().voice_signaling_auth_success_total ?? 0).toBe(0);
  });

  it('removes a provisional peer when its socket closes during confirmation', async () => {
    let releaseConfirmation: (() => void) | undefined;
    let confirmationStarted = false;
    const participantJoined: ParticipantJoinedConfirmer = {
      confirm: async () => {
        confirmationStarted = true;
        await new Promise<void>((resolve) => { releaseConfirmation = resolve; });
      },
      stop: async () => { releaseConfirmation?.(); },
    };
    const media = new MockMediaAdapter();
    gateway = createVoiceGateway(testConfig(), { media, logger: silentLogger, participantJoined });
    await gateway.start();
    await gateway.rooms.prepare(CALL_ID);
    const token = await new SignJWT({ callId: CALL_ID, groupId: GROUP_ID, role: 'member' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-disconnected')
      .setIssuer('edutu-api')
      .setAudience('edutu-voice')
      .setJti('join-disconnected-jti')
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(gateway.config.jwtSecret);
    const port = (gateway.http.server.address() as AddressInfo).port;
    socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => {
      socket?.once('open', () => resolve());
      socket?.once('error', reject);
    });

    socket.send(JSON.stringify({
      version: 1,
      requestId: 'req-disconnected',
      action: 'authenticate',
      data: { token },
    }));
    await expect.poll(() => confirmationStarted).toBe(true);
    expect(media.rooms.get(CALL_ID)?.peers.size).toBe(1);
    const closed = new Promise<void>((resolve) => socket?.once('close', () => resolve()));
    socket.close(1000, 'Test disconnect');
    await closed;

    await expect.poll(() => media.rooms.get(CALL_ID)?.peers.size).toBe(0);
    releaseConfirmation?.();
    await expect.poll(() => gateway?.metrics.snapshot().voice_peers_connected).toBe(0);
    expect(gateway.metrics.snapshot().voice_signaling_auth_success_total ?? 0).toBe(0);
  });

  it('stops participant confirmation as part of app shutdown', async () => {
    const stop = vi.fn(async () => undefined);
    const participantJoined: ParticipantJoinedConfirmer = {
      confirm: async () => undefined,
      stop,
    };
    gateway = createVoiceGateway(testConfig(), {
      media: new MockMediaAdapter(),
      logger: silentLogger,
      participantJoined,
    });
    await gateway.start();

    await gateway.stop();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
