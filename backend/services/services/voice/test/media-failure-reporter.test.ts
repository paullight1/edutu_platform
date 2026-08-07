import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { jwtVerify, type JWTPayload } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiMediaFailureReporter } from '../src/control-plane/media-failure-reporter.js';
import { silentLogger } from '../src/observability/logger.js';
import { Metrics } from '../src/observability/metrics.js';
import { CALL_ID, testConfig } from './helpers.js';

type VerifiedCallback = JWTPayload & {
  sub: 'edutu-voice';
  callId: string;
  action: 'media-failed';
  jti: string;
};

const servers = new Set<Server>();

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all([...servers].map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
  servers.clear();
});

async function listen(server: Server): Promise<string> {
  servers.add(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

// Mirrors CommunityCallTokenService.verifyGatewayCallbackToken. Keeping this
// contract explicit prevents gateway and API claim changes from drifting silently.
async function verifyBackendCallbackContract(
  token: string,
  secret: Uint8Array,
  expectedCallId: string,
): Promise<VerifiedCallback> {
  const { payload, protectedHeader } = await jwtVerify(token, secret, {
    algorithms: ['HS256'],
    issuer: 'edutu-voice',
    audience: 'edutu-api-internal',
    clockTolerance: 5,
    maxTokenAge: '2m',
  });
  expect(protectedHeader).toEqual(expect.objectContaining({ alg: 'HS256', typ: 'JWT' }));
  if (
    payload.sub !== 'edutu-voice'
    || payload.callId !== expectedCallId
    || payload.action !== 'media-failed'
    || typeof payload.jti !== 'string'
    || payload.jti.length < 8
  ) {
    throw new Error('Backend callback claim mismatch');
  }
  return payload as VerifiedCallback;
}

describe('ApiMediaFailureReporter', () => {
  it('sends a callback JWT accepted by the documented backend claim contract', async () => {
    let received: { claims: VerifiedCallback; body: unknown; path: string; requestId?: string } | undefined;
    const secret = testConfig().jwtSecret;
    const server = createServer(async (request, response) => {
      try {
        const authorization = request.headers.authorization;
        if (!authorization?.startsWith('Bearer ')) throw new Error('Missing bearer token');
        const claims = await verifyBackendCallbackContract(authorization.slice(7), secret, CALL_ID);
        received = {
          claims,
          body: await readJson(request),
          path: request.url ?? '',
          ...(typeof request.headers['x-request-id'] === 'string'
            ? { requestId: request.headers['x-request-id'] }
            : {}),
        };
        response.writeHead(204).end();
      } catch {
        response.writeHead(403).end();
      }
    });
    const callbackUrl = await listen(server);
    const reporter = new ApiMediaFailureReporter(
      testConfig({ apiCallbackUrl: callbackUrl }),
      new Metrics(),
      silentLogger,
    );

    expect(reporter.report(CALL_ID, 'MEDIA_WORKER_DIED')).toBe(true);
    await reporter.waitForIdle();
    await reporter.stop();

    expect(received?.path).toBe(`/internal/community-calls/${CALL_ID}/media-failed`);
    expect(received?.body).toEqual({ failureCode: 'MEDIA_WORKER_DIED' });
    expect(received?.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(received?.claims).toEqual(expect.objectContaining({
      iss: 'edutu-voice',
      aud: 'edutu-api-internal',
      sub: 'edutu-voice',
      callId: CALL_ID,
      action: 'media-failed',
    }));
    expect(received?.claims.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(received?.claims.iat).toEqual(expect.any(Number));
    expect(received?.claims.exp).toBe((received?.claims.iat ?? 0) + 30);
  });

  it('retries transient responses with a fresh callback JWT', async () => {
    const secret = testConfig().jwtSecret;
    const jtis: string[] = [];
    let attempts = 0;
    const server = createServer(async (request, response) => {
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith('Bearer ')) {
        response.writeHead(403).end();
        return;
      }
      const claims = await verifyBackendCallbackContract(authorization.slice(7), secret, CALL_ID);
      jtis.push(claims.jti);
      await readJson(request);
      attempts += 1;
      response.writeHead(attempts === 1 ? 503 : 204).end();
    });
    const callbackUrl = await listen(server);
    const metrics = new Metrics();
    const reporter = new ApiMediaFailureReporter(
      testConfig({ apiCallbackUrl: callbackUrl, apiCallbackMaxAttempts: 2 }),
      metrics,
      silentLogger,
    );

    reporter.report(CALL_ID, 'MEDIA_WORKER_DIED');
    await reporter.waitForIdle();
    await reporter.stop();

    expect(attempts).toBe(2);
    expect(new Set(jtis).size).toBe(2);
    expect(metrics.snapshot()).toEqual(expect.objectContaining({
      voice_api_callback_attempts_total: 2,
      voice_api_callback_retries_total: 1,
      voice_api_callbacks_succeeded_total: 1,
      voice_api_callbacks_queued: 0,
      voice_api_callbacks_in_flight: 0,
    }));
  });

  it('bounds pending work and aborts in-flight delivery during shutdown', async () => {
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const metrics = new Metrics();
    const reporter = new ApiMediaFailureReporter(
      testConfig({ apiCallbackUrl: 'http://127.0.0.1:3000', apiCallbackQueueCapacity: 1 }),
      metrics,
      silentLogger,
    );

    expect(reporter.report(CALL_ID, 'MEDIA_WORKER_DIED')).toBe(true);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(reporter.report('33333333-3333-4333-8333-333333333333', 'MEDIA_WORKER_DIED')).toBe(false);

    await reporter.stop();
    await reporter.waitForIdle();

    expect(reporter.report('44444444-4444-4444-8444-444444444444', 'MEDIA_WORKER_DIED')).toBe(false);
    expect(metrics.snapshot()).toEqual(expect.objectContaining({
      voice_api_callbacks_queued: 0,
      voice_api_callbacks_in_flight: 0,
    }));
  });
});
