// Server-only environment access for the payment shell. No credential, user
// identity, or payment detail is ever exposed through NEXT_PUBLIC variables.

export function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

function canonicalApiOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('EDUTU_BILLING_API_URL must be an absolute URL');
  }

  const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !localHttp) {
    throw new Error('EDUTU_BILLING_API_URL must use https outside local development');
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('EDUTU_BILLING_API_URL must be an origin without credentials, a path, query, or fragment');
  }
  return url.origin;
}

export const config = {
  billingApiUrl: () => canonicalApiOrigin(getEnv('EDUTU_BILLING_API_URL')),
  payShellOrigin: () => canonicalApiOrigin(getEnv('PAY_SHELL_ORIGIN')),
  bachsCheckoutEnabled: () => optionalEnv('BACHS_CHECKOUT_ENABLED').toLowerCase() === 'true',
  sessionCookieName: () => 'edutu_pay_billing_session',
};
