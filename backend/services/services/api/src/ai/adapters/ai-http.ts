// Shared HTTP client for AI provider adapters.
//
// Node's global fetch has NO default timeout, so a hung provider socket would
// otherwise keep the inbound API request open indefinitely — piling up sockets
// and pending promises until the process exhausts file descriptors / memory.
// This wrapper enforces a per-attempt timeout and retries transient failures
// (network errors, 408, 429, 5xx) with jittered exponential backoff.

const DEFAULT_TIMEOUT_MS = optionalNumber(
  process.env.AI_REQUEST_TIMEOUT_MS,
  30_000,
);
const DEFAULT_RETRIES = optionalNumber(process.env.AI_REQUEST_RETRIES, 2);
const BASE_BACKOFF_MS = optionalNumber(process.env.AI_REQUEST_BACKOFF_MS, 500);
const MAX_BACKOFF_MS = 8_000;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function optionalNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export interface AiFetchOptions {
  /** Per-attempt timeout in ms. Defaults to AI_REQUEST_TIMEOUT_MS or 30s. */
  timeoutMs?: number;
  /** Number of RETRIES after the first attempt. Defaults to 2 (3 attempts). */
  retries?: number;
  /** Label used in error messages, e.g. the provider name. */
  label?: string;
  /** Caller-owned cancellation signal (for example an HTTP client disconnect). */
  signal?: AbortSignal;
}

function backoffDelay(
  attempt: number,
  retryAfterHeader?: string | null,
): number {
  const retryAfter = Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    // Retry-After is in seconds; cap it so a hostile header can't stall us.
    return Math.min(retryAfter * 1000, MAX_BACKOFF_MS);
  }
  const exponential = BASE_BACKOFF_MS * 2 ** attempt;
  const jitter = Math.random() * BASE_BACKOFF_MS;
  return Math.min(exponential + jitter, MAX_BACKOFF_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch() with a per-attempt timeout and bounded retry/backoff.
 *
 * A successful response (2xx) or a non-retryable error response (e.g. 400/401)
 * is returned as-is so callers keep their existing `if (!response.ok)` handling.
 * Retryable responses (429/5xx) are retried; the LAST retryable response is
 * returned if all attempts are exhausted. Network errors / timeouts are retried
 * and rethrown (wrapped) once attempts run out.
 */
export async function aiFetch(
  url: string,
  init: RequestInit,
  options: AiFetchOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const label = options.label ?? "AI";

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error
        ? options.signal.reason
        : abortError();
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abortCaller = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortCaller, { once: true });

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });

      if (response.ok || !RETRYABLE_STATUS.has(response.status)) {
        return response;
      }

      // Retryable status. If this was the last attempt, hand the response back
      // so the caller can read its body for the error message.
      if (attempt === retries) {
        return response;
      }

      const delay = backoffDelay(attempt, response.headers.get("retry-after"));
      // Drain the body so the socket can be reused by keep-alive.
      await response.text().catch(() => undefined);
      await sleep(delay);
    } catch (error) {
      lastError = error;
      // A caller abort is definitive. Retrying or falling over to another
      // provider after the socket has gone away only burns more budget.
      if (options.signal?.aborted) {
        throw options.signal.reason instanceof Error
          ? options.signal.reason
          : abortError();
      }
      const isAbort = error instanceof Error && error.name === "AbortError";
      if (attempt === retries) {
        throw new Error(
          `${label} request ${isAbort ? `timed out after ${timeoutMs}ms` : "failed"}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      await sleep(backoffDelay(attempt));
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortCaller);
    }
  }

  // Unreachable in practice (loop either returns or throws), but keeps TS happy.
  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} request failed`);
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}
