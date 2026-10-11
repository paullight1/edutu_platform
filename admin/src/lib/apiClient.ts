import { AdminApiError, type AdminApiFailureCategory } from "./apiError";
import { getLocalAdminEmail, isLocalAdminBypassEnabled } from "./localAdmin";
import { getAdminRuntimeConfig } from "./runtimeConfig";
import { supabase } from "./supabase";

export { AdminApiError } from "./apiError";
export type { AdminApiFailureCategory } from "./apiError";

const DEFAULT_TIMEOUT_MS = 15_000;

interface RefreshedAuth {
  accessToken: string;
  email: string;
}

let refreshSessionPromise: Promise<RefreshedAuth | null> | null = null;
let expiredSessionSignOutPromise: Promise<void> | null = null;

export interface AdminApiRequestInit extends RequestInit {
  timeoutMs?: number;
}

function headersToRecord(init?: HeadersInit): Record<string, string> {
  const headers = new Headers(init);
  const record: Record<string, string> = {};

  headers.forEach((value, key) => {
    record[key] = value;
  });

  return record;
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function now(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Math.round(now() - startedAt));
}

function safeTargetOrigin(apiOrigin: string): string {
  if (apiOrigin) return apiOrigin;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "same-origin";
}

function buildRequestUrl(apiOrigin: string, path: string): string {
  if (!apiOrigin) return path;
  return `${apiOrigin}${path.startsWith("/") ? path : `/${path}`}`;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error && error.name === "AbortError"
  );
}

function categoryForStatus(status: number): AdminApiFailureCategory {
  if (status === 401) return "authentication";
  if (status === 403) return "authorization";
  return "http";
}

function genericMessage(
  category: AdminApiFailureCategory,
  requestId: string,
  status?: number,
): string {
  switch (category) {
    case "configuration":
      return `The admin API is not configured. Reference ${requestId}.`;
    case "authentication":
      return `Your admin session is required or has expired. Reference ${requestId}.`;
    case "authorization":
      return `This admin action is not permitted. Reference ${requestId}.`;
    case "timeout":
      return `The admin API request timed out. Reference ${requestId}.`;
    case "network":
      return `The admin API could not be reached. Reference ${requestId}.`;
    case "invalid-response":
      return `The admin API returned an invalid response. Reference ${requestId}.`;
    case "http":
    default:
      return `The admin API request failed${status ? ` (${status})` : ""}. Reference ${requestId}.`;
  }
}

function makeAdminApiError(input: {
  category: AdminApiFailureCategory;
  requestId: string;
  targetOrigin: string;
  startedAt: number;
  status?: number;
}): AdminApiError {
  return new AdminApiError({
    message: genericMessage(input.category, input.requestId, input.status),
    category: input.category,
    status: input.status,
    requestId: input.requestId,
    targetOrigin: input.targetOrigin,
    elapsedMs: elapsedSince(input.startedAt),
  });
}

export async function getAdminAuthHeaders(
  extraHeaders?: HeadersInit,
): Promise<Record<string, string>> {
  const headers = new Headers(extraHeaders);

  if (isLocalAdminBypassEnabled()) {
    headers.set("X-Edutu-Admin-Email", getLocalAdminEmail());
    return headersToRecord(headers);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Admin session is required");
  }

  headers.set("Authorization", `Bearer ${session.access_token}`);
  headers.set("X-Edutu-Admin-Email", session.user?.email || "");
  return headersToRecord(headers);
}

/**
 * Authenticated response helper for API calls that need access to the raw
 * Response (for example streaming endpoints and multipart uploads). Keep the
 * one-time expired-token recovery consistent with adminApiJson.
 */
export async function adminApiFetch(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const startedAt = now();
  const requestHeaders = new Headers(init.headers);
  const requestId = requestHeaders.get("X-Request-Id") || createRequestId();
  requestHeaders.set("X-Request-Id", requestId);

  let apiOrigin = "";
  try {
    apiOrigin = getAdminRuntimeConfig().apiOrigin;
  } catch {
    throw makeAdminApiError({
      category: "configuration",
      requestId,
      targetOrigin: "unconfigured",
      startedAt,
    });
  }

  const targetOrigin = safeTargetOrigin(apiOrigin);
  let url: URL;
  try {
    const baseUrl = apiOrigin || globalThis.location?.origin;
    if (!baseUrl) throw new Error("No API base URL is available");
    url = new URL(input, baseUrl);
    if (url.origin !== new URL(baseUrl).origin) {
      throw new Error("Admin API requests must use the configured API origin");
    }
  } catch {
    throw makeAdminApiError({
      category: "configuration",
      requestId,
      targetOrigin,
      startedAt,
    });
  }

  const externalSignal = init.signal;
  const requestInit: RequestInit = { ...init, signal: externalSignal };
  let authenticatedHeaders: Record<string, string>;
  try {
    authenticatedHeaders = await getAdminAuthHeaders(requestHeaders);
  } catch {
    throw makeAdminApiError({
      category: "authentication",
      requestId,
      targetOrigin,
      startedAt,
    });
  }

  try {
    let response = await fetch(url, {
      ...requestInit,
      headers: authenticatedHeaders,
    });

    if (
      response.status === 401 &&
      !isLocalAdminBypassEnabled() &&
      canRetryRequestBody(requestInit.body)
    ) {
      const refreshedHeaders = await refreshAdminAuthHeaders(requestHeaders);
      if (refreshedHeaders && !externalSignal?.aborted) {
        authenticatedHeaders = refreshedHeaders;
        response = await fetch(url, {
          ...requestInit,
          headers: authenticatedHeaders,
        });
      }

      if (
        !externalSignal?.aborted &&
        (!refreshedHeaders || response.status === 401)
      ) {
        await signOutExpiredAdminSession();
      }
    }

    return response;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    if (externalSignal?.aborted) throw error;
    throw makeAdminApiError({
      category: isAbortError(error) ? "timeout" : "network",
      requestId,
      targetOrigin,
      startedAt,
    });
  }
}

