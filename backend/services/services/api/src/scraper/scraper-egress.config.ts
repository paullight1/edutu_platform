export class ScraperEgressConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScraperEgressConfigError";
  }
}

export type ScraperEgressDisabledConfig = {
  enabled: false;
};

export type ScraperEgressEnabledConfig = {
  enabled: true;
  sharedSecret: string;
  allowedHosts: string[];
  timeoutMs: number;
  maxResponseBytes: number;
  maxRedirects: number;
  signatureMaxAgeSeconds: number;
  maxRequestBytes: number;
};

export type ScraperEgressConfig =
  | ScraperEgressDisabledConfig
  | ScraperEgressEnabledConfig;

type Environment = Record<string, string | undefined>;

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const DEFAULT_MAX_REDIRECTS = 3;
const MAX_REDIRECTS = 5;
const DEFAULT_SIGNATURE_MAX_AGE_SECONDS = 300;
const MAX_SIGNATURE_MAX_AGE_SECONDS = 900;
const DEFAULT_MAX_REQUEST_BYTES = 4_096;
const MAX_REQUEST_BYTES = 16_384;

function readBoundedInteger(
  environment: Environment,
  name: string,
  fallback: number,
  maximum: number,
): number {
  const raw = environment[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new ScraperEgressConfigError(
      `${name} must be a positive integer no greater than ${maximum}.`,
    );
  }
  return value;
}

function normalizeAllowedHosts(raw: string): string[] {
  const hosts = raw
    .split(",")
    .map((host) => host.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);

  if (hosts.length === 0) {
    throw new ScraperEgressConfigError(
      "SCRAPE_EGRESS_ALLOWED_HOSTS must contain at least one exact hostname.",
    );
  }

  for (const host of hosts) {
    if (
      host.includes("*") ||
      host.includes("/") ||
      host.includes("@") ||
      /[\s:?#]/.test(host)
    ) {
      throw new ScraperEgressConfigError(
        "SCRAPE_EGRESS_ALLOWED_HOSTS must contain exact hostnames only; wildcards are not allowed.",
      );
    }

    try {
      const parsed = new URL(`https://${host}/`);
      if (
        parsed.hostname !== host ||
        parsed.port ||
        parsed.username ||
        parsed.password
      ) {
        throw new Error("not an exact hostname");
      }
    } catch {
      throw new ScraperEgressConfigError(
        "SCRAPE_EGRESS_ALLOWED_HOSTS must contain exact hostnames only; wildcards are not allowed.",
      );
    }
  }

  return [...new Set(hosts)];
}

export function loadScraperEgressConfig(
  environment: Environment = process.env,
): ScraperEgressConfig {
  const enabled = environment.SCRAPE_EGRESS_ENABLED;
  if (enabled !== "true") {
    if (enabled !== undefined && enabled !== "false") {
      throw new ScraperEgressConfigError(
        "SCRAPE_EGRESS_ENABLED must be exactly true or false.",
      );
    }
    return { enabled: false };
  }

  const sharedSecret = environment.SCRAPE_EGRESS_SHARED_SECRET ?? "";
  if (Buffer.byteLength(sharedSecret, "utf8") < 32) {
    throw new ScraperEgressConfigError(
      "SCRAPE_EGRESS_SHARED_SECRET must be at least 32 bytes when egress is enabled.",
    );
  }

  const allowedHosts = normalizeAllowedHosts(
    environment.SCRAPE_EGRESS_ALLOWED_HOSTS ?? "",
  );

  return {
    enabled: true,
    sharedSecret,
    allowedHosts,
    timeoutMs: readBoundedInteger(
      environment,
      "SCRAPE_EGRESS_TIMEOUT_MS",
      DEFAULT_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    ),
    maxResponseBytes: readBoundedInteger(
      environment,
      "SCRAPE_EGRESS_MAX_RESPONSE_BYTES",
      DEFAULT_MAX_RESPONSE_BYTES,
      MAX_RESPONSE_BYTES,
    ),
    maxRedirects: readBoundedInteger(
      environment,
      "SCRAPE_EGRESS_MAX_REDIRECTS",
      DEFAULT_MAX_REDIRECTS,
      MAX_REDIRECTS,
    ),
    signatureMaxAgeSeconds: readBoundedInteger(
      environment,
      "SCRAPE_EGRESS_SIGNATURE_MAX_AGE_SECONDS",
      DEFAULT_SIGNATURE_MAX_AGE_SECONDS,
      MAX_SIGNATURE_MAX_AGE_SECONDS,
    ),
    maxRequestBytes: readBoundedInteger(
      environment,
      "SCRAPE_EGRESS_MAX_REQUEST_BYTES",
      DEFAULT_MAX_REQUEST_BYTES,
      MAX_REQUEST_BYTES,
    ),
  };
}
