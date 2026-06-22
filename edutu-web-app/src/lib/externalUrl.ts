const HTTP_URL_RE = /^https?:\/\//i;
const PROTOCOL_RELATIVE_URL_RE = /^\/\//;
const WWW_URL_RE = /^www\./i;
const DOMAIN_URL_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:[/:?#].*)?$/i;

function cleanCandidateUrl(value: string): string {
  return value
    .trim()
    .replace(/^[<("'`]+/u, "")
    .replace(/[>.,;:!?)"'`]+$/u, "");
}

function firstLikelyUrl(value: string): string {
  const direct = cleanCandidateUrl(value.replace(/\s+/g, " "));
  if (
    HTTP_URL_RE.test(direct) ||
    PROTOCOL_RELATIVE_URL_RE.test(direct) ||
    WWW_URL_RE.test(direct) ||
    DOMAIN_URL_RE.test(direct)
  ) {
    return direct;
  }

  const embedded = value.match(
    /(?:https?:\/\/|\/\/|www\.)[^\s<>"'`]+|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:\/[^\s<>"'`]*)?/i,
  );

  return embedded ? cleanCandidateUrl(embedded[0]) : direct;
}

export function normalizeExternalUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const candidate = firstLikelyUrl(value);
  if (!candidate) {
    return undefined;
  }

  const withProtocol = PROTOCOL_RELATIVE_URL_RE.test(candidate)
    ? `https:${candidate}`
    : HTTP_URL_RE.test(candidate)
      ? candidate
      : WWW_URL_RE.test(candidate) || DOMAIN_URL_RE.test(candidate)
        ? `https://${candidate}`
        : candidate;

  try {
    const url = new URL(withProtocol);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
