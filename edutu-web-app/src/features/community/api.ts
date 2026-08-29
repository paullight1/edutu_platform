import type { ClerkTokenGetter } from "../../lib/clerkToken";
import { getApiBaseUrl } from "../../lib/apiBaseUrl";
import { getLocalDevAuthHeaders } from "../../lib/localDevAuthHeaders";
import type {
  BlockedUser,
  CommunityAttachmentUploadInput,
  CommunityAttachmentUploadReservation,
  CommunityCreationRequestResponse,
  CommunityDiscoveryResponse,
  CommunityGroup,
  CommunityGroupImageUploadInput,
  CommunityGroupMember,
  CommunityMemberCursor,
  CommunityMemberList,
  CommunityMessage,
  CommunityProfileContentPage,
  CommunityResourceCursor,
  CommunityPostThread,
  CommunityReactionState,
  CommunityResourcesPage,
  CreateGroupInput,
  GroupDetail,
  GroupForm,
  GroupListFilter,
  JoinRequest,
  JoinRequestAnswer,
  JoinRequestDecision,
  JoinResult,
  MemberRole,
  MessagePageOptions,
  MyCommunityCreationRequestsResponse,
  SendMessageInput,
  SendCommentInput,
  UpdateGroupInput,
} from "./types";

const REQUEST_TIMEOUT_MS = 12_000;

export class CommunityApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "CommunityApiError";
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

export async function uploadCommunityAttachment(
  uploadUrl: string,
  file: File,
): Promise<void> {
  let destination: URL;
  try {
    destination = new URL(uploadUrl);
  } catch {
    throw new CommunityApiError("The secure upload link is invalid.", 400);
  }
  if (destination.protocol !== "https:") {
    throw new CommunityApiError("The secure upload link must use HTTPS.", 400);
  }

  let response: Response;
  try {
    response = await fetch(destination.toString(), {
      method: "PUT",
      body: file,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false",
      },
    });
  } catch {
    throw new CommunityApiError(
      "Uploading the attachment failed. Check your connection and try again.",
      0,
    );
  }

  if (!response.ok) {
    throw new CommunityApiError(
      "Uploading the attachment failed. Please try again.",
      response.status,
    );
  }
}

type QueryValue = string | number | boolean | undefined | null;

function queryString(values: Record<string, QueryValue>): string {
  const entries = Object.entries(values).filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  if (entries.length === 0) return "";
  return `?${entries
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&")}`;
}

function pageQuery(options: MessagePageOptions = {}): string {
  return queryString({
    before:
      options.before instanceof Date
        ? options.before.toISOString()
        : options.before,
    beforeId: options.beforeId,
    limit: options.limit,
  });
}

function extractMessage(payload: unknown, status: number): string {
  const row =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  const message = row?.message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message)) {
    const first = message.find(
      (entry) => typeof entry === "string" && entry.trim(),
    );
    if (typeof first === "string") return first;
  }
  if (message && typeof message === "object") {
    const nested = (message as Record<string, unknown>).message;
    if (typeof nested === "string" && nested.trim()) return nested;
  }
  if (typeof row?.error === "string" && row.error.trim()) return row.error;
  if (status === 429) return "Too many requests. Please wait and try again.";
  return "That didn't work. Please try again.";
}

