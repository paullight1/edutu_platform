import express, { type Request } from "express";

export const SCRAPER_EGRESS_MAX_REQUEST_BYTES = 16 * 1024;

type RawBodyRequest = Request & { rawBody?: Buffer };

function captureRawBody(
  request: Request,
  _response: unknown,
  buffer: Buffer,
): void {
  (request as RawBodyRequest).rawBody = Buffer.from(buffer);
}

/**
 * Parse the egress request as a bounded raw buffer before Nest's global
 * parsers run. `raw` applies the byte limit to both Content-Length and
 * chunked requests, while the verify hook preserves the exact bytes needed
 * by the HMAC verifier.
 */
export function createScraperEgressBodyLimitMiddleware() {
  return express.raw({
    type: "*/*",
    limit: SCRAPER_EGRESS_MAX_REQUEST_BYTES,
    verify: captureRawBody,
  });
}