async function refreshAdminAuthHeaders(
  extraHeaders?: HeadersInit,
): Promise<Record<string, string> | null> {
  if (!refreshSessionPromise) {
    refreshSessionPromise = (async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.refreshSession();
        if (error || !session?.access_token) return null;
        return {
          accessToken: session.access_token,
          email: session.user?.email || "",
        };
      } catch {
        return null;
      }
    })().finally(() => {
      refreshSessionPromise = null;
    });
  }

  const refreshed = await refreshSessionPromise;
  if (!refreshed) return null;

  const headers = new Headers(extraHeaders);
  headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
  headers.set("X-Edutu-Admin-Email", refreshed.email);
  return headersToRecord(headers);
}

async function signOutExpiredAdminSession(): Promise<void> {
  if (!expiredSessionSignOutPromise) {
    expiredSessionSignOutPromise = (async () => {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Preserve the original authentication error if local cleanup fails.
      }
    })().finally(() => {
      expiredSessionSignOutPromise = null;
    });
  }
  await expiredSessionSignOutPromise;
}

function canRetryRequestBody(body: BodyInit | null | undefined): boolean {
  return !(
    typeof ReadableStream !== "undefined" &&
    body instanceof ReadableStream
  );
}

export async function adminApiJson<T>(
  path: string,
  init: AdminApiRequestInit = {},
): Promise<T> {
  const startedAt = now();
  const requestHeaders = new Headers(init.headers);
  const requestId = requestHeaders.get("X-Request-Id") || createRequestId();
  requestHeaders.set("X-Request-Id", requestId);

  let apiOrigin = "";
  try {
    apiOrigin = getAdminRuntimeConfig().apiOrigin;
  } catch {
    throw makeAdminApiError({
      category: "configuration",
      requestId,
      targetOrigin: "unconfigured",
      startedAt,
    });
  }

  const targetOrigin = safeTargetOrigin(apiOrigin);
  let authenticatedHeaders: Record<string, string>;
  try {
    authenticatedHeaders = await getAdminAuthHeaders(requestHeaders);
  } catch {
    throw makeAdminApiError({
      category: "authentication",
      requestId,
      targetOrigin,
      startedAt,
    });
  }

  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const externalSignal = init.signal;
  const requestInit: AdminApiRequestInit = { ...init };
  delete requestInit.timeoutMs;
  delete requestInit.headers;
  delete requestInit.signal;

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1, timeoutMs));

  const handleExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) handleExternalAbort();
    else externalSignal.addEventListener("abort", handleExternalAbort, { once: true });
  }

  try {
    const url = buildRequestUrl(apiOrigin, path);
    let response = await fetch(url, {
      ...requestInit,
      headers: authenticatedHeaders,
      signal: controller.signal,
    });

    // Tabs can sleep long enough for a Supabase access token to expire before
    // the SDK's refresh timer runs. Refresh once and retry the request; the API
    // guard rejects a 401 before the route handler can apply any changes.
    if (
      response.status === 401 &&
      !isLocalAdminBypassEnabled() &&
      canRetryRequestBody(requestInit.body)
    ) {
      const refreshedHeaders = await refreshAdminAuthHeaders(requestHeaders);
      if (refreshedHeaders && !controller.signal.aborted) {
        authenticatedHeaders = refreshedHeaders;
        response = await fetch(url, {
          ...requestInit,
          headers: authenticatedHeaders,
          signal: controller.signal,
        });
      }

      // Keep the UI from presenting empty dashboard data under a stale local
      // session. A successful refresh followed by another 401 means the
      // session is no longer accepted; a failed refresh means it cannot recover.
      if (
        !controller.signal.aborted &&
        (!refreshedHeaders || response.status === 401)
      ) {
        await signOutExpiredAdminSession();
      }
    }

    const responseRequestId =
      response.headers.get("x-request-id") || requestId;
    const text = await response.text();

    if (!response.ok) {
      throw makeAdminApiError({
        category: categoryForStatus(response.status),
        status: response.status,
        requestId: responseRequestId,
        targetOrigin,
        startedAt,
      });
    }

    if (!text.trim()) return undefined as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      throw makeAdminApiError({
        category: "invalid-response",
        status: response.status,
        requestId: responseRequestId,
        targetOrigin,
        startedAt,
      });
    }
  } catch (error) {
    if (error instanceof AdminApiError) throw error;

    const category: AdminApiFailureCategory =
      isAbortError(error) && (timedOut || !externalSignal)
        ? "timeout"
        : "network";
    throw makeAdminApiError({
      category,
      requestId,
      targetOrigin,
      startedAt,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", handleExternalAbort);
  }
}
