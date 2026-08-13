import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as https from "node:https";
import type { IncomingMessage } from "node:http";
import { Injectable } from "@nestjs/common";
import type {
  ScraperEgressConfig,
  ScraperEgressEnabledConfig,
} from "./scraper-egress.config";
import { ScraperEgressLimiter } from "./scraper-egress.limiter";

export class ScraperEgressRequestError extends Error {
  constructor(public readonly status: number = 502) {
    super("Request could not be processed");
    this.name = "ScraperEgressRequestError";
  }
}

export type ResolvedEgressAddress = {
  address: string;
  family: 4 | 6;
};

export type ScraperEgressTransportRequest = {
  url: URL;
  address: ResolvedEgressAddress;
  signal: AbortSignal;
};

export type ScraperEgressTransportResponse = {
  status: number;
  contentType?: string;
  body: string;
  location?: string;
};

export type ScraperEgressDependencies = {
  now?: () => number;
  limiter?: ScraperEgressLimiter;
  resolveHost?: (
    hostname: string,
    signal?: AbortSignal,
  ) => Promise<ResolvedEgressAddress[]>;
  transport?: (
    request: ScraperEgressTransportRequest,
  ) => Promise<ScraperEgressTransportResponse>;
};

const IPV4_RANGES: Array<[number, number]> = [
  [0x00000000, 8], // this network
  [0x0a000000, 8], // RFC1918
  [0x64400000, 10], // RFC6598 shared address space
  [0x7f000000, 8], // loopback
  [0xa9fe0000, 16], // link-local / cloud metadata
  [0xac100000, 12], // RFC1918
  [0xc0000000, 24], // IETF protocol assignments
  [0xc0000200, 24], // TEST-NET-1
  [0xc01fc400, 24], // AS112-v4
  [0xc034c100, 24], // AMT
  [0xc0586300, 24], // 6to4 relay anycast
  [0xc0a80000, 16], // RFC1918
  [0xc0af3000, 24], // Direct Delegation AS112 service
  [0xc6120000, 15], // benchmarking
  [0xc6336400, 24], // TEST-NET-2
  [0xcb007100, 24], // TEST-NET-3
  [0xe0000000, 4], // multicast
  [0xf0000000, 4], // reserved / future use
];

const IPV6_RANGES: Array<[bigint, number]> = [
  [0n, 128], // unspecified
  [1n, 128], // loopback
  [0xffff00000000000000000000n, 96], // IPv4-mapped
  [0x0064ff9b000000000000000000000000n, 96], // NAT64 well-known prefix
  [0x0064ff9b000100000000000000000000n, 48], // NAT64 local-use prefix
  [0x01000000000000000000000000000000n, 64], // discard-only
  [0x01000000000000010000000000000000n, 64], // dummy prefix
  [0x20010000000000000000000000000000n, 23], // IETF assignments
  [0x20010000000000000000000000000000n, 32], // Teredo
  [0x20010001000000000000000000000001n, 128], // PCP anycast
  [0x20010001000000000000000000000002n, 128], // NAT traversal anycast
  [0x20010001000000000000000000000003n, 128], // DNS-SD anycast
  [0x20010002000000000000000000000000n, 48], // benchmarking
  [0x20010003000000000000000000000000n, 32], // AMT
  [0x20010004011200000000000000000000n, 48], // AS112-v6
  [0x20010010000000000000000000000000n, 28], // deprecated ORCHID
  [0x20010020000000000000000000000000n, 28], // ORCHIDv2
  [0x20010030000000000000000000000000n, 28], // Drone Remote ID
  [0x20010db8000000000000000000000000n, 32], // documentation
  [0x20020000000000000000000000000000n, 16], // 6to4
  [0x2620004f800000000000000000000000n, 48], // Direct Delegation AS112
  [0x3fff0000000000000000000000000000n, 20], // documentation
  [0x5f000000000000000000000000000000n, 16], // SRv6 SIDs
  [0xfc000000000000000000000000000000n, 7], // ULA
  [0xfe800000000000000000000000000000n, 10], // link-local
  [0xfec00000000000000000000000000000n, 10], // site-local
  [0xff000000000000000000000000000000n, 8], // multicast
];

function ipv4InRange(address: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (base & mask);
}

function parseIpv4(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return -1;
    const value = Number(part);
    return value >= 0 && value <= 255 ? value : -1;
  });
  if (octets.some((value) => value < 0)) return null;
  return (
    (((octets[0] << 24) >>> 0) +
      (octets[1] << 16) +
      (octets[2] << 8) +
      octets[3]) >>>
    0
  );
}

