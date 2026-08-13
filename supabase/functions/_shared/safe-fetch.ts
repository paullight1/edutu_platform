const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const MAX_CONFIGURED_BYTES = 2_000_000;
const DEFAULT_MAX_REDIRECTS = 3;
const MAX_CONFIGURED_REDIRECTS = 5;
const DEFAULT_EGRESS_PRINCIPAL = "edge-job";
const GENERIC_EGRESS_ERROR = "Request could not be processed";

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

export type SafeFetchResult = {
  text: string;
  finalUrl: string;
};

type ResolveHost = (
  hostname: string,
  signal?: AbortSignal,
) => Promise<string[]>;

export type SafeFetchOptions = {
  allowedHosts: readonly string[];
  fetchImpl?: typeof fetch;
  resolveHost?: ResolveHost;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

function boundedInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
  name: string,
): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected <= 0 || selected > maximum) {
    throw new SafeFetchError(`Invalid ${name}`);
  }
  return selected;
}

function normalizeHostname(hostname: string): string {
  const withoutBrackets = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  return withoutBrackets.toLowerCase().replace(/\.$/, "");
}

function normalizeAllowedHost(value: string): string {
  const candidate = value.trim();
  if (
    !candidate ||
    candidate.includes("*") ||
    candidate.includes("/") ||
    candidate.includes("@") ||
    /\s/.test(candidate)
  ) {
    throw new SafeFetchError("Invalid allowed host configuration");
  }

  try {
    const hostForUrl = candidate.includes(":") ? `[${candidate}]` : candidate;
    const parsed = new URL(`https://${hostForUrl}/`);
    const normalized = normalizeHostname(parsed.hostname);
    if (!normalized || parsed.port || parsed.username || parsed.password) {
      throw new Error("invalid host");
    }
    return normalized;
  } catch {
    throw new SafeFetchError("Invalid allowed host configuration");
  }
}

function parseIpv4(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return -1;
    const parsed = Number(part);
    return parsed >= 0 && parsed <= 255 ? parsed : -1;
  });
  if (octets.some((octet) => octet < 0)) return null;
  return (
    ((octets[0] << 24) >>> 0) +
    (octets[1] << 16) +
    (octets[2] << 8) +
    octets[3]
  ) >>> 0;
}

function ipv4InRange(address: number, base: number, prefix: number): boolean {
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (base & mask);
}

function isNonPublicIpv4(address: number): boolean {
  const ranges: Array<[number, number]> = [
    [0x00000000, 8],
    [0x0a000000, 8],
    [0x64400000, 10],
    [0x7f000000, 8],
    [0xa9fe0000, 16],
    [0xac100000, 12],
    [0xc0000000, 24],
    [0xc0000200, 24],
    [0xc0586300, 24],
    [0xc0a80000, 16],
    [0xc6120000, 15],
    [0xc6336400, 24],
    [0xcb007100, 24],
    [0xe0000000, 4],
  ];
  return ranges.some(([base, prefix]) => ipv4InRange(address, base, prefix));
}

function parseIpv6(address: string): bigint | null {
  if (!address.includes(":") || address.includes("%")) return null;

  let normalized = address.toLowerCase();
  const ipv4Tail = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Tail) {
    const ipv4 = parseIpv4(ipv4Tail);
    if (ipv4 === null) return null;
    const replacement = `${((ipv4 >>> 16) & 0xffff).toString(16)}:${
      (ipv4 & 0xffff).toString(16)
    }`;
    normalized = normalized.slice(0, -ipv4Tail.length) + replacement;
  }

  if ((normalized.match(/::/g) ?? []).length > 1) return null;
  const [leftText, rightText] = normalized.split("::");
  const left = leftText ? leftText.split(":") : [];
  const right = rightText ? rightText.split(":") : [];
  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    return null;
  }

  const hasCompression = normalized.includes("::");
  const missing = 8 - left.length - right.length;
  if ((!hasCompression && missing !== 0) || (hasCompression && missing < 1)) {
    return null;
  }
  const groups = hasCompression
    ? [...left, ...Array(missing).fill("0"), ...right]
    : left;
  if (groups.length !== 8) return null;

  return groups.reduce(
    (value, group) => (value << 16n) | BigInt(`0x${group}`),
    0n,
  );
}

function ipv6InRange(address: bigint, base: bigint, prefix: number): boolean {
  if (prefix === 0) return true;
  const shift = 128n - BigInt(prefix);
  return (address >> shift) === (base >> shift);
}

