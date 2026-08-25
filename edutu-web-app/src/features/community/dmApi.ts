import type { ClerkTokenGetter } from "../../lib/clerkToken";
import { getApiBaseUrl } from "../../lib/apiBaseUrl";
import { getLocalDevAuthHeaders } from "../../lib/localDevAuthHeaders";

const REQUEST_TIMEOUT_MS = 12_000;
export const DM_MESSAGE_MAX_LENGTH = 2000;

export class CommunityDmApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "CommunityDmApiError";
  }
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
  lastMessage: { body: string; senderId: string; createdAt: string };
  unreadCount: number;
}

export interface DmRequestSummary {
  id: string;
  direction: DmRequestDirection;
  requestedBy: string;
  createdAt: string;
  otherUser: DmProfile;
  firstMessage: { body: string; senderId: string; createdAt: string };
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

export interface DmPageOptions {
  before?: string | Date;
  beforeId?: string;
  limit?: number;
}

type QueryValue = string | number | undefined | null;
function queryString(values: Record<string, QueryValue>): string {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!entries.length) return "";
  return `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&")}`;
}

function pageQuery(options: DmPageOptions = {}): string {
  return queryString({
    before: options.before instanceof Date ? options.before.toISOString() : options.before,
    beforeId: options.beforeId,
    limit: options.limit,
  });
}

function messageFromPayload(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const message = (payload as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
    if (message && typeof message === "object") {
      const nested = (message as Record<string, unknown>).message;
      if (typeof nested === "string" && nested.trim()) return nested;
    }
  }
  return status === 429
    ? "Too many message attempts. Please wait and try again."
    : "Messages are unavailable right now.";
}

export class CommunityDmApi {
  constructor(private readonly getToken: ClerkTokenGetter) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await Promise.race([
      this.getToken(),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), REQUEST_TIMEOUT_MS)),
    ]).catch(() => null);
    if (!token) throw new CommunityDmApiError("Sign in to use messages.", 401);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${getApiBaseUrl("Community messages")}${path}`, {
        ...options,
        signal: options.signal ?? controller.signal,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...getLocalDevAuthHeaders(),
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        throw new CommunityDmApiError(messageFromPayload(payload, response.status), response.status);
      }
      return (payload ?? {}) as T;
    } catch (error) {
      if (error instanceof CommunityDmApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new CommunityDmApiError("The request timed out. Please try again.", 408);
      }
      throw new CommunityDmApiError("Check your connection and try again.", 0);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  relationship(userId: string): Promise<DmRelationship | null> {
    return this.request(`/community-dms/relationships/${encodeURIComponent(userId)}`);
  }

  listRequests(direction: DmRequestDirection, options: DmPageOptions = {}): Promise<DmRequestSummary[]> {
    return this.request(`/community-dms/requests${queryString({
      direction,
      before: options.before instanceof Date ? options.before.toISOString() : options.before,
      beforeId: options.beforeId,
      limit: options.limit,
    })}`);
  }

  createRequest(recipientId: string, body: string) {
    return this.request("/community-dms/requests", {
      method: "POST",
      body: JSON.stringify({ recipientId, body }),
    });
  }

  acceptRequest(id: string): Promise<DmConversationDetail> {
    return this.request(`/community-dms/requests/${encodeURIComponent(id)}/accept`, { method: "POST" });
  }

  declineRequest(id: string): Promise<{ success: true }> {
    return this.request(`/community-dms/requests/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  listConversations(options: DmPageOptions = {}): Promise<DmConversationSummary[]> {
    return this.request(`/community-dms/conversations${pageQuery(options)}`);
  }

  getConversation(id: string): Promise<DmConversationDetail> {
    return this.request(`/community-dms/conversations/${encodeURIComponent(id)}`);
  }

  listMessages(id: string, options: DmPageOptions = {}): Promise<DmMessage[]> {
    return this.request(`/community-dms/conversations/${encodeURIComponent(id)}/messages${pageQuery(options)}`);
  }

  sendMessage(id: string, body: string): Promise<DmMessage> {
    return this.request(`/community-dms/conversations/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }

  markRead(id: string): Promise<{ success: true }> {
    return this.request(`/community-dms/conversations/${encodeURIComponent(id)}/read`, { method: "POST" });
  }

  hideConversation(id: string): Promise<{ success: true }> {
    return this.request(`/community-dms/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}
