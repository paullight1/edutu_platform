import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { jwtVerify, type JWTPayload } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiParticipantJoinedConfirmer } from '../src/control-plane/participant-joined-confirmer.js';
import { silentLogger } from '../src/observability/logger.js';
import { Metrics } from '../src/observability/metrics.js';
import { CALL_ID, testConfig } from './helpers.js';

const USER_ID = 'user_contract_1';
const JOIN_TOKEN_JTI = 'join-token-contract-jti';

type VerifiedParticipantJoinedCallback = JWTPayload & {
  sub: 'edutu-voice';
  callId: string;
  userId: string;
  joinTokenJti: string;
  action: 'participant-joined';
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

async function verifyParticipantJoinedContract(
  token: string,
  secret: Uint8Array,
): Promise<VerifiedParticipantJoinedCallback> {
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
    || payload.callId !== CALL_ID
    || payload.userId !== USER_ID
    || payload.joinTokenJti !== JOIN_TOKEN_JTI
    || payload.action !== 'participant-joined'
    || typeof payload.jti !== 'string'
  ) {
    throw new Error('Participant-joined callback claim mismatch');
  }
  return payload as VerifiedParticipantJoinedCallback;
}

describe('ApiParticipantJoinedConfirmer', () => {
  it('sends the exact participant-joined route, body, and JWT contract', async () => {
    const secret = testConfig().jwtSecret;
    let received: {
      path: string;
      body: unknown;
      claims: VerifiedParticipantJoinedCallback;
      requestId?: string;
    } | undefined;
    const server = createServer(async (request, response) => {
      try {
        const authorization = request.headers.authorization;
        if (!authorization?.startsWith('Bearer ')) throw new Error('Missing bearer token');
        received = {
          path: request.url ?? '',
          body: await readJson(request),
          claims: await verifyParticipantJoinedContract(authorization.slice(7), secret),
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
    const confirmer = new ApiParticipantJoinedConfirmer(
      testConfig({ apiCallbackUrl: callbackUrl }),
      new Metrics(),
      silentLogger,
    );

    await confirmer.confirm({ callId: CALL_ID, userId: USER_ID, joinTokenJti: JOIN_TOKEN_JTI });
    await confirmer.stop();

    expect(received?.path).toBe(
      `/internal/community-calls/${CALL_ID}/participants/${USER_ID}/joined`,
    );
    expect(received?.body).toEqual({ joinTokenJti: JOIN_TOKEN_JTI });
    expect(received?.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(received?.claims).toEqual(expect.objectContaining({
      iss: 'edutu-voice',
      aud: 'edutu-api-internal',
      sub: 'edutu-voice',
      callId: CALL_ID,
      userId: USER_ID,
      joinTokenJti: JOIN_TOKEN_JTI,
      action: 'participant-joined',
    }));
    expect(received?.claims.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(received?.claims.iat).toEqual(expect.any(Number));
    expect(received?.claims.exp).toBe((received?.claims.iat ?? 0) + 30);
  });

  it('uses a fresh callback JTI when a transient response is retried', async () => {
    const secret = testConfig().jwtSecret;
    const callbackJtis: string[] = [];
    const server = createServer(async (request, response) => {
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith('Bearer ')) {
        response.writeHead(403).end();
        return;
      }
      const claims = await verifyParticipantJoinedContract(authorization.slice(7), secret);
      callbackJtis.push(claims.jti);
      await readJson(request);
      response.writeHead(callbackJtis.length === 1 ? 503 : 204).end();
    });
    const callbackUrl = await listen(server);
    const confirmer = new ApiParticipantJoinedConfirmer(
      testConfig({ apiCallbackUrl: callbackUrl, apiCallbackMaxAttempts: 2 }),
      new Metrics(),
      silentLogger,
    );

    await confirmer.confirm({ callId: CALL_ID, userId: USER_ID, joinTokenJti: JOIN_TOKEN_JTI });
    await confirmer.stop();

    expect(callbackJtis).toHaveLength(2);
    expect(new Set(callbackJtis).size).toBe(2);
  });

  it('aborts an in-flight confirmation during shutdown', async () => {
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true },
      );
    }));
    vi.stubGlobal('fetch', fetchMock);
    const confirmer = new ApiParticipantJoinedConfirmer(
      testConfig({ apiCallbackUrl: 'http://127.0.0.1:3000' }),
      new Metrics(),
      silentLogger,
    );
    const confirmation = confirmer.confirm({
      callId: CALL_ID,
      userId: USER_ID,
      joinTokenJti: JOIN_TOKEN_JTI,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const stopping = confirmer.stop();
    await expect(confirmation).rejects.toMatchObject({ name: 'ApiCallbackError', reason: 'stopping' });
    await stopping;
  });
});