function parseIpv6(
  address: string,
): { value: bigint; embeddedIpv4: boolean } | null {
  if (!address.includes(":") || address.includes("%")) return null;

  let normalized = address.toLowerCase();
  const embeddedIpv4 = /(?:^|:)\d+\.\d+\.\d+\.\d+$/.test(normalized);
  const ipv4Tail = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Tail) {
    const ipv4 = parseIpv4(ipv4Tail);
    if (ipv4 === null) return null;
    const replacement = `${((ipv4 >>> 16) & 0xffff).toString(16)}:${(
      ipv4 & 0xffff
    ).toString(16)}`;
    normalized = normalized.slice(0, -ipv4Tail.length) + replacement;
  }

  if ((normalized.match(/::/g) ?? []).length > 1) return null;
  const [leftText, rightText] = normalized.split("::");
  const left = leftText ? leftText.split(":") : [];
  const right = rightText ? rightText.split(":") : [];
  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    return null;
  }

  const compressed = normalized.includes("::");
  const missing = 8 - left.length - right.length;
  if ((!compressed && missing !== 0) || (compressed && missing < 1)) {
    return null;
  }
  const groups = compressed
    ? [...left, ...Array(missing).fill("0"), ...right]
    : left;
  if (groups.length !== 8) return null;

  return {
    value: groups.reduce(
      (value, group) => (value << 16n) | BigInt(`0x${group}`),
      0n,
    ),
    embeddedIpv4,
  };
}

function ipv6InRange(address: bigint, base: bigint, prefix: number): boolean {
  if (prefix === 0) return true;
  return address >> BigInt(128 - prefix) === base >> BigInt(128 - prefix);
}

function isNonGlobalIpv4(address: number): boolean {
  return IPV4_RANGES.some(([base, prefix]) =>
    ipv4InRange(address, base, prefix),
  );
}

function isNonGlobalIpv6(address: bigint): boolean {
  // IPv4-embedded IPv6 forms are rejected even when the embedded address is
  // globally routable. They are a common way to hide an IPv4 target from a
  // superficial IPv6-only policy.
  if (ipv6InRange(address, 0xffffn << 32n, 96)) return true;
  if (address >> 125n !== 1n) return true; // global unicast is 2000::/3
  return IPV6_RANGES.some(([base, prefix]) =>
    ipv6InRange(address, base, prefix),
  );
}

export function isGlobalUnicastAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const parsed = parseIpv4(address);
    return parsed !== null && !isNonGlobalIpv4(parsed);
  }
  if (family === 6) {
    const parsed = parseIpv6(address);
    return (
      parsed !== null && !parsed.embeddedIpv4 && !isNonGlobalIpv6(parsed.value)
    );
  }
  return false;
}

function normalizedHostname(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .replace(/\.$/, "");
}

