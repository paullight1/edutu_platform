import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import type { VoiceConfig } from '../config.js';
import type { Metrics } from '../observability/metrics.js';

const CALLBACK_TOKEN_TTL_SECONDS = 30;

export type ApiCallbackRequest = {
  path: string;
  action: string;
  claims: Readonly<Record<string, string>>;
  body: Readonly<Record<string, unknown>>;
  acceptNotFound?: boolean;
};

export class ApiCallbackError extends Error {
  public constructor(
    public readonly reason: 'disabled' | 'stopping' | 'http' | 'transport',
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'ApiCallbackError';
  }
}

/**
 * Delivers short-lived, gateway-signed control-plane callbacks. Each logical
 * request is bounded by the configured attempt count and each attempt has its
 * own timeout and freshly minted JWT/JTI.
 */
export class ApiCallbackClient {
  private readonly active = new Set<Promise<void>>();
  private readonly controllers = new Set<AbortController>();
  private stopping = false;

  public constructor(
    private readonly config: VoiceConfig,
    private readonly metrics: Metrics,
  ) {}

  public post(request: ApiCallbackRequest): Promise<void> {
    if (!this.config.apiCallbackUrl) {
      return Promise.reject(new ApiCallbackError('disabled', 'API callback URL is not configured'));
    }
    if (this.stopping) {
      return Promise.reject(new ApiCallbackError('stopping', 'API callback client is stopping'));
    }

    const controller = new AbortController();
    this.controllers.add(controller);
    const delivery = this.deliver(request, controller.signal).finally(() => {
      this.controllers.delete(controller);
      this.active.delete(delivery);
    });
    this.active.add(delivery);
    return delivery;
  }

  public async stop(): Promise<void> {
    this.stopping = true;
    for (const controller of this.controllers) controller.abort();
    await Promise.allSettled([...this.active]);
  }

  private async deliver(request: ApiCallbackRequest, signal: AbortSignal): Promise<void> {
    const callbackUrl = this.callbackUrl(request.path);
    const requestId = randomUUID();
    let lastError = new ApiCallbackError('transport', 'API callback was not attempted');

    for (let attempt = 1; attempt <= this.config.apiCallbackMaxAttempts; attempt += 1) {
      if (signal.aborted || this.stopping) {
        throw new ApiCallbackError('stopping', 'API callback client is stopping');
      }

      const attemptController = new AbortController();
      const abortAttempt = () => attemptController.abort();
      signal.addEventListener('abort', abortAttempt, { once: true });
      const timeout = setTimeout(() => attemptController.abort(), this.config.apiCallbackTimeoutMs);
      timeout.unref();

      try {
        const token = await this.signToken(request.action, request.claims);
        this.metrics.increment('voice_api_callback_attempts_total', 1, 'Control-plane callback HTTP attempts');
        const response = await fetch(callbackUrl, {
          method: 'POST',
          redirect: 'error',
          signal: attemptController.signal,
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            'x-request-id': requestId,
          },
          body: JSON.stringify(request.body),
        });
        await response.body?.cancel().catch(() => undefined);
        if (response.ok || (request.acceptNotFound === true && response.status === 404)) return;
        lastError = new ApiCallbackError(
          'http',
          `API callback returned HTTP ${response.status}`,
          response.status,
        );
        if (!this.isRetryableStatus(response.status)) break;
      } catch (error) {
        if (signal.aborted || this.stopping) {
          throw new ApiCallbackError('stopping', 'API callback client is stopping');
        }
        lastError = error instanceof ApiCallbackError
          ? error
          : new ApiCallbackError('transport', 'API callback transport failed');
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abortAttempt);
      }

      if (attempt < this.config.apiCallbackMaxAttempts) {
        this.metrics.increment('voice_api_callback_retries_total', 1, 'Retried control-plane callback attempts');
        await this.retryDelay(attempt, signal);
      }
    }

    throw lastError;
  }

  private async signToken(action: string, claims: Readonly<Record<string, string>>): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ ...claims, action })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('edutu-voice')
      .setAudience('edutu-api-internal')
      .setSubject('edutu-voice')
      .setJti(randomUUID())
      .setIssuedAt(now)
      .setExpirationTime(now + CALLBACK_TOKEN_TTL_SECONDS)
      .sign(this.config.jwtSecret);
  }

  private callbackUrl(path: string): URL {
    const base = this.config.apiCallbackUrl;
    if (!base) throw new ApiCallbackError('disabled', 'API callback URL is not configured');
    return new URL(path, base);
  }

  private isRetryableStatus(status: number): boolean {
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  private retryDelay(attempt: number, signal: AbortSignal): Promise<void> {
    const delayMs = Math.min(250 * (2 ** (attempt - 1)), 2000);
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new ApiCallbackError('stopping', 'API callback client is stopping'));
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(new ApiCallbackError('stopping', 'API callback client is stopping'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, delayMs);
      timer.unref();
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
