export type ClerkTokenGetter = (options?: {
  skipCache?: boolean;
}) => Promise<string | null>;

let clerkTokenGetter:
  | (() => Promise<string | null | undefined>)
  | null = null;

/** Keep the Supabase token bridge available without loading the client library. */
export function setClerkTokenGetter(
  getToken: () => Promise<string | null | undefined>,
) {
  clerkTokenGetter = getToken;
}

export async function getClerkAccessToken(): Promise<string | null> {
  if (!clerkTokenGetter) return null;
  try {
    return (await clerkTokenGetter()) ?? null;
  } catch {
    return null;
  }
}

export async function getClerkSessionToken(
  getToken: ClerkTokenGetter,
  options: { forceRefresh?: boolean } = {},
): Promise<string | null> {
  const tokenPromise = options.forceRefresh
    ? getToken({ skipCache: true })
    : getToken();
  return tokenPromise.catch(() => null);
}

export async function getProductApiToken(
  getToken: ClerkTokenGetter,
  options: { forceRefresh?: boolean } = {},
): Promise<string | null> {
  return getClerkSessionToken(getToken, options);
}

export function isInvalidOrExpiredTokenError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /invalid or expired token|unauthorized|401/i.test(error.message);
}
