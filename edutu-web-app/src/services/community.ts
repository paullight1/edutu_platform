import { getApiBaseUrl } from "../lib/apiBaseUrl";
import type { ClerkTokenGetter } from "../lib/clerkToken";

const DEFAULT_TIMEOUT_MS = 12_000;

export class CommunityApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CommunityApiError";
    this.status = status;
  }
}

export function isCommunityApiError(error: unknown): error is CommunityApiError {
  return (
    error instanceof CommunityApiError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: string }).name === "CommunityApiError")
  );
}

export type GroupVisibility = "public" | "private";
export type GroupJoinPolicy = "open" | "request";
export type MembershipStatus =
  | "active"
  | "invited"
  | "pending"
  | "removed"
  | "banned";
export type MemberRole = "owner" | "mod" | "member";
export type CommunityAttachmentKind = "image" | "file";
export type CommunityImageMime = "image/jpeg" | "image/png" | "image/webp";

export const COMMUNITY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const COMMUNITY_PDF_MAX_BYTES = 10 * 1024 * 1024;
export const COMMUNITY_PDF_MIME_TYPE = "application/pdf" as const;

export interface CommunityGroup {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  opportunityId: string | null;
  ownerId: string;
  visibility: GroupVisibility;
  joinPolicy: GroupJoinPolicy;
  coverEmoji: string;
  coverImageResourceUrl?: string | null;
  accent: string | null;
  expiresAt: string | null;
  archivedAt: string | null;
  memberCount: number;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface CommunityGroupMember {
  id: string;
  groupId: string;
  userId: string;
  role: MemberRole;
  status: MembershipStatus;
  joinedAt: string;
}

export interface CommunityMemberSummary {
  membership: CommunityGroupMember;
  profile: {
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface CommunityMemberList {
  members: CommunityMemberSummary[];
  hasMore: boolean;
}

export interface MessageAuthor {
  displayName: string;
  avatarUrl: string | null;
}

export interface CommunityAttachment {
  url: string;
  name: string;
  mime: CommunityImageMime | typeof COMMUNITY_PDF_MIME_TYPE;
  size: number;
  caption?: string;
}

export interface CommunityMessage {
  id: string;
  groupId: string;
  userId: string;
  body: string;
  kind: string;
  opportunityId: string | null;
  callId?: string | null;
  createdAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
  author?: MessageAuthor;
}

export type GroupQuestion =
  | {
      id: string;
      type: "short_text" | "long_text";
      label: string;
      required: boolean;
      options?: undefined;
    }
  | {
      id: string;
      type: "single_select";
      label: string;
      required: boolean;
      options: string[];
    };

export interface GroupForm {
  questions: GroupQuestion[];
}

export interface JoinRequestAnswer {
  id: string;
  value: string;
}

export interface JoinRequest {
  id: string;
  groupId: string;
  userId: string;
  answers: JoinRequestAnswer[];
  status: "pending" | "approved" | "rejected";
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export type JoinRequestDecision = "approved" | "rejected";

export interface GroupWithMembership {
  group: CommunityGroup;
  membership: CommunityGroupMember | null;
}

export type GroupDetail = GroupWithMembership;

export interface JoinResult {
  status: "active" | "pending";
  groupId: string;
  membership: CommunityGroupMember;
  request: JoinRequest | null;
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  opportunityId?: string;
  visibility?: GroupVisibility;
  joinPolicy?: GroupJoinPolicy;
  coverEmoji?: string;
}

export type UpdateGroupInput = Omit<Partial<CreateGroupInput>, "opportunityId"> & {
  coverImageResourceUrl?: string | null;
};

export interface GroupListFilter {
  mine?: boolean;
  opportunityId?: string;
  query?: string;
  limit?: number;
}

export interface MessagePageOptions {
  before?: string | Date;
  beforeId?: string;
  limit?: number;
}

export interface CommunityGroupResource {
  id: string;
  groupId: string;
  kind: CommunityAttachmentKind;
  attachment: CommunityAttachment;
  sender: MessageAuthor & { userId: string };
  createdAt: string;
}

export interface CommunityResourceCursor {
  before: string;
  beforeId: string;
}

export interface CommunityResourcesPage {
  resources: CommunityGroupResource[];
  nextCursor: CommunityResourceCursor | null;
}

export type SendMessageInput =
  | { kind?: "text"; body: string; opportunityId?: string }
  | { kind: CommunityAttachmentKind; body: string; opportunityId?: string };

export interface CommunityAttachmentUploadInput {
  kind: CommunityAttachmentKind;
  name: string;
  mime: CommunityAttachment["mime"];
  size: number;
}

export interface CommunityAttachmentUploadReservation {
  uploadUrl: string;
  resourceUrl: string;
  storagePath: string;
}

export type CommunityGroupImageUploadInput = Omit<
  CommunityAttachmentUploadInput,
  "kind" | "mime"
> & {
  kind: "image";
  mime: CommunityImageMime;
};

export interface CommunityReport {
  id: string;
  targetType: "message" | "group";
  targetId: string;
  reporterId: string;
  reason: string;
  status: string;
  createdAt: string;
}

export interface ReportInput {
  targetType: "message" | "group";
  targetId: string;
  reason: string;
}

export interface BlockedUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  blockedAt: string | null;
  resolved: boolean;
}

type QueryValue = string | number | boolean | undefined | null;

function toQuery(params: Record<string, QueryValue>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

function extractMessage(body: unknown, status: number): string {
  const message = (body as { message?: unknown } | null)?.message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message)) {
    const first = message.find(
      (entry) => typeof entry === "string" && entry.trim().length > 0,
    );
    if (typeof first === "string") return first;
  }

  const nestedMessage =
    message && typeof message === "object"
      ? (message as { message?: unknown }).message
      : undefined;
  if (typeof nestedMessage === "string" && nestedMessage.trim()) {
    return nestedMessage;
  }

  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === "string" && error.trim() && status !== 400) {
    return error;
  }

