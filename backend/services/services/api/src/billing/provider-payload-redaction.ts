const SENSITIVE_KEY =
  /email|authorization|cookie|password|secret|token|url|raw|signature|card|cvv|phone/i;

/** Keeps operational identifiers while excluding provider/customer secrets. */
export function redactProviderPayload(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (Array.isArray(value)) {
    return value
      .slice(0, 32)
      .map((item) => redactProviderPayload(item, depth + 1));
  }
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? value.slice(0, 500) : value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) continue;
    result[key] = redactProviderPayload(item, depth + 1);
  }
  return result;
}

export function safeProviderError(value: unknown): string {
  return JSON.stringify(redactProviderPayload(value)).slice(0, 1000);
}