function isNonPublicIpv6(address: bigint): boolean {
  const mappedIpv4Base = 0xffffn << 32n;
  if (ipv6InRange(address, mappedIpv4Base, 96)) {
    return isNonPublicIpv4(Number(address & 0xffffffffn));
  }

  const ranges: Array<[bigint, number]> = [
    [0n, 128],
    [1n, 128],
    [0x0064ff9b000100000000000000000000n, 48],
    [0x01000000000000000000000000000000n, 64],
    [0x20010000000000000000000000000000n, 23],
    [0x20010db8000000000000000000000000n, 32],
    [0x20020000000000000000000000000000n, 16],
    [0xfc000000000000000000000000000000n, 7],
    [0xfe800000000000000000000000000000n, 10],
    [0xff000000000000000000000000000000n, 8],
  ];
  return ranges.some(([base, prefix]) => ipv6InRange(address, base, prefix));
}

function assertPublicAddress(address: string): void {
  const normalized = normalizeHostname(address);
  const ipv4 = parseIpv4(normalized);
  if (ipv4 !== null) {
    if (isNonPublicIpv4(ipv4)) {
      throw new SafeFetchError("Non-public address rejected");
    }
    return;
  }

  const ipv6 = parseIpv6(normalized);
  if (ipv6 !== null) {
    if (isNonPublicIpv6(ipv6)) {
      throw new SafeFetchError("Non-public address rejected");
    }
    return;
  }

  throw new SafeFetchError("DNS returned an invalid address");
}

async function defaultResolveHost(
  hostname: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const queries = await Promise.allSettled([
    Deno.resolveDns(hostname, "A", { signal }),
    Deno.resolveDns(hostname, "AAAA", { signal }),
  ]);
  const addresses = queries.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );
  if (addresses.length === 0) throw new SafeFetchError("Host did not resolve");
  return addresses;
}

function parseAndAuthorizeUrl(rawUrl: string, allowedHosts: Set<string>): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SafeFetchError("Invalid URL");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    throw new SafeFetchError("URL rejected");
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!allowedHosts.has(hostname)) throw new SafeFetchError("Host rejected");

  parsed.hostname = hostname.includes(":") ? `[${hostname}]` : hostname;
  parsed.hash = "";
  return parsed;
}

async function assertPublicResolution(
  hostname: string,
  resolveHost: ResolveHost,
  signal: AbortSignal,
): Promise<void> {
  const ipv4 = parseIpv4(hostname);
  const ipv6 = parseIpv6(hostname);
  if (ipv4 !== null || ipv6 !== null) {
    assertPublicAddress(hostname);
    return;
  }

  const addresses = await resolveHost(hostname, signal);
  if (addresses.length === 0) throw new SafeFetchError("Host did not resolve");
  for (const address of addresses) assertPublicAddress(address);
}

async function readBoundedHtml(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentType = response.headers.get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
    await response.body?.cancel();
    throw new SafeFetchError("Non-HTML response rejected");
  }

  const advertisedLength = response.headers.get("content-length");
  if (advertisedLength) {
    const parsedLength = Number(advertisedLength);
    if (
      !Number.isSafeInteger(parsedLength) || parsedLength < 0 ||
      parsedLength > maxBytes
    ) {
      await response.body?.cancel();
      throw new SafeFetchError("Response too large");
    }
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let bytesRead = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        throw new SafeFetchError("Response too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 ||
    status === 307 || status === 308;
}

export function createSafeFetchApprovedPage(
  options: SafeFetchOptions,
): (url: string) => Promise<SafeFetchResult> {
  const allowedHosts = new Set(options.allowedHosts.map(normalizeAllowedHost));
  if (allowedHosts.size === 0) {
    throw new SafeFetchError("No allowed hosts configured");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const timeoutMs = boundedInteger(
    options.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
    "fetch timeout",
  );
  const maxBytes = boundedInteger(
    options.maxBytes,
    DEFAULT_MAX_BYTES,
    MAX_CONFIGURED_BYTES,
    "response size limit",
  );
  const maxRedirects = boundedInteger(
    options.maxRedirects,
    DEFAULT_MAX_REDIRECTS,
    MAX_CONFIGURED_REDIRECTS,
    "redirect limit",
  );

  return async (rawUrl: string): Promise<SafeFetchResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () =>
        controller.abort(new DOMException("Fetch timed out", "TimeoutError")),
      timeoutMs,
    );

    try {
      let currentUrl = parseAndAuthorizeUrl(rawUrl, allowedHosts);

      for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
        await assertPublicResolution(
          normalizeHostname(currentUrl.hostname),
          resolveHost,
          controller.signal,
        );

        const response = await fetchImpl(currentUrl, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            accept: "text/html,application/xhtml+xml;q=0.9",
            "user-agent": "EdutuApprovedFetcher/1.0",
          },
        });

        if (isRedirect(response.status)) {
          const location = response.headers.get("location");
          await response.body?.cancel();
          if (!location || redirects === maxRedirects) {
            throw new SafeFetchError("Redirect rejected");
          }
          currentUrl = parseAndAuthorizeUrl(
            new URL(location, currentUrl).toString(),
            allowedHosts,
          );
          continue;
        }

        if (!response.ok) {
          await response.body?.cancel();
          throw new SafeFetchError("Upstream response rejected");
        }

        return {
          text: await readBoundedHtml(response, maxBytes),
          finalUrl: currentUrl.toString(),
        };
      }

      throw new SafeFetchError("Redirect rejected");
    } finally {
      clearTimeout(timeout);
    }
  };
}

