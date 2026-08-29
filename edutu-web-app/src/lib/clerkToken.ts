export type ClerkTokenGetter = (options?: {
  skipCache?: boolean;
}) => Promise<string | null>;

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
