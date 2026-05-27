import { getApiBaseUrl } from '../lib/apiBaseUrl';
import { getLocalDevAuthHeaders } from '../lib/localDevAuthHeaders';

export class ProductApiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductApiUnavailableError';
  }
}

export function isProductApiUnavailableError(error: unknown): boolean {
  return error instanceof ProductApiUnavailableError;
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

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...getLocalDevAuthHeaders(),
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw new ProductApiUnavailableError(error instanceof Error ? error.message : 'Product API is unreachable');
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
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