export class CommunityApi {
  constructor(private readonly getToken: ClerkTokenGetter) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await Promise.race([
      this.getToken(),
      new Promise<null>((resolve) =>
        window.setTimeout(() => resolve(null), REQUEST_TIMEOUT_MS),
      ),
    ]).catch(() => null);
    if (!token) {
      throw new CommunityApiError(
        "You need to be signed in to use community.",
        401,
      );
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );
    const hasBody = options.body !== undefined && options.body !== null;
    try {
      const response = await fetch(
        `${getApiBaseUrl("Community API")}${path}`,
        {
          ...options,
          signal: options.signal ?? controller.signal,
          headers: {
            Accept: "application/json",
            ...(hasBody ? { "Content-Type": "application/json" } : {}),
            ...getLocalDevAuthHeaders(),
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const text = await response.text();
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text) as unknown;
        } catch {
          payload = null;
        }
      }
      if (!response.ok) {
        throw new CommunityApiError(
          extractMessage(payload, response.status),
          response.status,
        );
      }
      return (payload ?? {}) as T;
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
      window.clearTimeout(timeout);
    }
  }

  listGroups(filter: GroupListFilter = {}): Promise<GroupDetail[]> {
    return this.request(`/communities/groups${queryString({ ...filter })}`);
  }

  getDiscovery(limit = 50): Promise<CommunityDiscoveryResponse> {
    return this.request(
      `/communities/discovery${queryString({ limit })}`,
    );
  }

  submitCreationRequest(
    input: CreateGroupInput,
  ): Promise<CommunityCreationRequestResponse> {
    return this.request("/communities/creation-requests", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listMyCreationRequests(): Promise<MyCommunityCreationRequestsResponse> {
    return this.request("/communities/creation-requests/mine");
  }

  cancelCreationRequest(
    requestId: string,
  ): Promise<CommunityCreationRequestResponse> {
    return this.request(
      `/communities/creation-requests/${encodeURIComponent(requestId)}/cancel`,
      { method: "POST" },
    );
  }

  getGroup(groupId: string): Promise<GroupDetail> {
    return this.request(`/communities/groups/${encodeURIComponent(groupId)}`);
  }

  getMembers(
    groupId: string,
    limit = 100,
    cursor: CommunityMemberCursor | null = null,
  ): Promise<CommunityMemberList> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/members${queryString({
        limit,
        afterRole: cursor?.role,
        afterJoinedAt: cursor?.joinedAt,
        afterId: cursor?.id,
      })}`,
    );
  }

  createGroup(input: CreateGroupInput): Promise<CommunityGroup> {
    return this.request("/communities/groups", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateGroup(
    groupId: string,
    input: UpdateGroupInput,
  ): Promise<CommunityGroup> {
    return this.request(`/communities/groups/${encodeURIComponent(groupId)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  archiveGroup(groupId: string): Promise<CommunityGroup> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/archive`,
      { method: "POST" },
    );
  }

  joinGroup(
    groupId: string,
    answers: JoinRequestAnswer[] = [],
  ): Promise<JoinResult> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/join`,
      {
        method: "POST",
        body: JSON.stringify({ answers }),
      },
    );
  }

  leaveGroup(groupId: string, userId: string): Promise<{ success: boolean }> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
  }

  invite(groupId: string, userId: string): Promise<CommunityGroupMember> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/invite`,
      {
        method: "POST",
        body: JSON.stringify({ userId }),
      },
    );
  }

  setMemberRole(
    groupId: string,
    userId: string,
    role: MemberRole,
  ): Promise<CommunityGroupMember> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/role`,
      { method: "PATCH", body: JSON.stringify({ role }) },
    );
  }

  removeMember(groupId: string, userId: string): Promise<{ success: boolean }> {
    return this.leaveGroup(groupId, userId);
  }

  getForm(groupId: string): Promise<GroupForm> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/form`,
    );
  }

  setForm(groupId: string, form: GroupForm): Promise<GroupForm> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/form`,
      {
        method: "POST",
        body: JSON.stringify(form),
      },
    );
  }

  listJoinRequests(
    groupId: string,
    status: "pending" | "all" = "pending",
  ): Promise<JoinRequest[]> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/requests${queryString({ status })}`,
    );
  }

  decideJoinRequest(
    groupId: string,
    requestId: string,
    decision: JoinRequestDecision,
  ): Promise<CommunityGroupMember> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/requests/${encodeURIComponent(requestId)}`,
      { method: "POST", body: JSON.stringify({ decision }) },
    );
  }

  fetchMessages(
    groupId: string,
    options: MessagePageOptions = {},
  ): Promise<CommunityMessage[]> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/messages${pageQuery(options)}`,
    );
  }

  fetchPinnedPost(groupId: string): Promise<CommunityMessage | null> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/pinned-post`,
    );
  }

  fetchPostThread(
    groupId: string,
    postId: string,
  ): Promise<CommunityPostThread> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}`,
    );
  }

  sendComment(
    groupId: string,
    postId: string,
    input: SendCommentInput,
  ): Promise<CommunityMessage> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}/comments`,
      { method: "POST", body: JSON.stringify(input) },
    );
  }

  likeMessage(messageId: string): Promise<CommunityReactionState> {
    return this.request(
      `/communities/messages/${encodeURIComponent(messageId)}/like`,
      { method: "PUT" },
    );
  }

  unlikeMessage(messageId: string): Promise<CommunityReactionState> {
    return this.request(
      `/communities/messages/${encodeURIComponent(messageId)}/like`,
      { method: "DELETE" },
    );
  }

  pinMessage(
    messageId: string,
    pinned: boolean,
  ): Promise<CommunityMessage> {
    return this.request(
      `/communities/messages/${encodeURIComponent(messageId)}/pin`,
      { method: "PATCH", body: JSON.stringify({ pinned }) },
    );
  }

  fetchResources(
    groupId: string,
    options: MessagePageOptions = {},
  ): Promise<CommunityResourcesPage> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/resources${pageQuery(options)}`,
    );
  }

  sendMessage(
    groupId: string,
    input: SendMessageInput,
  ): Promise<CommunityMessage> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/messages`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  createAttachmentUpload(
    groupId: string,
    input: CommunityAttachmentUploadInput,
  ): Promise<CommunityAttachmentUploadReservation> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/attachments/upload-url`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  createGroupCoverImageUpload(
    groupId: string,
    input: CommunityGroupImageUploadInput,
  ): Promise<CommunityAttachmentUploadReservation> {
    return this.request(
      `/communities/groups/${encodeURIComponent(groupId)}/cover-image/upload-url`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  deleteMessage(messageId: string): Promise<{ success?: boolean }> {
    return this.request(`/communities/messages/${encodeURIComponent(messageId)}`, {
      method: "DELETE",
    });
  }

  reportTarget(
    targetType: "message" | "group",
    targetId: string,
    reason: string,
  ): Promise<unknown> {
    return this.request("/communities/reports", {
      method: "POST",
      body: JSON.stringify({ targetType, targetId, reason }),
    });
  }

  listBlocks(): Promise<BlockedUser[]> {
    return this.request("/communities/blocks");
  }

  blockUser(userId: string): Promise<unknown> {
    return this.request("/communities/blocks", {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  }

  unblockUser(userId: string): Promise<unknown> {
    return this.request(`/communities/blocks/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
  }

  fetchOwnContent(
    cursor?: CommunityResourceCursor | null,
    limit = 30,
  ): Promise<CommunityProfileContentPage> {
    return this.request(
      `/communities/profile/content${queryString({ before: cursor?.before, beforeId: cursor?.beforeId, limit })}`,
    );
  }

  resolveAttachmentUrl(
    resourceUrl: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const base = new URL(getApiBaseUrl("Community API"));
    const resource = new URL(resourceUrl);
    if (
      resource.protocol !== "https:" ||
      resource.origin !== base.origin ||
      !resource.pathname.startsWith("/communities/groups/") ||
      !resource.pathname.endsWith("/attachments/download-url")
    ) {
      return Promise.reject(
        new CommunityApiError("That attachment link is invalid.", 400),
      );
    }
    return this.request(`${resource.pathname}${resource.search}`);
  }
}
