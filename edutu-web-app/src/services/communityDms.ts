import { getApiBaseUrl } from "../lib/apiBaseUrl";
import type { ClerkTokenGetter } from "../lib/clerkToken";

const DEFAULT_TIMEOUT_MS = 12_000;
export const DM_MESSAGE_MAX_LENGTH = 2_000;

export class CommunityDmApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CommunityDmApiError";
    this.status = status;
  }
}

export function isCommunityDmApiError(
  error: unknown,
): error is CommunityDmApiError {
  return (
    error instanceof CommunityDmApiError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: string }).name === "CommunityDmApiError")
  );
}

export type DmStatus = "pending" | "accepted" | "declined";
export type DmRequestDirection = "incoming" | "outgoing";

export interface DmProfile {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface DmConversationDetail {
  id: string;
  status: DmStatus;
  requestedBy: string;
  createdAt: string;
  acceptedAt: string | null;
  lastMessageAt: string;
  otherUser: DmProfile;
  blocked: boolean;
}

export interface DmConversationSummary extends DmConversationDetail {
  lastMessage: {
    body: string;
    senderId: string;
    createdAt: string;
  };
  unreadCount: number;
}

export interface DmRequestSummary {
  id: string;
  direction: DmRequestDirection;
  requestedBy: string;
  createdAt: string;
  otherUser: DmProfile;
  firstMessage: {
    body: string;
    senderId: string;
    createdAt: string;
  };
}

export interface DmMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender: DmProfile;
}

export interface DmRelationship {
  conversationId: string | null;
  status: DmStatus | null;
  direction: DmRequestDirection | null;
  blocked: boolean;
}

export interface CreateDmRequestResult {
  conversation: {
    id: string;
    status: DmStatus;
    requestedBy: string;
  };
  message: DmMessage;
}

export interface DmPageOptions {
  before?: string | Date;
  beforeId?: string;
  limit?: number;
}

type QueryValue = string | number | undefined | null;

function queryString(values: Record<string, QueryValue>): string {
  const entries = Object.entries(values).filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  if (!entries.length) return "";
  return `?${entries
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&")}`;
}

function pageQuery(options: DmPageOptions = {}): string {
  return queryString({
    before:
      options.before instanceof Date ? options.before.toISOString() : options.before,
    beforeId: options.beforeId,
    limit: options.limit,
  });
}

function validateMessageBody(body: string): string {
  const normalized = body.trim();
  if (!normalized) {
    throw new CommunityDmApiError("Write a message before sending.", 400);
  }
  if (normalized.length > DM_MESSAGE_MAX_LENGTH) {
    throw new CommunityDmApiError(
      `Keep messages under ${DM_MESSAGE_MAX_LENGTH.toLocaleString()} characters.`,
      400,
    );
  }
  return normalized;
}

