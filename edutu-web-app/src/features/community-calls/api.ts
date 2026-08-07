import { z } from "zod";
import type { ClerkTokenGetter } from "../../lib/clerkToken";
import { getLocalDevAuthHeaders } from "../../lib/localDevAuthHeaders";
import { getVoiceApiOrigin, resolveVoiceSignalingUrl } from "./config";
import {
  communityCallResponseSchema,
  joinTokenResponseSchema,
  type CommunityCall,
} from "./types";

const MAX_RESPONSE_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 15_000;
const callIdSchema = z.string().uuid();
const apiErrorSchema = z.object({
  code: z.string().max(100).optional(),
  message: z.union([z.string(), z.array(z.string())]).optional(),
  error: z.string().optional(),
});

export class CommunityCallApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "CommunityCallApiError";
  }

  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export interface CommunityCallJoinSession {
  token: string;
  expiresAt: string | null;
  signalingUrl: string;
  nodeId: string | null;
  roomId: string | null;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new CommunityCallApiError(
      "The call server returned too much data.",
      "INVALID_RESPONSE",
      response.status,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CommunityCallApiError(
      "The call server returned an invalid response.",
      "INVALID_RESPONSE",
      response.status,
    );
  }
}

function messageFromApiError(payload: unknown, status: number): { code: string; message: string } {
  const parsed = apiErrorSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      code: `HTTP_${status}`,
      message: "The call request could not be completed.",
    };
  }
  const message = Array.isArray(parsed.data.message)
    ? parsed.data.message.join(", ")
    : parsed.data.message ?? parsed.data.error ?? "The call request could not be completed.";
  return { code: parsed.data.code ?? `HTTP_${status}`, message };
}

function makeIdempotencyKey(action: string): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new CommunityCallApiError(
      "This browser cannot securely create a call request.",
      "UNSUPPORTED_BROWSER",
      0,
    );
  }
  return `${action}:${crypto.randomUUID()}`;
}

export class CommunityCallsApi {
  constructor(private readonly getToken: ClerkTokenGetter) {}

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: RequestInit = {},
  ): Promise<T> {
    if (options.signal?.aborted) {
      throw new CommunityCallApiError("The call request was cancelled.", "REQUEST_ABORTED", 0);
    }
    const token = await this.getToken().catch(() => null);
    if (options.signal?.aborted) {
      throw new CommunityCallApiError("The call request was cancelled.", "REQUEST_ABORTED", 0);
    }
    if (!token) {
      throw new CommunityCallApiError(
        "Your session expired. Sign in again to continue.",
        "UNAUTHENTICATED",
        401,
      );
    }

    const origin = getVoiceApiOrigin();
    const url = new URL(path, `${origin}/`);
    if (url.origin !== origin) {
      throw new CommunityCallApiError(
        "The call request destination is invalid.",
        "INVALID_DESTINATION",
        0,
      );
    }

    const controller = new AbortController();
    let timedOut = false;
    const onTimeout = () => {
      timedOut = true;
      controller.abort();
    };
    const timeoutHandle = window.setTimeout(onTimeout, REQUEST_TIMEOUT_MS);
    const onAbort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${token}`,
          ...getLocalDevAuthHeaders(),
          ...options.headers,
        },
      });
    } catch (error) {
      if (controller.signal.aborted) {
        if (options.signal?.aborted && !timedOut) {
          throw new CommunityCallApiError(
            "The call request was cancelled.",
            "REQUEST_ABORTED",
            0,
          );
        }
        throw new CommunityCallApiError(
          "The call request timed out. Check your connection and try again.",
          "REQUEST_TIMEOUT",
          408,
        );
      }
      throw new CommunityCallApiError(
        error instanceof Error ? error.message : "The call service is unreachable.",
        "NETWORK_ERROR",
        0,
      );
    } finally {
      window.clearTimeout(timeoutHandle);
      options.signal?.removeEventListener("abort", onAbort);
    }

    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      const apiError = messageFromApiError(payload, response.status);
      throw new CommunityCallApiError(apiError.message, apiError.code, response.status);
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new CommunityCallApiError(
        "The call server returned data this app cannot safely use.",
        "INVALID_RESPONSE",
        response.status,
      );
    }
    return parsed.data;
  }

  getCall(callId: string, signal?: AbortSignal): Promise<CommunityCall> {
    const id = callIdSchema.parse(callId);
    return this.request(
      `communities/calls/${encodeURIComponent(id)}`,
      communityCallResponseSchema,
      { method: "GET", signal },
    );
  }

  async createJoinSession(
    callId: string,
    signal?: AbortSignal,
  ): Promise<CommunityCallJoinSession> {
    const id = callIdSchema.parse(callId);
    const response = await this.request(
      `communities/calls/${encodeURIComponent(id)}/join-token`,
      joinTokenResponseSchema,
      {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Idempotency-Key": makeIdempotencyKey("join") },
        signal,
      },
    );
    return {
      ...response,
      signalingUrl: resolveVoiceSignalingUrl(response.signalingUrl),
    };
  }

  async leave(callId: string, signal?: AbortSignal): Promise<void> {
    const id = callIdSchema.parse(callId);
    await this.request(
      `communities/calls/${encodeURIComponent(id)}/leave`,
      z.unknown(),
      {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Idempotency-Key": makeIdempotencyKey("leave") },
        signal,
      },
    );
  }

  async end(callId: string, signal?: AbortSignal): Promise<CommunityCall | null> {
    const id = callIdSchema.parse(callId);
    const payload = await this.request(
      `communities/calls/${encodeURIComponent(id)}/end`,
      z.unknown(),
      {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Idempotency-Key": makeIdempotencyKey("end") },
        signal,
      },
    );
    const parsed = communityCallResponseSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  }
}