function authorityHasExplicitPort(rawUrl: string): boolean {
  const authorityStart = rawUrl.indexOf("://");
  if (authorityStart < 0) return false;
  const relativeAuthorityEnd = rawUrl.slice(authorityStart + 3).search(/[/?#]/);
  const authorityEnd =
    relativeAuthorityEnd < 0 ? -1 : authorityStart + 3 + relativeAuthorityEnd;
  const authority = rawUrl.slice(
    authorityStart + 3,
    authorityEnd < 0 ? rawUrl.length : authorityEnd,
  );
  if (authority.includes("@")) return true;
  if (authority.startsWith("[")) {
    const closingBracket = authority.indexOf("]");
    return closingBracket < 0 || authority.slice(closingBracket + 1).length > 0;
  }
  return authority.includes(":");
}

export function parseApprovedEgressUrl(
  rawUrl: string,
  allowedHosts: Set<string>,
): URL {
  let parsed: URL;
  try {
    if (typeof rawUrl !== "string" || authorityHasExplicitPort(rawUrl)) {
      throw new Error("authority rejected");
    }
    parsed = new URL(rawUrl);
  } catch {
    throw new ScraperEgressRequestError(502);
  }

  const hostname = normalizedHostname(parsed.hostname);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !allowedHosts.has(hostname)
  ) {
    throw new ScraperEgressRequestError(502);
  }

  parsed.hostname = hostname.includes(":") ? `[${hostname}]` : hostname;
  parsed.hash = "";
  return parsed;
}

function abortError(): Error {
  return new Error("Egress request timed out");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw signal.reason instanceof Error ? signal.reason : abortError();
}

async function awaitWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(signal.reason instanceof Error ? signal.reason : abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function defaultResolveHost(
  hostname: string,
  signal?: AbortSignal,
): Promise<ResolvedEgressAddress[]> {
  const result = await awaitWithAbort(
    lookup(hostname, { all: true, verbatim: true }),
    signal ?? new AbortController().signal,
  );
  return result.map((entry) => ({
    address: entry.address,
    family: entry.family as 4 | 6,
  }));
}

export function buildPinnedHttpsRequestOptions(
  url: URL,
  address: ResolvedEgressAddress,
  signal?: AbortSignal,
): https.RequestOptions {
  const hostname = normalizedHostname(url.hostname);
  return {
    protocol: "https:",
    hostname,
    servername: hostname,
    port: 443,
    path: `${url.pathname || "/"}${url.search}`,
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml;q=0.9",
      "user-agent": "EdutuApprovedFetcher/1.0",
    },
    agent: false,
    rejectUnauthorized: true,
    ...(signal ? { signal } : {}),
    lookup: (_hostname, _options, callback) => {
      callback(null, address.address, address.family);
    },
  };
}

function responseContentType(response: IncomingMessage): string | undefined {
  const value = response.headers["content-type"];
  return Array.isArray(value) ? value[0] : value;
}

async function defaultTransport(
  request: ScraperEgressTransportRequest,
  maxResponseBytes: number,
): Promise<ScraperEgressTransportResponse> {
  return new Promise((resolve, reject) => {
    let bytesRead = 0;
    const chunks: Buffer[] = [];
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(
        error instanceof Error ? error : new Error("HTTPS request failed"),
      );
    };

    const clientRequest = https.request(
      buildPinnedHttpsRequestOptions(
        request.url,
        request.address,
        request.signal,
      ),
      (response) => {
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytesRead += buffer.byteLength;
          if (bytesRead > maxResponseBytes) {
            response.destroy();
            fail(new Error("Response too large"));
            return;
          }
          chunks.push(buffer);
        });
        response.once("aborted", () => fail(new Error("Response aborted")));
        response.once("error", fail);
        response.once("end", () => {
          if (settled) return;
          settled = true;
          const status = response.statusCode ?? 0;
          const location = response.headers.location;
          resolve({
            status,
            contentType: responseContentType(response),
            body: Buffer.concat(chunks).toString("utf8"),
            ...(typeof location === "string" ? { location } : {}),
          });
        });
      },
    );
    clientRequest.once("error", fail);
    clientRequest.end();
  });
}

