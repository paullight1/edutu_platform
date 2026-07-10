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
  planMonthly: () => optionalEnv('PAYSTACK_PLAN_MONTHLY'),
  planYearly: () => optionalEnv('PAYSTACK_PLAN_YEARLY'),
  supabaseUrl: () => getEnv('SUPABASE_URL'),
  supabaseServiceRole: () => getEnv('SUPABASE_SERVICE_ROLE_KEY'),
  edutuApiUrl: () => optionalEnv('EDUTU_API_URL', 'https://edutu-platform.onrender.com').replace(/\/$/, ''),
  fallbackCurrency: () => optionalEnv('FALLBACK_CURRENCY', 'USD'),
  fallbackMonthly: () => Number(optionalEnv('FALLBACK_PRICE_MONTHLY', '9.99')),
  fallbackYearly: () => Number(optionalEnv('FALLBACK_PRICE_YEARLY', '71.88')),
  appScheme: () => optionalEnv('APP_DEEP_LINK_SCHEME', 'edutu'),
  adminToken: () => getEnv('ADMIN_DASHBOARD_TOKEN'),
  // Clerk verification for the self-service /account page. When both are set,
  // the manage/cancel flow proves the caller owns the account before acting.
  clerkJwksUrl: () => optionalEnv('CLERK_JWKS_URL'),
  clerkIssuer: () => optionalEnv('CLERK_ISSUER'),
  // Secret used to sign the short-lived account-session cookie.
  sessionSecret: () => optionalEnv('ACCOUNT_SESSION_SECRET'),
};
