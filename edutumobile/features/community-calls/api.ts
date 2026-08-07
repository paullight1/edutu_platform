import {
  getApiBaseUrl,
  type GetAuthToken,
} from "@edutu/core/src/services/productApi";

export type CommunityCallStatus =
  | "scheduled"
  | "starting"
  | "live"
  | "ended"
  | "cancelled"
  | "expired"
  | "failed";
export type CommunityCallInviteStatus =
  | "pending"
  | "ringing"
  | "notified"
  | "joined"
  | "declined"
  | "missed"
  | "unreachable";
export type CommunityCallErrorCode =
  | "COMMUNITY_CALLS_DISABLED"
  | "CALL_NOT_FOUND"
  | "CALL_FORBIDDEN"
  | "CALL_NOT_SCHEDULED"
  | "CALL_OUTSIDE_START_WINDOW"
  | "CALL_ALREADY_LIVE"
  | "CALL_NOT_LIVE"
  | "CALL_FULL"
  | "CALL_INVALID_TRANSITION"
  | "CALL_IDEMPOTENCY_REQUIRED"
  | "CALL_MEMBERSHIP_REQUIRED"
  | "CALL_NOT_INVITED"
  | "MEDIA_UNAVAILABLE"
  | "REQUEST_TIMEOUT"
  | "INVALID_RESPONSE";

export interface CommunityCall {
  id: string;
  groupId: string;
  title: string;
  scheduledFor: string;
  durationMinutes: number;
  status: CommunityCallStatus;
  createdBy: string;
  startedBy: string | null;
  endedBy: string | null;
  startedAt: string | null;
  ringExpiresAt: string | null;
  endedAt: string | null;
  cancelledAt: string | null;
  failureCode: string | null;
  participantCount?: number;
  viewerInviteStatus?: CommunityCallInviteStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleCommunityCallInput {
  title: string;
  scheduledFor: string;
  durationMinutes: number;
}
export type UpdateCommunityCallInput = Partial<ScheduleCommunityCallInput>;
export interface CommunityCallJoinToken {
  token: string;
  signalingUrl: string;
  expiresAt: string;
}

export class CommunityCallApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: CommunityCallErrorCode,
  ) {
    super(message);
    this.name = "CommunityCallApiError";
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CALL_STATUSES = new Set<CommunityCallStatus>([
  "scheduled",
  "starting",
  "live",
  "ended",
  "cancelled",
  "expired",
  "failed",
]);

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function validateSignalingUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048)
    throw new CommunityCallApiError(
      "The voice server returned an invalid address.",
      502,
      "INVALID_RESPONSE",
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CommunityCallApiError(
      "The voice server returned an invalid address.",
      502,
      "INVALID_RESPONSE",
    );
  }
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";
  const development =
    typeof __DEV__ === "undefined"
      ? process.env.NODE_ENV !== "production"
      : __DEV__;
  if (
    url.username ||
    url.password ||
    url.hash ||
    (url.protocol !== "wss:" &&
      !(development && loopback && url.protocol === "ws:"))
  ) {
    throw new CommunityCallApiError(
      "The voice server returned an insecure address.",
      502,
      "INVALID_RESPONSE",
    );
  }
  return url.toString();
}

function parseCall(value: unknown): CommunityCall {
  const row = object(value);
  if (
    !row ||
    typeof row.id !== "string" ||
    typeof row.groupId !== "string" ||
    typeof row.title !== "string" ||
    typeof row.scheduledFor !== "string" ||
    typeof row.durationMinutes !== "number" ||
    typeof row.status !== "string" ||
    !CALL_STATUSES.has(row.status as CommunityCallStatus) ||
    !UUID.test(row.id) ||
    !UUID.test(row.groupId) ||
    row.title.length > 120 ||
    !Number.isInteger(row.durationMinutes) ||
    row.durationMinutes < 5 ||
    row.durationMinutes > 480 ||
    Number.isNaN(Date.parse(row.scheduledFor))
  ) {
    throw new CommunityCallApiError(
      "Edutu returned an invalid call record.",
      502,
      "INVALID_RESPONSE",
    );
  }
  const viewerParticipant = object(row.viewerParticipant);
  const inviteStatus =
    typeof row.viewerInviteStatus === "string"
      ? row.viewerInviteStatus
      : typeof viewerParticipant?.inviteStatus === "string"
        ? viewerParticipant.inviteStatus
        : null;
  return {
    ...(row as unknown as CommunityCall),
    viewerInviteStatus:
      inviteStatus &&
      [
        "pending",
        "ringing",
        "notified",
        "joined",
        "declined",
        "missed",
        "unreachable",
      ].includes(inviteStatus)
        ? (inviteStatus as CommunityCallInviteStatus)
        : null,
  };
}

function id(value: string): string {
  if (!UUID.test(value))
    throw new CommunityCallApiError(
      "That call or group address is invalid.",
      400,
      "INVALID_RESPONSE",
    );
  return encodeURIComponent(value);
}

