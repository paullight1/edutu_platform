type HeaderBag = Record<string, string | string[] | undefined>;

export function extractDeveloperTokenFromHeaders(
  headers: HeaderBag,
): string | undefined {
  const tokenHeader =
    headers["x-developer-token"] ?? headers["x-dev-token"] ?? headers["developer-token"];

  const explicit = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
  if (explicit?.trim()) return explicit.trim();

  const authHeader = headers.authorization;
  const authorization = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!authorization) return undefined;

  const [scheme, token] = authorization.split(" ");
  if (!scheme || !token) return undefined;
  if (scheme.toLowerCase() !== "bearer") return undefined;

  return token.trim() || undefined;
}
