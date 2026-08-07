import { getApiBaseUrl } from "../../lib/apiBaseUrl";

export class VoiceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceConfigurationError";
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function validateBaseUrl(
  value: string,
  kind: "api",
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new VoiceConfigurationError(`The voice ${kind} origin is invalid.`);
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new VoiceConfigurationError(
      `The voice ${kind} origin must not contain credentials, a query, or a fragment.`,
    );
  }

  if (url.pathname !== "/" && url.pathname !== "") {
    throw new VoiceConfigurationError(
      `The voice ${kind} setting must be an origin without a path.`,
    );
  }

  const allowedProtocols = new Set(["https:"]);
  if (import.meta.env.DEV && isLoopback(url.hostname)) {
    allowedProtocols.add("http:");
  }

  if (!allowedProtocols.has(url.protocol)) {
    throw new VoiceConfigurationError(
      "The voice API origin must use HTTPS.",
    );
  }

  return url;
}

export function getVoiceApiOrigin(): string {
  return validateBaseUrl(getApiBaseUrl("Community voice calls"), "api").origin;
}

function parseAllowedSignalingOrigins(): Set<string> {
  const configured = import.meta.env.VITE_VOICE_ALLOWED_WSS_ORIGINS?.trim();
  if (!configured) return new Set();

  const origins = new Set<string>();
  for (const entry of configured.split(",")) {
    const value = entry.trim();
    if (!value) continue;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new VoiceConfigurationError(
        "VITE_VOICE_ALLOWED_WSS_ORIGINS contains an invalid URL.",
      );
    }
    if (
      parsed.protocol !== "wss:" ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new VoiceConfigurationError(
        "Allowed voice signaling origins must be WSS origins without paths or credentials.",
      );
    }
    origins.add(parsed.origin);
  }
  return origins;
}

export function resolveVoiceSignalingUrl(apiSignalingUrl: string | null): string {
  const devFallback = import.meta.env.DEV
    ? import.meta.env.VITE_VOICE_WSS_URL?.trim() || null
    : null;
  const candidate = apiSignalingUrl ?? devFallback;

  if (!candidate) {
    throw new VoiceConfigurationError(
      "The call server did not provide a signaling URL.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new VoiceConfigurationError("The call server returned an invalid signaling URL.");
  }

  const isLocalDevelopment =
    import.meta.env.DEV && isLoopback(parsed.hostname) && parsed.protocol === "ws:";
  if (parsed.protocol !== "wss:" && !isLocalDevelopment) {
    throw new VoiceConfigurationError("Voice signaling must use WSS.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new VoiceConfigurationError(
      "Voice signaling URLs must not contain credentials, a query, or a fragment.",
    );
  }

  if (!isLocalDevelopment) {
    const allowedOrigins = parseAllowedSignalingOrigins();
    if (!allowedOrigins.has(parsed.origin)) {
      throw new VoiceConfigurationError(
        "The assigned voice server is not in this deployment's signaling allowlist.",
      );
    }
  }

  return parsed.toString();
}
