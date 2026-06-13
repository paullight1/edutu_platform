import { supabase } from './supabase';
import { getLocalAdminEmail, isLocalAdminBypassEnabled } from './localAdmin';

const DEFAULT_BACKEND_URL = 'https://edutu-api.onrender.com';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function headersToRecord(init?: HeadersInit): Record<string, string> {
  const headers = new Headers(init);
  const record: Record<string, string> = {};

  headers.forEach((value, key) => {
    record[key] = value;
  });

  return record;
}

export function getBackendBaseUrl(): string {
  return trimTrailingSlash(
    import.meta.env.VITE_BACKEND_URL ||
      import.meta.env.VITE_API_URL ||
      DEFAULT_BACKEND_URL,
  );
}

export async function getAdminAuthHeaders(
  extraHeaders?: HeadersInit,
): Promise<Record<string, string>> {
  if (isLocalAdminBypassEnabled()) {
    return {
      'X-Edutu-Admin-Email': getLocalAdminEmail(),
      ...headersToRecord(extraHeaders),
    };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Admin session is required');
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    'X-Edutu-Admin-Email': session.user?.email || '',
    ...headersToRecord(extraHeaders),
  };
}

export async function backendFetchJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${getBackendBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...(await getAdminAuthHeaders(init.headers)),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Backend request failed');
  }

  return data as T;
}
