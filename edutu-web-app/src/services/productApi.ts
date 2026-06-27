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
      try {
        const body = await response.json();
        message = body?.message || body?.error || message;
      } catch {
        const text = await response.text();
        if (text) message = text;
      }
      throw new ApiStatusError(Array.isArray(message) ? message.join(', ') : message, response.status);
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