function envInteger(name: string): number | undefined {
  const value = Deno.env.get(name)?.trim();
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new SafeFetchError(`Invalid ${name}`);
  }
  return parsed;
}

function isValidEgressPrincipal(principal: string): boolean {
  return (
    principal.length > 0 &&
    new TextEncoder().encode(principal).byteLength <= 256 &&
    !/[\u0000-\u001f\u007f-\u009f]/.test(principal)
  );
}

async function signEgressRequest(
  secret: string,
  timestamp: string,
  principal: string,
  rawBody: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}.${principal}.${rawBody}`),
    ),
  );
  const signature = Array.from(signatureBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `v1=${signature}`;
}

export async function safeFetchApprovedPage(
  url: string,
): Promise<SafeFetchResult> {
  const allowedHosts = (Deno.env.get("SCRAPE_ALLOWED_HOSTS") ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  const egressUrl = Deno.env.get("SCRAPE_EGRESS_URL")?.trim();
  const sharedSecret = Deno.env.get("SCRAPE_EGRESS_SHARED_SECRET");
  if (!egressUrl || !sharedSecret) {
    throw new SafeFetchError("Egress configuration missing");
  }

  const principal = Deno.env.get("SCRAPE_EGRESS_PRINCIPAL") ??
    DEFAULT_EGRESS_PRINCIPAL;
  if (!isValidEgressPrincipal(principal)) {
    throw new SafeFetchError("Invalid SCRAPE_EGRESS_PRINCIPAL");
  }

  let endpoint: URL;
  try {
    endpoint = new URL(egressUrl);
  } catch {
    throw new SafeFetchError("Invalid SCRAPE_EGRESS_URL");
  }
  if (endpoint.protocol !== "https:") {
    throw new SafeFetchError("Invalid SCRAPE_EGRESS_URL");
  }

  const allowedHostSet = new Set(allowedHosts.map(normalizeAllowedHost));
  if (allowedHostSet.size === 0) {
    throw new SafeFetchError("No allowed hosts configured");
  }
  const approvedUrl = parseAndAuthorizeUrl(url, allowedHostSet);
  const rawBody = JSON.stringify({ url: approvedUrl.toString() });
  const timeoutMs = boundedInteger(
    envInteger("SCRAPE_FETCH_TIMEOUT_MS"),
    DEFAULT_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
    "fetch timeout",
  );
  const timestamp = Math.floor(Date.now() / 1000).toString().padStart(10, "0");
  const signature = await signEgressRequest(
    sharedSecret,
    timestamp,
    principal,
    rawBody,
  );
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Fetch timed out", "TimeoutError")),
    timeoutMs,
  );

  try {
    const response = await fetch(egressUrl, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-edutu-egress-timestamp": timestamp,
        "x-edutu-egress-signature": signature,
        "x-edutu-egress-principal": principal,
      },
      body: rawBody,
    });

    if (!response.ok) {
      await response.body?.cancel();
      throw new SafeFetchError(GENERIC_EGRESS_ERROR);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new SafeFetchError(GENERIC_EGRESS_ERROR);
    }
    if (
      !payload ||
      Array.isArray(payload) ||
      typeof payload !== "object" ||
      Object.keys(payload).length !== 2 ||
      Object.keys(payload).some((key) =>
        key !== "text" && key !== "finalUrl"
      ) ||
      typeof (payload as { text?: unknown }).text !== "string" ||
      typeof (payload as { finalUrl?: unknown }).finalUrl !== "string" ||
      (payload as { finalUrl: string }).finalUrl.length === 0
    ) {
      throw new SafeFetchError(GENERIC_EGRESS_ERROR);
    }

    return {
      text: (payload as { text: string }).text,
      finalUrl: (payload as { finalUrl: string }).finalUrl,
    };
  } catch (error) {
    if (error instanceof SafeFetchError) throw error;
    throw new SafeFetchError(GENERIC_EGRESS_ERROR);
  } finally {
    clearTimeout(timeout);
  }
}
