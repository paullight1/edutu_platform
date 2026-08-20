const LOCAL_TEST_API_URL = 'http://127.0.0.1:9';

export function testApiBaseUrl(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized || LOCAL_TEST_API_URL;
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function assertLocalTestUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value, LOCAL_TEST_API_URL);
  } catch {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const hostname = url.hostname.toLowerCase();
  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]';

  if (!isLocal) {
    throw new Error(`Unexpected external network request in Jest: ${url.toString()}`);
  }
}

function installNetworkGuard(): void {
  process.env.EXPO_PUBLIC_API_URL = testApiBaseUrl(process.env.EXPO_PUBLIC_API_URL);

  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== 'function') return;

  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    assertLocalTestUrl(requestUrl(input));
    return originalFetch(input, init);
  }) as typeof fetch;
}

installNetworkGuard();
