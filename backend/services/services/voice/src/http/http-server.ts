import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { readBearerToken, ReplayGuard, verifyInternalToken } from '../auth/jwt.js';
import type { VoiceConfig } from '../config.js';
import type { MediaAdapter } from '../media/contracts.js';
import type { Logger } from '../observability/logger.js';
import type { Metrics } from '../observability/metrics.js';
import type { RoomRegistry } from '../rooms/room-registry.js';
import { asGatewayError, GatewayError } from '../shared/errors.js';

const callPath = /^\/internal\/calls\/([0-9a-fA-F-]{36})\/room$/;
const uuidSchema = z.string().uuid();
const requestIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);

export class HttpGatewayServer {
  public readonly server: Server;
  private readonly replayGuard: ReplayGuard;

  public constructor(
    private readonly config: VoiceConfig,
    private readonly media: MediaAdapter,
    private readonly rooms: RoomRegistry,
    private readonly metrics: Metrics,
    private readonly logger: Logger,
  ) {
    this.replayGuard = new ReplayGuard(config.replayTtlSeconds);
    this.server = createServer({ maxHeaderSize: 8192, requireHostHeader: true }, (request, response) => {
      void this.handle(request, response);
    });
    this.server.requestTimeout = 10_000;
    this.server.headersTimeout = 5_000;
    this.server.keepAliveTimeout = 5_000;
    this.server.maxRequestsPerSocket = 100;
  }

  public listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      this.server.once('error', onError);
      this.server.listen(this.config.port, this.config.host, () => {
        this.server.off('error', onError);
        resolve();
      });
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((error) => error ? reject(error) : resolve());
      this.server.closeIdleConnections();
    });
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const startedAt = performance.now();
    const requestId = this.requestId(request);
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    response.setHeader('Referrer-Policy', 'no-referrer');

    try {
      const method = request.method ?? 'GET';
      const pathname = new URL(request.url ?? '/', 'http://voice.local').pathname;
      if (method === 'GET' && pathname === '/health') {
        this.json(response, 200, { status: 'ok', nodeId: this.config.nodeId });
        return;
      }
      if (method === 'GET' && pathname === '/ready') {
        const ready = this.media.healthyWorkerCount > 0;
        this.json(response, ready ? 200 : 503, {
          status: ready ? 'ready' : 'not_ready',
          nodeId: this.config.nodeId,
          healthyWorkers: this.media.healthyWorkerCount,
          expectedWorkers: this.media.workerCount,
        });
        return;
      }
      if (method === 'GET' && pathname === '/metrics') {
        await this.rooms.refreshMediaMetrics();
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        response.end(this.metrics.toPrometheus());
        return;
      }

      const match = callPath.exec(pathname);
      if (match && (method === 'PUT' || method === 'DELETE')) {
        const callId = uuidSchema.parse(match[1]);
        await verifyInternalToken(
          readBearerToken(Array.isArray(request.headers.authorization) ? undefined : request.headers.authorization),
          this.config.jwtSecret,
          this.replayGuard,
        );
        await this.readEmptyJsonBody(request);
        if (method === 'PUT') {
          const prepared = await this.rooms.prepare(callId);
          this.json(response, prepared.created ? 201 : 200, {
            nodeId: this.config.nodeId,
            roomId: prepared.roomId,
            signalingUrl: this.config.signalingUrl,
          });
        } else {
          this.rooms.end(callId);
          response.statusCode = 204;
          response.end();
        }
        return;
      }
      throw new GatewayError('CALL_NOT_FOUND', 'Route not found', 404);
    } catch (error) {
      const gatewayError = error instanceof z.ZodError
        ? new GatewayError('BAD_REQUEST', 'Invalid request path or body', 400)
        : asGatewayError(error);
      this.json(response, gatewayError.statusCode, {
        error: { code: gatewayError.code, message: gatewayError.message },
        requestId,
      });
      this.logger.warn('http_request_rejected', {
        requestId,
        method: request.method,
        statusCode: gatewayError.statusCode,
        errorCode: gatewayError.code,
      });
      this.metrics.increment('voice_http_errors_total', 1, 'HTTP error responses');
    } finally {
      this.metrics.increment('voice_http_requests_total', 1, 'HTTP requests');
      this.metrics.set('voice_http_last_request_duration_ms', performance.now() - startedAt, 'Last HTTP request duration');
    }
  }

  private requestId(request: IncomingMessage): string {
    const header = request.headers['x-request-id'];
    const candidate = Array.isArray(header) ? header[0] : header;
    return candidate && requestIdSchema.safeParse(candidate).success ? candidate : randomUUID();
  }

  private async readEmptyJsonBody(request: IncomingMessage): Promise<void> {
    const declaredLength = Number(request.headers['content-length'] ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > this.config.httpBodyLimitBytes) {
      request.resume();
      throw new GatewayError('BAD_REQUEST', 'Request body too large', 413);
    }
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunkValue of request) {
      const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue);
      length += chunk.length;
      if (length > this.config.httpBodyLimitBytes) {
        request.resume();
        throw new GatewayError('BAD_REQUEST', 'Request body too large', 413);
      }
      chunks.push(chunk);
    }
    if (length === 0) return;
    const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') throw new GatewayError('BAD_REQUEST', 'Content-Type must be application/json', 415);
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new GatewayError('BAD_REQUEST', 'Request body must be valid JSON', 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) {
      throw new GatewayError('BAD_REQUEST', 'Request body must be an empty JSON object', 400);
    }
  }

  private json(response: ServerResponse, statusCode: number, body: unknown): void {
    if (response.headersSent || response.destroyed) return;
    const payload = JSON.stringify(body);
    response.statusCode = statusCode;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Length', Buffer.byteLength(payload));
    response.end(payload);
  }
}
