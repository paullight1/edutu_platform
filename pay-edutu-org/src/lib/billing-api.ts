import { config } from './env';

export async function billingApiRequest(path: string, session: string, init?: RequestInit): Promise<Response> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Billing API path must be absolute to the canonical API origin');
  }

  return fetch(`${config.billingApiUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${session}`,
      ...(init?.headers ?? {}),
    },
  });
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
