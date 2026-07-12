export type GetAuthToken = () => Promise<string | null | undefined>;

const DEFAULT_TIMEOUT_MS = 12000;

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

function getApiBaseUrl() {
  return (process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com').replace(/\/$/, '');
}

export async function requestProductApi<T>(
  path: string,
  options: RequestInit = {},
  getAuthToken?: GetAuthToken,
): Promise<T | null> {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl || !getAuthToken) {
    return null;
  }

  try {
    const token = await getAuthToken();
    if (!token) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const hasBody = options.body !== undefined && options.body !== null;
    const headers = {
      Accept: 'application/json',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };

    const response = await fetch(`${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      // Billing refusals (402 insufficient credits / 429 limit) must surface
      // to the user rather than degrade into a silent local fallback.
      await throwIfBillingResponse(response);
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
  } catch (error) {
    if (isAiBillingError(error)) throw error;
    return null;
  }
}
