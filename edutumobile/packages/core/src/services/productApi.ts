export type GetAuthToken = () => Promise<string | null | undefined>;

const DEFAULT_TIMEOUT_MS = 12000;

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
  } catch {
    return null;
  }
}