export function createIdempotencyKey(prefix = "mobile"): string {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`;
}

async function request<T>(
  path: string,
  getToken: GetAuthToken,
  init: RequestInit = {},
  idempotencyKey?: string,
): Promise<T> {
  let tokenTimer: ReturnType<typeof setTimeout> | undefined;
  const tokenTimeout = new Promise<null>((resolve) => {
    tokenTimer = setTimeout(resolve, 8_000, null);
  });
  const token = await Promise.race([getToken(), tokenTimeout])
    .catch(() => null)
    .finally(() => {
      if (tokenTimer) clearTimeout(tokenTimer);
    });
  if (!token)
    throw new CommunityCallApiError(
      "Sign in to use community calls.",
      401,
      "CALL_MEMBERSHIP_REQUIRED",
    );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const abortFromCaller = () => controller.abort();
  init.signal?.addEventListener?.("abort", abortFromCaller, { once: true });
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      signal: init.signal ?? controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (_error) {
    if (controller.signal.aborted) {
      throw new CommunityCallApiError(
        "The request timed out. Check your connection and try again.",
        0,
        "REQUEST_TIMEOUT",
      );
    }
    throw new CommunityCallApiError(
      "We couldn't reach Edutu. Check your connection and try again.",
      0,
      "MEDIA_UNAVAILABLE",
    );
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener?.("abort", abortFromCaller);
  }
  const body =
    response.status === 204 ? {} : await response.json().catch(() => null);
  if (!response.ok) {
    const error = object(body);
    const code =
      typeof error?.code === "string"
        ? (error.code as CommunityCallErrorCode)
        : "MEDIA_UNAVAILABLE";
    const message =
      typeof error?.message === "string"
        ? error.message
        : "That call action could not be completed.";
    throw new CommunityCallApiError(message, response.status, code);
  }
  return body as T;
}

export async function listCommunityCalls(
  groupId: string,
  getToken: GetAuthToken,
): Promise<CommunityCall[]> {
  const body = await request<unknown>(
    `/communities/groups/${id(groupId)}/calls`,
    getToken,
  );
  const rows = Array.isArray(body) ? body : object(body)?.calls;
  if (!Array.isArray(rows))
    throw new CommunityCallApiError(
      "Edutu returned an invalid call list.",
      502,
      "INVALID_RESPONSE",
    );
  return rows.map(parseCall);
}
export async function getCommunityCall(callId: string, getToken: GetAuthToken) {
  return parseCall(await request(`/communities/calls/${id(callId)}`, getToken));
}
export async function scheduleCommunityCall(
  groupId: string,
  input: ScheduleCommunityCallInput,
  getToken: GetAuthToken,
  idempotencyKey = createIdempotencyKey("schedule"),
) {
  return parseCall(
    await request(
      `/communities/groups/${id(groupId)}/calls`,
      getToken,
      { method: "POST", body: JSON.stringify(input) },
      idempotencyKey,
    ),
  );
}
export async function updateCommunityCall(
  callId: string,
  input: UpdateCommunityCallInput,
  getToken: GetAuthToken,
  idempotencyKey = createIdempotencyKey("update"),
) {
  return parseCall(
    await request(
      `/communities/calls/${id(callId)}`,
      getToken,
      { method: "PATCH", body: JSON.stringify(input) },
      idempotencyKey,
    ),
  );
}
async function transition(
  callId: string,
  action: "start" | "cancel" | "end",
  getToken: GetAuthToken,
  idempotencyKey = createIdempotencyKey(action),
) {
  return parseCall(
    await request(
      `/communities/calls/${id(callId)}/${action}`,
      getToken,
      { method: "POST" },
      idempotencyKey,
    ),
  );
}
export const startCommunityCall = (
  callId: string,
  getToken: GetAuthToken,
  idempotencyKey?: string,
) => transition(callId, "start", getToken, idempotencyKey);
export const cancelCommunityCall = (
  callId: string,
  getToken: GetAuthToken,
  idempotencyKey?: string,
) => transition(callId, "cancel", getToken, idempotencyKey);
export const endCommunityCall = (
  callId: string,
  getToken: GetAuthToken,
  idempotencyKey?: string,
) => transition(callId, "end", getToken, idempotencyKey);
export async function leaveCommunityCall(
  callId: string,
  getToken: GetAuthToken,
  idempotencyKey = createIdempotencyKey("leave"),
) {
  await request(
    `/communities/calls/${id(callId)}/leave`,
    getToken,
    { method: "POST" },
    idempotencyKey,
  );
}
export async function declineCommunityCall(
  callId: string,
  getToken: GetAuthToken,
  idempotencyKey = createIdempotencyKey("decline"),
) {
  await request(
    `/communities/calls/${id(callId)}/decline`,
    getToken,
    { method: "POST", body: "{}" },
    idempotencyKey,
  );
}
export async function fetchCommunityCallJoinToken(
  callId: string,
  getToken: GetAuthToken,
  idempotencyKey = createIdempotencyKey("join"),
): Promise<CommunityCallJoinToken> {
  const body = object(
    await request(
      `/communities/calls/${id(callId)}/join-token`,
      getToken,
      { method: "POST" },
      idempotencyKey,
    ),
  );
  const token = typeof body?.token === "string" ? body.token : "";
  const expiresAt =
    typeof body?.expiresAt === "string"
      ? body.expiresAt
      : typeof body?.expires_at === "string"
        ? body.expires_at
        : "";
  const signaling = body?.signalingUrl ?? body?.signaling_url;
  if (
    !token ||
    token.length > 8192 ||
    !expiresAt ||
    Number.isNaN(Date.parse(expiresAt))
  )
    throw new CommunityCallApiError(
      "Edutu returned an invalid call token.",
      502,
      "INVALID_RESPONSE",
    );
  return { token, expiresAt, signalingUrl: validateSignalingUrl(signaling) };
}

export function canManageCommunityCall(
  role: string | null | undefined,
): boolean {
  return role === "owner" || role === "mod";
}