function isRedirect(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

function isHtmlContentType(contentType: string | undefined): boolean {
  const mediaType = contentType?.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "text/html" || mediaType === "application/xhtml+xml";
}

function validResolvedAddress(
  address: ResolvedEgressAddress,
): address is ResolvedEgressAddress {
  return (
    (address.family === 4 || address.family === 6) &&
    isIP(address.address) === address.family &&
    isGlobalUnicastAddress(address.address)
  );
}

function isValidPrincipal(principal: string): boolean {
  return (
    principal.length > 0 &&
    Buffer.byteLength(principal, "utf8") <= 256 &&
    !/[\u0000-\u001f\u007f-\u009f]/.test(principal)
  );
}

@Injectable()
export class ScraperEgressService {
  private readonly config: ScraperEgressConfig;
  private readonly now: () => number;
  private readonly limiter: ScraperEgressLimiter;
  private readonly resolveHost: NonNullable<
    ScraperEgressDependencies["resolveHost"]
  >;
  private readonly transport: NonNullable<
    ScraperEgressDependencies["transport"]
  >;

  constructor(
    config: ScraperEgressConfig,
    dependencies: ScraperEgressDependencies = {},
  ) {
    this.config = config;
    this.now = dependencies.now ?? Date.now;
    this.limiter =
      dependencies.limiter ??
      new ScraperEgressLimiter({
        limit: config.enabled ? config.rateLimitPerMinute : 1,
        now: this.now,
      });
    this.resolveHost = dependencies.resolveHost ?? defaultResolveHost;
    this.transport =
      dependencies.transport ??
      ((request) => {
        const maxBytes = this.config.enabled ? this.config.maxResponseBytes : 0;
        return defaultTransport(request, maxBytes);
      });
  }

  async fetchSigned(input: {
    rawBody: Buffer;
    timestamp?: string;
    signature?: string;
    principal?: string;
    clientIp?: string;
  }): Promise<{ text: string; finalUrl: string }> {
    if (!this.config.enabled) throw new ScraperEgressRequestError(404);
    if (
      !Buffer.isBuffer(input.rawBody) ||
      input.rawBody.byteLength > this.config.maxRequestBytes
    ) {
      throw new ScraperEgressRequestError(401);
    }
    this.verifySignature(
      input.rawBody,
      input.timestamp,
      input.signature,
      input.principal,
    );
    if (
      !this.limiter.consume(input.principal ?? "anonymous", input.clientIp)
    ) {
      throw new ScraperEgressRequestError(429);
    }

    const url = this.parseRequestBody(input.rawBody);
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(abortError()),
      this.config.timeoutMs,
    );

    try {
      let currentUrl = url;
      for (
        let redirects = 0;
        redirects <= this.config.maxRedirects;
        redirects += 1
      ) {
        throwIfAborted(controller.signal);
        const addresses = await awaitWithAbort(
          this.resolveHost(
            normalizedHostname(currentUrl.hostname),
            controller.signal,
          ),
          controller.signal,
        );
        if (
          addresses.length === 0 ||
          addresses.some((address) => !validResolvedAddress(address))
        ) {
          throw new ScraperEgressRequestError(502);
        }

        const response = await awaitWithAbort(
          this.transport({
            url: currentUrl,
            address: addresses[0],
            signal: controller.signal,
          }),
          controller.signal,
        );

        if (isRedirect(response.status)) {
          if (!response.location || redirects === this.config.maxRedirects) {
            throw new ScraperEgressRequestError(502);
          }
          if (authorityHasExplicitPort(response.location)) {
            throw new ScraperEgressRequestError(502);
          }
          let redirectUrl: string;
          try {
            redirectUrl = new URL(response.location, currentUrl).toString();
          } catch {
            throw new ScraperEgressRequestError(502);
          }
          currentUrl = parseApprovedEgressUrl(
            redirectUrl,
            new Set(this.config.allowedHosts),
          );
          continue;
        }

        if (response.status < 200 || response.status >= 300) {
          throw new ScraperEgressRequestError(502);
        }
        if (
          !isHtmlContentType(response.contentType) ||
          Buffer.byteLength(response.body, "utf8") >
            this.config.maxResponseBytes
        ) {
          throw new ScraperEgressRequestError(502);
        }
        return { text: response.body, finalUrl: currentUrl.toString() };
      }
    } catch (error) {
      if (error instanceof ScraperEgressRequestError) throw error;
      throw new ScraperEgressRequestError(502);
    } finally {
      clearTimeout(timer);
    }

    throw new ScraperEgressRequestError(502);
  }

  private verifySignature(
    rawBody: Buffer,
    timestamp: string | undefined,
    signature: string | undefined,
    principal: string | undefined,
  ): void {
    if (!this.config.enabled) throw new ScraperEgressRequestError(404);
    if (principal !== undefined && !isValidPrincipal(principal)) {
      throw new ScraperEgressRequestError(401);
    }
    if (
      !timestamp ||
      !/^\d{10}$/.test(timestamp) ||
      !signature ||
      !/^v1=[a-f0-9]{64}$/.test(signature)
    ) {
      throw new ScraperEgressRequestError(401);
    }

    const timestampSeconds = Number(timestamp);
    if (
      !Number.isSafeInteger(timestampSeconds) ||
      Math.abs(Math.floor(this.now() / 1000) - timestampSeconds) >
        this.config.signatureMaxAgeSeconds
    ) {
      throw new ScraperEgressRequestError(401);
    }

    const expected = createHmac("sha256", this.config.sharedSecret)
      .update(`${timestamp}.${principal === undefined ? "" : `${principal}.`}`)
      .update(rawBody)
      .digest("hex");
    const supplied = Buffer.from(signature, "utf8");
    const calculated = Buffer.from(`v1=${expected}`, "utf8");
    if (
      supplied.byteLength !== calculated.byteLength ||
      !timingSafeEqual(supplied, calculated)
    ) {
      throw new ScraperEgressRequestError(401);
    }
  }

  private parseRequestBody(rawBody: Buffer): URL {
    try {
      const payload = JSON.parse(rawBody.toString("utf8")) as Record<
        string,
        unknown
      >;
      if (
        !payload ||
        Array.isArray(payload) ||
        Object.keys(payload).some((key) => key !== "url") ||
        typeof payload.url !== "string" ||
        payload.url.length === 0 ||
        payload.url.length > 2_048
      ) {
        throw new Error("invalid request");
      }
      return parseApprovedEgressUrl(
        payload.url,
        new Set((this.config as ScraperEgressEnabledConfig).allowedHosts),
      );
    } catch (error) {
      if (error instanceof ScraperEgressRequestError) throw error;
      throw new ScraperEgressRequestError(502);
    }
  }
}
