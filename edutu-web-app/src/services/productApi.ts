import { getApiBaseUrl } from '../lib/apiBaseUrl';
import { getLocalDevAuthHeaders } from '../lib/localDevAuthHeaders';
import { fetchWithTimeout, retry } from '../lib/retry';

export class ProductApiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductApiUnavailableError';
  }
}

export function isProductApiUnavailableError(error: unknown): boolean {
  return error instanceof ProductApiUnavailableError;
}

/**
 * Thrown when the backend rejects an AI call because the user is out of
 * credits (HTTP 402, code 'insufficient_credits') or over the free daily
 * allowance (HTTP 429, code 'limit'). Callers should catch this and open
 * the UpgradeModal instead of showing a generic error.
 */
export class UpgradeRequiredError extends Error {
  constructor(
    message: string,
    public code: 'insufficient_credits' | 'limit',
    public status: number,
    public required?: number,
  ) {
    super(message);
    this.name = 'UpgradeRequiredError';
  }
}

export function isUpgradeRequiredError(error: unknown): error is UpgradeRequiredError {
  return error instanceof UpgradeRequiredError;
}

const REQUEST_TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 3;

class NetworkAttemptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkAttemptError';
  }
}

class ApiStatusError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiStatusError';
  }
}

export async function productApiRequest<T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  let apiBaseUrl: string;

  try {
    apiBaseUrl = getApiBaseUrl('Product API');
  } catch (error) {
    throw new ProductApiUnavailableError(error instanceof Error ? error.message : 'Product API is not configured');
  }

  const attemptRequest = async (): Promise<T> => {
    let response: Response;
    try {
      response = await fetchWithTimeout(`${apiBaseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...getLocalDevAuthHeaders(),
          ...(options.headers || {})
        },
        timeout: REQUEST_TIMEOUT_MS,
      });
    } catch (error) {
      throw new NetworkAttemptError(error instanceof Error ? error.message : 'Product API is unreachable');
    }

    if ([404, 405, 501].includes(response.status)) {
      throw new ProductApiUnavailableError(`Product API route unavailable: ${path}`);
    }

    if (!response.ok) {
      let message = `Product API request failed with ${response.status}`;
      let body: { message?: string; error?: string; code?: string; required?: number } | null = null;
      try {
        body = await response.json();
        message = body?.message || body?.error || message;
      } catch {
        const text = await response.text();
        if (text) message = text;
      }

      const normalizedMessage = Array.isArray(message) ? message.join(', ') : message;

      if (
        (response.status === 402 && body?.code === 'insufficient_credits') ||
        (response.status === 429 && body?.code === 'limit')
      ) {
        throw new UpgradeRequiredError(
          normalizedMessage,
          body.code as 'insufficient_credits' | 'limit',
          response.status,
          typeof body.required === 'number' ? body.required : undefined,
        );
      }

      throw new ApiStatusError(normalizedMessage, response.status);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  };

  try {
    return await retry(attemptRequest, {
      maxAttempts: MAX_ATTEMPTS,
      baseDelay: 1000,
      maxDelay: 10000,
      shouldRetry: (error: unknown): boolean => {
        if (error instanceof NetworkAttemptError) return true;
        if (error instanceof ApiStatusError) return error.status >= 500 && error.status < 600;
        return false;
      },
    });
  } catch (error) {
    if (error instanceof NetworkAttemptError) {
      throw new ProductApiUnavailableError(error.message || 'Product API is unreachable');
    }
    if (error instanceof ApiStatusError) {
      throw new Error(error.message);
    }
    throw error;
  }
}
