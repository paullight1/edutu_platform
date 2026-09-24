import { Injectable } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import * as https from "node:https";
import type { IncomingMessage } from "node:http";
import * as cheerio from "cheerio";
import {
  buildPinnedHttpsRequestOptions,
  isGlobalUnicastAddress,
  type ResolvedEgressAddress,
} from "../scraper/scraper-egress.service";

export interface OpportunitySourceEvidence {
  sourceBacked: boolean;
  sourceUrl: string | null;
  sourceDomain: string | null;
  sourceTextLength: number;
  error: string | null;
}

const SOURCE_FETCH_TIMEOUT_MS = 12_000;
const SOURCE_FETCH_MAX_BYTES = 1_500_000;
const SOURCE_FETCH_MAX_REDIRECTS = 3;
const MIN_USEFUL_SOURCE_CHARS = 400;

function sourceError(message: string): Error {
  const error = new Error(message);
  error.name = "OpportunitySourceEvidenceError";
  return error;
}

function parseSafeSourceUrl(rawUrl: string, baseUrl?: URL): URL {
  let parsed: URL;
  try {
    parsed = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
  } catch {
    throw sourceError("The source URL is invalid.");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    throw sourceError("The source URL must be a standard HTTPS address.");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost")
  ) {
    throw sourceError("The source host is not publicly reachable.");
  }
  if (/^\d+(?:\.\d+){3}$/.test(hostname) && !isGlobalUnicastAddress(hostname)) {
    throw sourceError("The source host is not publicly reachable.");
  }

  parsed.hash = "";
  return parsed;
}

function responseContentType(response: IncomingMessage): string {
  const value = response.headers["content-type"];
  return (Array.isArray(value) ? value[0] : value || "").toLowerCase();
}

function isHtmlLike(contentType: string): boolean {
  return (
    !contentType ||
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml+xml") ||
    contentType.includes("text/plain")
  );
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

async function resolvePublicAddress(
  url: URL,
  signal: AbortSignal,
): Promise<ResolvedEgressAddress> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const entries = await lookup(hostname, { all: true, verbatim: true });
  if (signal.aborted) throw sourceError("The source request timed out.");
  if (
    entries.length === 0 ||
    entries.some((entry) => !isGlobalUnicastAddress(entry.address))
  ) {
    throw sourceError("The source host did not resolve to a public address.");
  }

  const selected = entries[0];
  return {
    address: selected.address,
    family: selected.family as 4 | 6,
  };
}

function requestSourcePage(
  url: URL,
  address: ResolvedEgressAddress,
  signal: AbortSignal,
): Promise<{
  status: number;
  contentType: string;
  body: string;
  location: string | null;
}> {
  return new Promise((resolve, reject) => {
    let bytesRead = 0;
    const chunks: Buffer[] = [];
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(
        error instanceof Error ? error : sourceError("Source fetch failed."),
      );
    };

    const request = https.request(
      buildPinnedHttpsRequestOptions(url, address, signal),
      (response) => {
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytesRead += buffer.byteLength;
          if (bytesRead > SOURCE_FETCH_MAX_BYTES) {
            response.destroy();
            fail(
              sourceError("The source page is too large to inspect safely."),
            );
            return;
          }
          chunks.push(buffer);
        });
        response.once("aborted", () =>
          fail(sourceError("Source response aborted.")),
        );
        response.once("error", fail);
        response.once("end", () => {
          if (settled) return;
          settled = true;
          resolve({
            status: response.statusCode ?? 0,
            contentType: responseContentType(response),
            body: Buffer.concat(chunks).toString("utf8"),
            location:
              typeof response.headers.location === "string"
                ? response.headers.location
                : null,
          });
        });
      },
    );

    request.once("error", fail);
    request.end();
  });
}

function extractUsefulSourceText(html: string): string {
  if (!html) return "";
  const $ = cheerio.load(html);
  $(
    "script, style, noscript, nav, footer, header, aside, form, iframe",
  ).remove();
  const candidates: string[] = [];
  $(
    "article, main, .entry-content, .post-content, .content, [class*='content'], [class*='article']",
  ).each((_, element) => {
    const text = $(element).text().replace(/\s+/g, " ").trim();
    if (text.length >= 120) candidates.push(text);
  });

  return (
    candidates.length
      ? candidates
          .sort((left, right) => right.length - left.length)
          .slice(0, 3)
          .join("\n\n")
      : $("body").text()
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12_000);
}

@Injectable()
export class OpportunitySourceEvidenceService {
  async inspect(rawUrl?: string | null): Promise<OpportunitySourceEvidence> {
    if (!rawUrl?.trim()) {
      return {
        sourceBacked: false,
        sourceUrl: null,
        sourceDomain: null,
        sourceTextLength: 0,
        error: "No source URL is available for verification.",
      };
    }

    let initialUrl: URL;
    try {
      initialUrl = parseSafeSourceUrl(rawUrl.trim());
    } catch (error) {
      return {
        sourceBacked: false,
        sourceUrl: rawUrl.trim(),
        sourceDomain: null,
        sourceTextLength: 0,
        error:
          error instanceof Error ? error.message : "The source URL is invalid.",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(sourceError("The source request timed out.")),
      SOURCE_FETCH_TIMEOUT_MS,
    );

    try {
      let currentUrl = initialUrl;
      for (
        let redirects = 0;
        redirects <= SOURCE_FETCH_MAX_REDIRECTS;
        redirects += 1
      ) {
        const address = await resolvePublicAddress(
          currentUrl,
          controller.signal,
        );
        const response = await requestSourcePage(
          currentUrl,
          address,
          controller.signal,
        );

        if (isRedirect(response.status)) {
          if (!response.location || redirects === SOURCE_FETCH_MAX_REDIRECTS) {
            throw sourceError("The source redirected too many times.");
          }
          currentUrl = parseSafeSourceUrl(response.location, currentUrl);
          continue;
        }

        if (response.status < 200 || response.status >= 300) {
          throw sourceError(
            "The source page could not be reached successfully.",
          );
        }
        if (!isHtmlLike(response.contentType)) {
          throw sourceError("The source did not return a readable web page.");
        }

        const text = extractUsefulSourceText(response.body);
        const sourceBacked = text.length >= MIN_USEFUL_SOURCE_CHARS;
        return {
          sourceBacked,
          sourceUrl: currentUrl.toString(),
          sourceDomain: currentUrl.hostname.replace(/^www\./, "").toLowerCase(),
          sourceTextLength: text.length,
          error: sourceBacked
            ? null
            : "Source page did not contain enough useful text.",
        };
      }
    } catch (error) {
      return {
        sourceBacked: false,
        sourceUrl: initialUrl.toString(),
        sourceDomain: initialUrl.hostname.replace(/^www\./, "").toLowerCase(),
        sourceTextLength: 0,
        error:
          error instanceof Error
            ? error.message
            : "The source page could not be verified.",
      };
    } finally {
      clearTimeout(timeout);
    }

    return {
      sourceBacked: false,
      sourceUrl: initialUrl.toString(),
      sourceDomain: initialUrl.hostname.replace(/^www\./, "").toLowerCase(),
      sourceTextLength: 0,
      error: "The source page could not be verified.",
    };
  }
}
