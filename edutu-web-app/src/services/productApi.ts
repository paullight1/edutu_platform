import { getApiBaseUrl } from "../lib/apiBaseUrl";
import { getLocalDevAuthHeaders } from "../lib/localDevAuthHeaders";
import { retry } from "../lib/retry";

export class ProductApiUnavailableError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ProductApiUnavailableError";
  }
}

export function isProductApiUnavailableError(error: unknown): boolean {
  return error instanceof ProductApiUnavailableError;
}

/**
 * Thrown when the backend rejects an AI call because the user is out of
 * credits (HTTP 402, code 'insufficient_credits') or over the free daily
 * allowance (HTTP 429, code 'limit'). Callers should catch this and open
 * the UpgradeModal instead of showing a generic error.
 */
export class UpgradeRequiredError extends Error {
  constructor(
    message: string,
    public code: "insufficient_credits" | "limit" | "paid_plan_required",
    public status: number,
    public required?: number,
  ) {
    super(message);
    this.name = "UpgradeRequiredError";
  }
}

export function isUpgradeRequiredError(
  error: unknown,
): error is UpgradeRequiredError {
  return error instanceof UpgradeRequiredError;
}

const REQUEST_TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 3;

class NetworkAttemptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkAttemptError";
  }
}

export class ProductApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiStatusError";
  }
}

export async function productApiRequest<T>(
  path: string,
  token: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  let apiBaseUrl: string;

  try {
    apiBaseUrl = getApiBaseUrl("Product API");
  } catch (error) {
    throw new ProductApiUnavailableError(
      error instanceof Error ? error.message : "Product API is not configured",
    );
  }

  const { timeoutMs = REQUEST_TIMEOUT_MS, ...requestOptions } = options;
  const safeRead = ["GET", "HEAD"].includes(
    (options.method || "GET").toUpperCase(),
  );
  const attemptRequest = async (): Promise<T> => {
    options.signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(
      () =>
        controller.abort(new DOMException("Request timed out", "TimeoutError")),
      timeoutMs,
    );
    try {
      let response: Response;
      try {
        response = await fetch(`${apiBaseUrl}${path}`, {
          ...requestOptions,
          headers: {
            ...(options.body instanceof FormData
              ? {}
              : { "Content-Type": "application/json" }),
            Authorization: `Bearer ${token}`,
            ...getLocalDevAuthHeaders(),
            ...Object.fromEntries(new Headers(options.headers).entries()),
          },
          signal: controller.signal,
        });
      } catch (error) {
        if (options.signal?.aborted)
          throw (
            options.signal.reason || new DOMException("Aborted", "AbortError")
          );
        throw new NetworkAttemptError(
          error instanceof Error ? error.message : "Product API is unreachable",
        );
      }

      if ([404, 405, 501].includes(response.status)) {
        throw new ProductApiUnavailableError(
          `Product API route unavailable: ${path}`,
          response.status,
        );
      }

      if (!response.ok) {
        let message = `Product API request failed with ${response.status}`;
        let body: {
          message?: string;
          error?: string;
          code?: string;
          required?: number;
        } | null = null;
        try {
          body = await response.clone().json();
          message = body?.message || body?.error || message;
        } catch {
          const text = await response.text();
          if (text) message = text;
        }

        const normalizedMessage = Array.isArray(message)
          ? message.join(", ")
          : message;

        if (
          (response.status === 402 && ["insufficient_credits", "paid_plan_required"].includes(body?.code || "")) ||
          (response.status === 429 && body?.code === "limit")
        ) {
          throw new UpgradeRequiredError(
            normalizedMessage,
            body!.code as "insufficient_credits" | "limit" | "paid_plan_required",
            response.status,
            typeof body?.required === "number" ? body.required : undefined,
          );
        }

        throw new ProductApiError(
          normalizedMessage,
          response.status,
          body?.code,
        );
      }

      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  };

  try {
    return await retry(attemptRequest, {
      maxAttempts: safeRead ? MAX_ATTEMPTS : 1,
      baseDelay: 1000,
      maxDelay: 10000,
      shouldRetry: (error: unknown): boolean => {
        if (error instanceof NetworkAttemptError) return true;
        if (error instanceof ProductApiError)
          return error.status >= 500 && error.status < 600;
        return false;
      },
    });
  } catch (error) {
    if (error instanceof NetworkAttemptError) {
      throw new ProductApiUnavailableError(
        error.message || "Product API is unreachable",
      );
    }
    if (error instanceof ProductApiError) {
      throw error;
    }
    throw error;
  }
}
