import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import { isIP } from "node:net";
import { isGlobalUnicastAddress } from "./scraper-egress.service";

export class SafeImageFetchError extends Error {
  constructor() {
    super("Safe image request rejected");
    this.name = "SafeImageFetchError";
  }
}

export type SafeImageResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export type SafeImageTransportRequest = {
  url: URL;
  address: SafeImageResolvedAddress;
  signal: AbortSignal;
  maxBytes: number;
};

export type SafeImageTransportResponse = {
  status: number;
  contentType?: string;
  body: Buffer;
  location?: string;
};

export type SafeImageFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  resolveHost?: (
    hostname: string,
    signal?: AbortSignal,
  ) => Promise<SafeImageResolvedAddress[]>;
  transport?: (
    request: SafeImageTransportRequest,
  ) => Promise<SafeImageTransportResponse>;
};

export type SafeImageFetchResult = {
  buffer: Buffer;
  contentType: string;
  extension: string;
  sha256: string;
  finalUrl: string;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const MAX_URL_LENGTH = 2_048;

const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function authorityHasExplicitPort(rawUrl: string): boolean {
  const authorityStart = rawUrl.indexOf("://");
  if (authorityStart < 0) return false;
  const relativeAuthorityEnd = rawUrl.slice(authorityStart + 3).search(/[/?#]/);
  const authorityEnd =
    relativeAuthorityEnd < 0
      ? rawUrl.length
      : authorityStart + 3 + relativeAuthorityEnd;
  const authority = rawUrl.slice(authorityStart + 3, authorityEnd);

  if (authority.includes("@")) return true;
  if (authority.startsWith("[")) {
    const closingBracket = authority.indexOf("]");
    return closingBracket < 0 || authority.slice(closingBracket + 1).length > 0;
  }
  return authority.includes(":");
}

function parseSafeImageUrl(rawUrl: string): URL {
  if (
    typeof rawUrl !== "string" ||
    rawUrl.length === 0 ||
    rawUrl.length > MAX_URL_LENGTH ||
    authorityHasExplicitPort(rawUrl)
  ) {
    throw new SafeImageFetchError();
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SafeImageFetchError();
  }

  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !parsed.hostname
  ) {
    throw new SafeImageFetchError();
  }

  parsed.hash = "";
  return parsed;
}

function abortError(): Error {
  return new Error("Safe image request timed out");
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
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
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

async function defaultResolveHost(
  hostname: string,
  signal?: AbortSignal,
): Promise<SafeImageResolvedAddress[]> {
  const controllerSignal = signal ?? new AbortController().signal;
  const entries = await awaitWithAbort(
    lookup(hostname, { all: true, verbatim: true }),
    controllerSignal,
  );
  return entries.map((entry) => ({
    address: entry.address,
    family: entry.family as 4 | 6,
  }));
}

function isValidResolvedAddress(address: SafeImageResolvedAddress): boolean {
  return (
    (address.family === 4 || address.family === 6) &&
    isIP(address.address) === address.family &&
    isGlobalUnicastAddress(address.address)
  );
}

function responseContentType(
  headers: http.IncomingHttpHeaders,
): string | undefined {
  const value = headers["content-type"];
  return Array.isArray(value) ? value[0] : value;
}

function requestHeaders(url: URL): http.OutgoingHttpHeaders {
  return {
    accept:
      "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1",
    host: url.host,
    "user-agent": "EdutuImageFetcher/1.0",
  };
}

async function defaultTransport(
  request: SafeImageTransportRequest,
): Promise<SafeImageTransportResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let bytesRead = 0;
    const chunks: Buffer[] = [];

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(
        error instanceof Error
          ? error
          : new Error("Safe image transport failed"),
      );
    };

    const onResponse = (response: http.IncomingMessage) => {
      const declaredLength = Number(response.headers["content-length"]);
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > request.maxBytes
      ) {
        response.destroy();
        fail(new Error("Image response too large"));
        return;
      }

      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytesRead += buffer.byteLength;
        if (bytesRead > request.maxBytes) {
          response.destroy();
          fail(new Error("Image response too large"));
          return;
        }
        chunks.push(buffer);
      });
      response.once("aborted", () => fail(new Error("Image response aborted")));
      response.once("error", fail);
      response.once("end", () => {
        if (settled) return;
        settled = true;
        const location = response.headers.location;
        resolve({
          status: response.statusCode ?? 0,
          contentType: responseContentType(response.headers),
          body: Buffer.concat(chunks),
          ...(typeof location === "string" ? { location } : {}),
        });
      });
    };

    const common = {
      hostname: request.address.address,
      family: request.address.family,
      path: `${request.url.pathname || "/"}${request.url.search}`,
      method: "GET",
      headers: requestHeaders(request.url),
      agent: false,
      signal: request.signal,
    };

    const clientRequest =
      request.url.protocol === "https:"
        ? https.request(
            {
              ...common,
              port: 443,
              servername: request.url.hostname,
              rejectUnauthorized: true,
            },
            onResponse,
          )
        : http.request({ ...common, port: 80 }, onResponse);

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

function normalizedImageMime(contentType: string | undefined): string | null {
  const mediaType = contentType?.split(";", 1)[0].trim().toLowerCase();
  return mediaType && IMAGE_MIME_EXTENSIONS[mediaType] ? mediaType : null;
}

export async function fetchSafeImage(
  rawUrl: string,
  options: SafeImageFetchOptions = {},
): Promise<SafeImageFetchResult> {
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const maxBytes = Math.max(1, options.maxBytes ?? DEFAULT_MAX_BYTES);
  const maxRedirects = Math.max(
    0,
    Math.min(options.maxRedirects ?? DEFAULT_MAX_REDIRECTS, 10),
  );
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const transport = options.transport ?? defaultTransport;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(abortError()), timeoutMs);

  try {
    let currentUrl = parseSafeImageUrl(rawUrl);

    for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
      throwIfAborted(controller.signal);
      const addresses = await awaitWithAbort(
        resolveHost(currentUrl.hostname, controller.signal),
        controller.signal,
      );

      if (
        addresses.length === 0 ||
        addresses.some((address) => !isValidResolvedAddress(address))
      ) {
        throw new SafeImageFetchError();
      }

      const response = await awaitWithAbort(
        transport({
          url: currentUrl,
          address: addresses[0],
          signal: controller.signal,
          maxBytes,
        }),
        controller.signal,
      );

      if (isRedirect(response.status)) {
        if (!response.location || redirects === maxRedirects) {
          throw new SafeImageFetchError();
        }
        let redirectUrl: string;
        try {
          redirectUrl = new URL(response.location, currentUrl).toString();
        } catch {
          throw new SafeImageFetchError();
        }
        currentUrl = parseSafeImageUrl(redirectUrl);
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        throw new SafeImageFetchError();
      }

      const contentType = normalizedImageMime(response.contentType);
      if (!contentType || response.body.byteLength > maxBytes) {
        throw new SafeImageFetchError();
      }

      return {
        buffer: response.body,
        contentType,
        extension: IMAGE_MIME_EXTENSIONS[contentType],
        sha256: createHash("sha256").update(response.body).digest("hex"),
        finalUrl: currentUrl.toString(),
      };
    }
  } catch (error) {
    if (error instanceof SafeImageFetchError) throw error;
    throw new SafeImageFetchError();
  } finally {
    clearTimeout(timer);
  }

  throw new SafeImageFetchError();
}
