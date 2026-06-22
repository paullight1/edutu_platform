export type ClerkTokenGetter = (options?: {
  skipCache?: boolean;
}) => Promise<string | null>;

export async function getProductApiToken(
  getToken: ClerkTokenGetter,
  options: { forceRefresh?: boolean } = {},
): Promise<string | null> {
  return getToken(options.forceRefresh ? { skipCache: true } : undefined).catch(
    () => null,
  );
}

export function isInvalidOrExpiredTokenError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /invalid or expired token|unauthorized|401/i.test(error.message);
}