async function getTokenWithTimeout(
  getAuthToken: ClerkTokenGetter,
): Promise<string | null> {
  let tokenTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getAuthToken(),
      new Promise<null>((resolve) => {
        tokenTimeout = setTimeout(() => resolve(null), DEFAULT_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (tokenTimeout) clearTimeout(tokenTimeout);
  }
}

async function requestDmApi<T>(
  path: string,
  options: RequestInit,
  getAuthToken: ClerkTokenGetter,
): Promise<T> {
  const token = await getTokenWithTimeout(getAuthToken);
  if (!token) throw new CommunityDmApiError("Sign in to use messages.", 401);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const hasBody = options.body !== undefined && options.body !== null;
    const response = await fetch(`${getApiBaseUrl("Community")}${path}`, {
      ...options,
      signal: options.signal ?? controller.signal,
      headers: {
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = (await response.json().catch(() => null)) as
      | { message?: string | { message?: string } }
      | null;

    if (!response.ok) {
      const nested =
        payload?.message && typeof payload.message === "object"
          ? payload.message.message
          : undefined;
      const message =
        (typeof payload?.message === "string" ? payload.message : nested) ||
        (response.status === 429
          ? "Too many message attempts. Please wait and try again."
          : "Messages are unavailable right now.");
      throw new CommunityDmApiError(message, response.status);
    }

    return (payload ?? {}) as T;
  } catch (error) {
    if (isCommunityDmApiError(error)) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new CommunityDmApiError(
        "The request timed out. Please try again.",
        408,
      );
    }
    throw new CommunityDmApiError("Check your connection and try again.", 0);
  } finally {
    clearTimeout(timeout);
  }
}

export function fetchDmRelationship(
  userId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<DmRelationship | null> {
  return requestDmApi<DmRelationship | null>(
    `/community-dms/relationships/${encodeURIComponent(userId)}`,
    { method: "GET" },
    getAuthToken,
  );
}

export function createDmRequest(
  recipientId: string,
  body: string,
  getAuthToken: ClerkTokenGetter,
): Promise<CreateDmRequestResult> {
  const normalizedBody = validateMessageBody(body);
  return requestDmApi<CreateDmRequestResult>(
    "/community-dms/requests",
    {
      method: "POST",
      body: JSON.stringify({ recipientId, body: normalizedBody }),
    },
    getAuthToken,
  );
}

export async function fetchDmRequests(
  direction: DmRequestDirection,
  options: DmPageOptions,
  getAuthToken: ClerkTokenGetter,
): Promise<DmRequestSummary[]> {
  const query = queryString({
    direction,
    before:
      options.before instanceof Date ? options.before.toISOString() : options.before,
    beforeId: options.beforeId,
    limit: options.limit,
  });
  const result = await requestDmApi<DmRequestSummary[]>(
    `/community-dms/requests${query}`,
    { method: "GET" },
    getAuthToken,
  );
  return Array.isArray(result) ? result : [];
}

export function acceptDmRequest(
  conversationId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<DmConversationDetail> {
  return requestDmApi<DmConversationDetail>(
    `/community-dms/requests/${encodeURIComponent(conversationId)}/accept`,
    { method: "POST" },
    getAuthToken,
  );
}

export function declineDmRequest(
  conversationId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<{ success: true }> {
  return requestDmApi<{ success: true }>(
    `/community-dms/requests/${encodeURIComponent(conversationId)}`,
    { method: "DELETE" },
    getAuthToken,
  );
}

export async function fetchDmConversations(
  options: DmPageOptions,
  getAuthToken: ClerkTokenGetter,
): Promise<DmConversationSummary[]> {
  const result = await requestDmApi<DmConversationSummary[]>(
    `/community-dms/conversations${pageQuery(options)}`,
    { method: "GET" },
    getAuthToken,
  );
  return Array.isArray(result) ? result : [];
}

export function fetchDmConversation(
  conversationId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<DmConversationDetail> {
  return requestDmApi<DmConversationDetail>(
    `/community-dms/conversations/${encodeURIComponent(conversationId)}`,
    { method: "GET" },
    getAuthToken,
  );
}

export async function fetchDmMessages(
  conversationId: string,
  options: DmPageOptions,
  getAuthToken: ClerkTokenGetter,
): Promise<DmMessage[]> {
  const result = await requestDmApi<DmMessage[]>(
    `/community-dms/conversations/${encodeURIComponent(conversationId)}/messages${pageQuery(options)}`,
    { method: "GET" },
    getAuthToken,
  );
  return Array.isArray(result) ? result : [];
}

export function sendDmMessage(
  conversationId: string,
  body: string,
  getAuthToken: ClerkTokenGetter,
): Promise<DmMessage> {
  const normalizedBody = validateMessageBody(body);
  return requestDmApi<DmMessage>(
    `/community-dms/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: "POST", body: JSON.stringify({ body: normalizedBody }) },
    getAuthToken,
  );
}

export function markDmConversationRead(
  conversationId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<{ success: true }> {
  return requestDmApi<{ success: true }>(
    `/community-dms/conversations/${encodeURIComponent(conversationId)}/read`,
    { method: "POST" },
    getAuthToken,
  );
}

export function hideDmConversation(
  conversationId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<{ success: true }> {
  return requestDmApi<{ success: true }>(
    `/community-dms/conversations/${encodeURIComponent(conversationId)}`,
    { method: "DELETE" },
    getAuthToken,
  );
}

export function blockDmUser(
  userId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<{ success: true }> {
  return requestDmApi<{ success: true }>(
    "/community-dms/blocks",
    { method: "POST", body: JSON.stringify({ userId }) },
    getAuthToken,
  );
}

export function unblockDmUser(
  userId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<{ success: true }> {
  return requestDmApi<{ success: true }>(
    `/community-dms/blocks/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
    getAuthToken,
  );
}

export async function fetchDmBlocks(
  getAuthToken: ClerkTokenGetter,
): Promise<DmProfile[]> {
  const result = await requestDmApi<DmProfile[]>(
    "/community-dms/blocks?limit=50",
    { method: "GET" },
    getAuthToken,
  );
  return Array.isArray(result) ? result : [];
}