  if (status === 429) {
    return "Too many requests. Please wait a moment and try again.";
  }

  return "That didn't work. Please try again.";
}

async function getTokenWithTimeout(
  getAuthToken: ClerkTokenGetter,
  timeoutMs: number,
): Promise<string | null> {
  let tokenTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getAuthToken(),
      new Promise<null>((resolve) => {
        tokenTimer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (tokenTimer) clearTimeout(tokenTimer);
  }
}

async function requestCommunityApi<T>(
  path: string,
  options: RequestInit,
  getAuthToken: ClerkTokenGetter,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const token = await getTokenWithTimeout(getAuthToken, timeoutMs);
  if (!token) {
    throw new CommunityApiError(
      "You need to be signed in to use Community.",
      401,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const hasBody = options.body !== undefined && options.body !== null;

  try {
    const response = await fetch(
      `${getApiBaseUrl("Community")}${path.startsWith("/") ? path : `/${path}`}`,
      {
        ...options,
        signal: options.signal ?? controller.signal,
        headers: {
          Accept: "application/json",
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new CommunityApiError(
        extractMessage(body, response.status),
        response.status,
      );
    }

    if (response.status === 204) return {} as T;
    return (await response.json().catch(() => ({}))) as T;
  } catch (error) {
    if (isCommunityApiError(error)) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new CommunityApiError(
        "The request timed out. Please try again.",
        408,
      );
    }
    throw new CommunityApiError(
      "We couldn't reach Edutu. Check your connection and try again.",
      0,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export async function fetchGroups(
  filter: GroupListFilter,
  getAuthToken: ClerkTokenGetter,
): Promise<GroupWithMembership[]> {
  const result = await requestCommunityApi<unknown[]>(
    `/communities/groups${toQuery({
      mine: filter.mine ? true : undefined,
      opportunityId: filter.opportunityId,
      query: filter.query,
      limit: filter.limit,
    })}`,
    { method: "GET" },
    getAuthToken,
  );

  if (!Array.isArray(result)) return [];
  return result.filter(
    (row): row is GroupWithMembership =>
      Boolean(
        row &&
          typeof row === "object" &&
          "group" in row &&
          (row as { group?: unknown }).group,
      ),
  );
}

export function fetchGroup(
  groupId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<GroupDetail> {
  return requestCommunityApi<GroupDetail>(
    `/communities/groups/${encodeURIComponent(groupId)}`,
    { method: "GET" },
    getAuthToken,
  );
}

export async function fetchGroupMembers(
  groupId: string,
  getAuthToken: ClerkTokenGetter,
  limit = 100,
): Promise<CommunityMemberList> {
  const result = await requestCommunityApi<CommunityMemberList>(
    `/communities/groups/${encodeURIComponent(groupId)}/members${toQuery({ limit })}`,
    { method: "GET" },
    getAuthToken,
  );
  return {
    members: Array.isArray(result?.members) ? result.members : [],
    hasMore: result?.hasMore === true,
  };
}

export function createGroup(
  input: CreateGroupInput,
  getAuthToken: ClerkTokenGetter,
): Promise<CommunityGroup> {
  return requestCommunityApi<CommunityGroup>(
    "/communities/groups",
    { method: "POST", body: JSON.stringify(compact({ ...input })) },
    getAuthToken,
  );
}

export function updateGroup(
  groupId: string,
  patch: UpdateGroupInput,
  getAuthToken: ClerkTokenGetter,
): Promise<CommunityGroup> {
  return requestCommunityApi<CommunityGroup>(
    `/communities/groups/${encodeURIComponent(groupId)}`,
    { method: "PATCH", body: JSON.stringify(compact({ ...patch })) },
    getAuthToken,
  );
}

export function archiveGroup(
  groupId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<CommunityGroup> {
  return requestCommunityApi<CommunityGroup>(
    `/communities/groups/${encodeURIComponent(groupId)}/archive`,
    { method: "POST" },
    getAuthToken,
  );
}

export function joinGroup(
  groupId: string,
  answers: JoinRequestAnswer[],
  getAuthToken: ClerkTokenGetter,
): Promise<JoinResult> {
  return requestCommunityApi<JoinResult>(
    `/communities/groups/${encodeURIComponent(groupId)}/join`,
    { method: "POST", body: JSON.stringify({ answers }) },
    getAuthToken,
  );
}

export function removeMember(
  groupId: string,
  userId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<{ success: boolean }> {
  return requestCommunityApi<{ success: boolean }>(
    `/communities/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
    getAuthToken,
  );
}

export function leaveGroup(
  groupId: string,
  userId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<{ success: boolean }> {
  return removeMember(groupId, userId, getAuthToken);
}

export function inviteToGroup(
  groupId: string,
  inviteeId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<CommunityGroupMember> {
  return requestCommunityApi<CommunityGroupMember>(
    `/communities/groups/${encodeURIComponent(groupId)}/invite`,
    { method: "POST", body: JSON.stringify({ userId: inviteeId }) },
    getAuthToken,
  );
}

export function setMemberRole(
  groupId: string,
  userId: string,
  role: MemberRole,
  getAuthToken: ClerkTokenGetter,
): Promise<CommunityGroupMember> {
  return requestCommunityApi<CommunityGroupMember>(
    `/communities/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/role`,
    { method: "PATCH", body: JSON.stringify({ role }) },
    getAuthToken,
  );
}

export async function fetchMessages(
  groupId: string,
  options: MessagePageOptions,
  getAuthToken: ClerkTokenGetter,
): Promise<CommunityMessage[]> {
  const before =
    options.before instanceof Date ? options.before.toISOString() : options.before;
  const result = await requestCommunityApi<CommunityMessage[]>(
    `/communities/groups/${encodeURIComponent(groupId)}/messages${toQuery({
      before,
      beforeId: options.beforeId,
      limit: options.limit,
    })}`,
    { method: "GET" },
    getAuthToken,
  );
  return Array.isArray(result) ? result : [];
}

export function sendMessage(
  groupId: string,
  input: SendMessageInput,
  getAuthToken: ClerkTokenGetter,
): Promise<CommunityMessage> {
  return requestCommunityApi<CommunityMessage>(
    `/communities/groups/${encodeURIComponent(groupId)}/messages`,
    { method: "POST", body: JSON.stringify(compact({ ...input })) },
    getAuthToken,
  );
}

export function deleteMessage(
  messageId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<CommunityMessage> {
  return requestCommunityApi<CommunityMessage>(
    `/communities/messages/${encodeURIComponent(messageId)}`,
    { method: "DELETE" },
    getAuthToken,
  );
}

export async function fetchGroupResources(
  groupId: string,
  options: MessagePageOptions,
  getAuthToken: ClerkTokenGetter,
): Promise<CommunityResourcesPage> {
  const before =
    options.before instanceof Date ? options.before.toISOString() : options.before;
  const result = await requestCommunityApi<CommunityResourcesPage>(
    `/communities/groups/${encodeURIComponent(groupId)}/resources${toQuery({
      before,
      beforeId: options.beforeId,
      limit: options.limit,
    })}`,
    { method: "GET" },
    getAuthToken,
  );

  return {
    resources: Array.isArray(result?.resources) ? result.resources : [],
    nextCursor:
      result?.nextCursor &&
      typeof result.nextCursor.before === "string" &&
      typeof result.nextCursor.beforeId === "string"
        ? result.nextCursor
        : null,
  };
}

export function createCommunityAttachmentUpload(
  groupId: string,
  input: CommunityAttachmentUploadInput,
  getAuthToken: ClerkTokenGetter,
): Promise<CommunityAttachmentUploadReservation> {
  return requestCommunityApi<CommunityAttachmentUploadReservation>(
    `/communities/groups/${encodeURIComponent(groupId)}/attachments/upload-url`,
    { method: "POST", body: JSON.stringify(input) },
    getAuthToken,
  );
}

export function createGroupCoverImageUpload(
  groupId: string,
  input: CommunityGroupImageUploadInput,
  getAuthToken: ClerkTokenGetter,
): Promise<CommunityAttachmentUploadReservation> {
  return requestCommunityApi<CommunityAttachmentUploadReservation>(
    `/communities/groups/${encodeURIComponent(groupId)}/cover-image/upload-url`,
    { method: "POST", body: JSON.stringify(input) },
    getAuthToken,
  );
}

export async function uploadCommunityAttachment(
  reservation: CommunityAttachmentUploadReservation,
  file: File,
): Promise<void> {
  const response = await fetch(reservation.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!response.ok) {
    throw new CommunityApiError(
      "The file could not be uploaded. Please try again.",
      response.status,
    );
  }
}

export function serializeCommunityAttachment(
  kind: CommunityAttachmentKind,
  attachment: CommunityAttachment,
): string {
  const isImage = kind === "image";
  const allowedImage = ["image/jpeg", "image/png", "image/webp"].includes(
    attachment.mime,
  );
  const validSize = isImage
    ? attachment.size > 0 && attachment.size <= COMMUNITY_IMAGE_MAX_BYTES
    : attachment.size > 0 && attachment.size <= COMMUNITY_PDF_MAX_BYTES;
  const validMime = isImage
    ? allowedImage
    : attachment.mime === COMMUNITY_PDF_MIME_TYPE;

  if (!attachment.url || !attachment.name || !validSize || !validMime) {
    throw new Error(
      "Choose a JPEG, PNG, or WebP image up to 5 MB, or a PDF up to 10 MB.",
    );
  }

  return JSON.stringify({
    url: attachment.url,
    name: attachment.name.slice(0, 120),
    mime: attachment.mime,
    size: attachment.size,
    ...(attachment.caption?.trim()
      ? { caption: attachment.caption.trim().slice(0, 500) }
      : {}),
  });
}

export async function resolveCommunityAttachmentUrl(
  resourceUrl: string,
  getAuthToken: ClerkTokenGetter,
): Promise<{ url: string; expiresIn: number }> {
  let api: URL;
  let resource: URL;
  try {
    api = new URL(getApiBaseUrl("Community"));
    resource = new URL(resourceUrl);
  } catch {
    throw new Error("That attachment link is invalid.");
  }

  const secureProtocol =
    resource.protocol === "https:" ||
    (import.meta.env.DEV && resource.protocol === "http:");
  if (
    !secureProtocol ||
    resource.origin !== api.origin ||
    !resource.pathname.startsWith("/communities/groups/") ||
    !resource.pathname.endsWith("/attachments/download-url")
  ) {
    throw new Error("That attachment link is invalid.");
  }

  return requestCommunityApi<{ url: string; expiresIn: number }>(
    `${resource.pathname}${resource.search}`,
    { method: "GET" },
    getAuthToken,
  );
}

export async function fetchGroupForm(
  groupId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<GroupForm> {
  const result = await requestCommunityApi<GroupForm>(
    `/communities/groups/${encodeURIComponent(groupId)}/form`,
    { method: "GET" },
    getAuthToken,
  );
  return { questions: Array.isArray(result?.questions) ? result.questions : [] };
}

export function saveGroupForm(
  groupId: string,
  questions: GroupQuestion[],
  getAuthToken: ClerkTokenGetter,
): Promise<GroupForm> {
  return requestCommunityApi<GroupForm>(
    `/communities/groups/${encodeURIComponent(groupId)}/form`,
    { method: "POST", body: JSON.stringify({ questions }) },
    getAuthToken,
  );
}

export async function fetchJoinRequests(
  groupId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<JoinRequest[]> {
  const result = await requestCommunityApi<JoinRequest[]>(
    `/communities/groups/${encodeURIComponent(groupId)}/requests`,
    { method: "GET" },
    getAuthToken,
  );
  return Array.isArray(result) ? result : [];
}

export function decideJoinRequest(
  groupId: string,
  requestId: string,
  decision: JoinRequestDecision,
  getAuthToken: ClerkTokenGetter,
): Promise<JoinRequest> {
  return requestCommunityApi<JoinRequest>(
    `/communities/groups/${encodeURIComponent(groupId)}/requests/${encodeURIComponent(requestId)}`,
    { method: "POST", body: JSON.stringify({ decision }) },
    getAuthToken,
  );
}

export function reportTarget(
  input: ReportInput,
  getAuthToken: ClerkTokenGetter,
): Promise<CommunityReport> {
  return requestCommunityApi<CommunityReport>(
    "/communities/reports",
    { method: "POST", body: JSON.stringify(input) },
    getAuthToken,
  );
}

export function blockUser(
  userId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<{ success: boolean; blockedUserId: string }> {
  return requestCommunityApi<{ success: boolean; blockedUserId: string }>(
    "/communities/blocks",
    { method: "POST", body: JSON.stringify({ userId }) },
    getAuthToken,
  );
}

export async function fetchBlockedUsers(
  getAuthToken: ClerkTokenGetter,
): Promise<BlockedUser[]> {
  const result = await requestCommunityApi<BlockedUser[]>(
    "/communities/blocks",
    { method: "GET" },
    getAuthToken,
  );
  return Array.isArray(result) ? result : [];
}

export function unblockUser(
  userId: string,
  getAuthToken: ClerkTokenGetter,
): Promise<{ success: boolean; blockedUserId: string; wasBlocked: boolean }> {
  return requestCommunityApi<{
    success: boolean;
    blockedUserId: string;
    wasBlocked: boolean;
  }>(
    `/communities/blocks/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
    getAuthToken,
  );
}
