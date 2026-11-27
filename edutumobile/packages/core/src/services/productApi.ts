export type GetAuthToken = (options?: { skipCache?: boolean }) => Promise<string | null | undefined>;

/** Opt-in transport errors for actions that must distinguish retryable failures. */
export class ProductApiRequestError extends Error {
  constructor(public readonly kind: 'auth' | 'http' | 'network' | 'cancelled', public readonly status = 0) {
    super(kind === 'auth' || status === 401
      ? 'Your session could not be confirmed. Sign in and try again.'
      : 'Unable to confirm your save. Check your connection and try again.');
    this.name = 'ProductApiRequestError';
  }
}
export interface ProductApiRequestPolicy {
  throwOnError?: boolean;
  forceRefreshToken?: boolean;
}


let sessionTokenGetter: GetAuthToken | undefined;
export function setProductApiTokenGetter(getter?: GetAuthToken) { sessionTokenGetter = getter; }

const DEFAULT_TIMEOUT_MS = 12000;
const productGetRequests = new Map<string, Promise<unknown>>();

async function getTokenWithTimeout(
  getAuthToken: GetAuthToken,
  timeoutMs: number,
  forceRefresh = false,
): Promise<string | null | undefined> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getAuthToken(forceRefresh ? { skipCache: true } : undefined),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Thrown when the backend refuses an AI action for billing reasons — the
 * server is now the source of truth for credit debits and fair-use limits:
 * - HTTP 402 { code: 'insufficient_credits', required, message } → buy credits / go Pro
 * - HTTP 429 { code: 'limit' } → daily/fair-use limit reached
 * Callers surface this to the user (wallet / paywall CTA) instead of silently
 * falling back to local content.
 */
export class AiBillingError extends Error {
  code: 'insufficient_credits' | 'limit';
  status: number;
  /** Credits required for the action (402 responses only). */
  required?: number;

  constructor(params: { code: 'insufficient_credits' | 'limit'; status: number; required?: number; message?: string }) {
    super(
      params.message ||
        (params.code === 'limit'
          ? 'You have reached your AI usage limit for now.'
          : 'Not enough credits for this AI action.'),
    );
    this.name = 'AiBillingError';
    this.code = params.code;
    this.status = params.status;
    this.required = params.required;
  }
}

export function isAiBillingError(error: unknown): error is AiBillingError {
  return (
    error instanceof AiBillingError ||
    (typeof error === 'object' && error !== null && (error as any).name === 'AiBillingError')
  );
}

/** Inspect a non-ok response and throw AiBillingError when it is a billing refusal. */
export async function throwIfBillingResponse(response: Response): Promise<void> {
  if (response.status !== 402 && response.status !== 429) return;
  const body = await response.json().catch(() => null) as
    | { code?: string; required?: number; message?: string }
    | null;
  if (response.status === 402) {
    throw new AiBillingError({
      code: 'insufficient_credits',
      status: 402,
      required: typeof body?.required === 'number' ? body.required : undefined,
      message: typeof body?.message === 'string' ? body.message : undefined,
    });
  }
  // 429: only billing/fair-use refusals carry code 'limit'; other rate limits
  // keep the previous behavior (callers treat them as generic failures).
  if (body?.code === 'limit' || body?.code === 'insufficient_credits') {
    throw new AiBillingError({
      code: 'limit',
      status: 429,
      message: typeof body?.message === 'string' ? body.message : undefined,
    });
  }
}

export function getApiBaseUrl() {
  return (process.env.EXPO_PUBLIC_API_URL || 'https://backend.edutu.org').replace(/\/$/, '');
}

export async function requestProductApi<T>(
  path: string,
  options: RequestInit = {},
  getAuthToken?: GetAuthToken,
  // Slow AI generations (a full co-pilot kit from the routed LLM) routinely
  // exceed the 12s default; callers pass a longer budget so the client doesn't
  // abort a request the server is about to complete (and charge for).
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  policy: ProductApiRequestPolicy = {},
): Promise<T | null> {
  const apiBaseUrl = getApiBaseUrl();
  getAuthToken = getAuthToken ?? sessionTokenGetter;

  if (!apiBaseUrl || !getAuthToken) {
    if (policy.throwOnError) throw new ProductApiRequestError('auth');
    return null;
  }

  try {
    // Clerk's getToken can stall indefinitely on a flaky connection (it may
    // refresh the session over the network) — cap it so callers never hang.
    if (options.signal?.aborted) throw new ProductApiRequestError('cancelled');
    const token = await getTokenWithTimeout(getAuthToken, policy.throwOnError ? Math.min(timeoutMs, 3500) : timeoutMs, policy.forceRefreshToken);
    if (!token) {
      if (policy.throwOnError) throw new ProductApiRequestError('auth');
      return null;
    }

    const hasBody = options.body !== undefined && options.body !== null;
    const multipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers = {
      Accept: 'application/json',
      ...(hasBody && !multipart ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };
    const method = (options.method ?? 'GET').toUpperCase();
    const url = `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    const execute = async (): Promise<T | null> => {
      const controller = new AbortController();
      const upstreamSignal = options.signal;
      const abortFromUpstream = () => controller.abort();
      if (upstreamSignal?.aborted) {
        controller.abort();
      } else {
        upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true });
      }
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        // Always use our controller so the timeout remains active even when a
        // caller supplies its own signal. The listener above composes both.
        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          if (__DEV__) console.warn('[product-api]', method, path.split('?')[0], response.status);
          // Billing refusals (402 insufficient credits / 429 limit) must surface
          // to the user rather than degrade into a silent local fallback.
          await throwIfBillingResponse(response);
          if (policy.throwOnError) throw new ProductApiRequestError('http', response.status);
          return null;
        }

        if (response.status === 204) {
          return {} as T;
        }

        try {
          return await response.json() as T;
        } catch {
          return {} as T;
        }
      } finally {
        clearTimeout(timeout);
        upstreamSignal?.removeEventListener('abort', abortFromUpstream);
      }
    };

    // Layout/header + destination screens frequently ask for the same data at
    // once. Share only plain GETs; requests with custom headers/signals retain
    // their independent cancellation and response semantics.
    const canCoalesce = !policy.throwOnError && method === 'GET' && !hasBody && !options.headers && !options.signal;
    if (!canCoalesce) return await execute();

    const requestKey = `${token}\n${url}\n${timeoutMs}`;
    const existing = productGetRequests.get(requestKey) as Promise<T | null> | undefined;
    if (existing) return await existing;

    const request = execute();
    productGetRequests.set(requestKey, request);
    try {
      return await request;
    } finally {
      if (productGetRequests.get(requestKey) === request) {
        productGetRequests.delete(requestKey);
      }
    }
  } catch (error) {
    if (isAiBillingError(error)) throw error;
    if (policy.throwOnError) {
      if (options.signal?.aborted) throw new ProductApiRequestError('cancelled');
      if (error instanceof ProductApiRequestError) throw error;
      throw new ProductApiRequestError('network');
    }
    return null;
  }
}
