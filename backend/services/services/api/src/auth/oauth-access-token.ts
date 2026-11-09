export function isOAuthAccessTokenType(type: unknown): boolean {
  return type === "at+jwt" || type === "application/at+jwt";
}
