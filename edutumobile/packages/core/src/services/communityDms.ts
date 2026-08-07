import { getApiBaseUrl, type GetAuthToken } from './productApi';

const DEFAULT_TIMEOUT_MS = 12000;
export const DM_MESSAGE_MAX_LENGTH = 2000;

export class CommunityDmApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CommunityDmApiError';
    this.status = status;
  }
}

export function isCommunityDmApiError(error: unknown): error is CommunityDmApiError {
  return (
    error instanceof CommunityDmApiError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { name?: string }).name === 'CommunityDmApiError')
  );
}

export type DmStatus = 'pending' | 'accepted' | 'declined';
export type DmRequestDirection = 'incoming' | 'outgoing';

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
    ([, value]) => value !== undefined && value !== null && value !== '',
  );
  if (entries.length === 0) return '';
  return `?${entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')}`;
}

async function requestDmApi<T>(
  path: string,
  options: RequestInit,
  getAuthToken: GetAuthToken,
): Promise<T> {
  let tokenTimeout: ReturnType<typeof setTimeout> | undefined;
  const token = await Promise.race([
    getAuthToken(),
    new Promise<null>((resolve) => {
      tokenTimeout = setTimeout(() => resolve(null), DEFAULT_TIMEOUT_MS);
    }),
  ]).finally(() => {
    if (tokenTimeout) clearTimeout(tokenTimeout);
  });
  if (!token) throw new CommunityDmApiError('Sign in to use messages.', 401);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const hasBody = options.body !== undefined && options.body !== null;
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      signal: options.signal ?? controller.signal,
      headers: {
        Accept: 'application/json',
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json().catch(() => null) as
      | { message?: string | { message?: string } }
      | null;
    if (!response.ok) {
      const nested =
        payload?.message && typeof payload.message === 'object'
          ? payload.message.message
          : undefined;
      const message =
        (typeof payload?.message === 'string' ? payload.message : nested) ||
        (response.status === 429
          ? 'Too many message attempts. Please wait and try again.'
          : 'Messages are unavailable right now.');
      throw new CommunityDmApiError(message, response.status);
    }
    return (payload ?? {}) as T;
  } catch (error) {
    if (isCommunityDmApiError(error)) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CommunityDmApiError('The request timed out. Please try again.', 408);
    }
    throw new CommunityDmApiError('Check your connection and try again.', 0);
  } finally {
    clearTimeout(timeout);
  }
}

function pageQuery(options: DmPageOptions = {}): string {
  return queryString({
    before:
      options.before instanceof Date ? options.before.toISOString() : options.before,
    beforeId: options.beforeId,
    limit: options.limit,
  });
}

export function fetchDmRelationship(
  userId: string,
  getAuthToken: GetAuthToken,
): Promise<DmRelationship | null> {
  return requestDmApi<DmRelationship | null>(
    `/community-dms/relationships/${encodeURIComponent(userId)}`,
    { method: 'GET' },
    getAuthToken,
  );
}

export function createDmRequest(
  recipientId: string,
  body: string,
  getAuthToken: GetAuthToken,
): Promise<CreateDmRequestResult> {
  return requestDmApi<CreateDmRequestResult>(
    '/community-dms/requests',
    { method: 'POST', body: JSON.stringify({ recipientId, body }) },
    getAuthToken,
  );
}

export function fetchDmRequests(
  direction: DmRequestDirection,
  options: DmPageOptions,
  getAuthToken: GetAuthToken,
): Promise<DmRequestSummary[]> {
  const query = queryString({
    direction,
    before:
      options.before instanceof Date ? options.before.toISOString() : options.before,
    beforeId: options.beforeId,
    limit: options.limit,
  });
  return requestDmApi<DmRequestSummary[]>(
    `/community-dms/requests${query}`,
    { method: 'GET' },
    getAuthToken,
  );
}

export function acceptDmRequest(
  conversationId: string,
  getAuthToken: GetAuthToken,
): Promise<DmConversationDetail> {
  return requestDmApi<DmConversationDetail>(
    `/community-dms/requests/${encodeURIComponent(conversationId)}/accept`,
    { method: 'POST' },
    getAuthToken,
  );
}

export function declineDmRequest(
  conversationId: string,
  getAuthToken: GetAuthToken,
): Promise<{ success: true }> {
  return requestDmApi<{ success: true }>(
    `/community-dms/requests/${encodeURIComponent(conversationId)}`,
    { method: 'DELETE' },
    getAuthToken,
  );
}

export function fetchDmConversations(
  options: DmPageOptions,
  getAuthToken: GetAuthToken,
): Promise<DmConversationSummary[]> {
  return requestDmApi<DmConversationSummary[]>(
    `/community-dms/conversations${pageQuery(options)}`,
    { method: 'GET' },
    getAuthToken,
  );
}

export function fetchDmConversation(
  conversationId: string,
  getAuthToken: GetAuthToken,
): Promise<DmConversationDetail> {
  return requestDmApi<DmConversationDetail>(
    `/community-dms/conversations/${encodeURIComponent(conversationId)}`,
    { method: 'GET' },
    getAuthToken,
  );
}

export function fetchDmMessages(
  conversationId: string,
  options: DmPageOptions,
  getAuthToken: GetAuthToken,
): Promise<DmMessage[]> {
  return requestDmApi<DmMessage[]>(
    `/community-dms/conversations/${encodeURIComponent(conversationId)}/messages${pageQuery(options)}`,
    { method: 'GET' },
    getAuthToken,
  );
}

export function sendDmMessage(
  conversationId: string,
  body: string,
  getAuthToken: GetAuthToken,
): Promise<DmMessage> {
  return requestDmApi<DmMessage>(
    `/community-dms/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: 'POST', body: JSON.stringify({ body }) },
    getAuthToken,
  );
}

export function markDmConversationRead(
  conversationId: string,
  getAuthToken: GetAuthToken,
): Promise<{ success: true }> {
  return requestDmApi<{ success: true }>(
    `/community-dms/conversations/${encodeURIComponent(conversationId)}/read`,
    { method: 'POST' },
    getAuthToken,
  );
}

export function hideDmConversation(
  conversationId: string,
  getAuthToken: GetAuthToken,
): Promise<{ success: true }> {
  return requestDmApi<{ success: true }>(
    `/community-dms/conversations/${encodeURIComponent(conversationId)}`,
    { method: 'DELETE' },
    getAuthToken,
  );
}

export function blockDmUser(
  userId: string,
  getAuthToken: GetAuthToken,
): Promise<{ success: true }> {
  return requestDmApi<{ success: true }>(
    '/community-dms/blocks',
    { method: 'POST', body: JSON.stringify({ userId }) },
    getAuthToken,
  );
}

export function unblockDmUser(
  userId: string,
  getAuthToken: GetAuthToken,
): Promise<{ success: true }> {
  return requestDmApi<{ success: true }>(
    `/community-dms/blocks/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
    getAuthToken,
  );
}

export function fetchDmBlocks(
  getAuthToken: GetAuthToken,
): Promise<DmProfile[]> {
  return requestDmApi<DmProfile[]>(
    '/community-dms/blocks?limit=50',
    { method: 'GET' },
    getAuthToken,
  );
}
