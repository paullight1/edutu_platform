// Centralised, lazily-read environment. We read at request time (not module
// load) so a missing var surfaces as a clear 500 on the affected route rather
// than crashing the whole build.

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

export const config = {
  baseUrl: () => optionalEnv('BASE_URL', 'http://localhost:3001').replace(/\/$/, ''),
  paystackSecret: () => getEnv('PAYSTACK_SECRET_KEY'),
  paystackPublic: () => optionalEnv('PAYSTACK_PUBLIC_KEY'),
  planWeekly: () => optionalEnv('PAYSTACK_PLAN_WEEKLY'),
  planMonthly: () => optionalEnv('PAYSTACK_PLAN_MONTHLY'),
  planYearly: () => optionalEnv('PAYSTACK_PLAN_YEARLY'),
  supabaseUrl: () => getEnv('SUPABASE_URL'),
  supabaseServiceRole: () => getEnv('SUPABASE_SERVICE_ROLE_KEY'),
  edutuApiUrl: () => optionalEnv('EDUTU_API_URL', 'https://edutu-platform.onrender.com').replace(/\/$/, ''),
  // These fire only when /mobile-control/config is unreachable, so they MUST
  // mirror edutumobile/lib/pricing.ts DEFAULT_PRICING exactly — a mismatch here
  // charged USD on the web while the app advertised NGN.
  fallbackCurrency: () => optionalEnv('FALLBACK_CURRENCY', 'NGN'),
  fallbackWeekly: () => Number(optionalEnv('FALLBACK_PRICE_WEEKLY', '2000')),
  fallbackMonthly: () => Number(optionalEnv('FALLBACK_PRICE_MONTHLY', '6500')),
  fallbackYearly: () => Number(optionalEnv('FALLBACK_PRICE_YEARLY', '60000')),
  appScheme: () => optionalEnv('APP_DEEP_LINK_SCHEME', 'edutu'),
  // Where to send a WEB buyer after checkout. The `edutu://` deep link only
  // works on a device with the app installed; a desktop buyer following it
  // lands on a dead button, so /return branches on the originating platform.
  webAppUrl: () => optionalEnv('WEB_APP_URL', 'https://www.edutu.org').replace(/\/$/, ''),
  adminToken: () => getEnv('ADMIN_DASHBOARD_TOKEN'),
  // Clerk verification for the self-service /account page. When both are set,
  // the manage/cancel flow proves the caller owns the account before acting.
  clerkJwksUrl: () => optionalEnv('CLERK_JWKS_URL'),
  clerkIssuer: () => optionalEnv('CLERK_ISSUER'),
  // Secret used to sign the short-lived account-session cookie.
  sessionSecret: () => optionalEnv('ACCOUNT_SESSION_SECRET'),
};
