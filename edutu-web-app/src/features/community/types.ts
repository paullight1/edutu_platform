export type GroupVisibility = "public" | "private";
export type GroupJoinPolicy = "open" | "request";
export type MembershipStatus =
  | "active"
  | "invited"
  | "pending"
  | "removed"
  | "banned";
export type MemberRole = "owner" | "mod" | "member";

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

export interface GroupWithMembership {
  group: CommunityGroup;
  membership: CommunityGroupMember | null;
}
export type GroupDetail = GroupWithMembership;

export interface MessageAuthor {
  displayName: string;
  avatarUrl: string | null;
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

export interface CommunityMemberSummary {
  membership: CommunityGroupMember;
  profile: MessageAuthor;
}

export interface CommunityMemberList {
  members: CommunityMemberSummary[];
  hasMore: boolean;
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

export type CommunityAttachmentKind = "image" | "file";
export type CommunityImageMime = "image/jpeg" | "image/png" | "image/webp";
export type CommunityAttachmentMime = CommunityImageMime | "application/pdf";

export interface CommunityAttachment {
  url: string;
  name: string;
  mime: CommunityAttachmentMime;
  size: number;
  caption?: string;
}

export interface CommunityAttachmentUploadInput {
  kind: CommunityAttachmentKind;
  name: string;
  mime: CommunityAttachmentMime;
  size: number;
}

export interface CommunityAttachmentUploadReservation {
  uploadUrl: string;
  resourceUrl: string;
  storagePath: string;
}

export interface CommunityGroupImageUploadInput {
  kind: "image";
  name: string;
  mime: CommunityImageMime;
  size: number;
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

export interface CommunityProfileContentItem {
  id: string;
  title: string;
  category: string;
  resources: Array<{
    id: string;
    title: string;
    type: string | null;
    provider: string | null;
    url: string | null;
  }>;
  likes: number;
  createdAt: string;
}

export interface CommunityProfileContentPage {
  items: CommunityProfileContentItem[];
  nextCursor: CommunityResourceCursor | null;
}

export interface SendMessageInput {
  body: string;
  kind?: "text" | CommunityAttachmentKind | "call";
  opportunityId?: string;
  callId?: string;
}

export interface BlockedUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  blockedAt?: string;
}

export interface PublicCommunityGroupSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  coverEmoji: string;
  memberCount: number;
  messageCount: number;
  opportunityId: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export const COMMUNITY_MESSAGE_MAX_LENGTH = 2000;
export const COMMUNITY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const COMMUNITY_PDF_MAX_BYTES = 10 * 1024 * 1024;
export const COMMUNITY_IMAGE_MIME_TYPES: readonly CommunityImageMime[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export function parseCommunityAttachment(
  kind: string,
  body: string,
): CommunityAttachment | null {
  if (kind !== "image" && kind !== "file") return null;
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!Object.keys(row).every((key) => ["url", "name", "mime", "size", "caption"].includes(key))) {
    return null;
  }
  const url = typeof row.url === "string" ? row.url.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const mime = typeof row.mime === "string" ? row.mime.toLowerCase() : "";
  const size = row.size;
  const caption = typeof row.caption === "string" ? row.caption.trim() : undefined;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }
  if (
    parsedUrl.protocol !== "https:" ||
    url.length > 2048 ||
    !name ||
    name.length > 120 ||
    name === "." ||
    name === ".." ||
    /[\\/\u0000-\u001f\u007f]/.test(name) ||
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    (caption !== undefined && caption.length > 500)
  ) {
    return null;
  }
  if (
    kind === "image" &&
    (!COMMUNITY_IMAGE_MIME_TYPES.includes(mime as CommunityImageMime) ||
      size > COMMUNITY_IMAGE_MAX_BYTES ||
      !/\.(?:jpe?g|png|webp)$/i.test(name))
  ) {
    return null;
  }
  if (
    kind === "file" &&
    (mime !== "application/pdf" || size > COMMUNITY_PDF_MAX_BYTES || !/\.pdf$/i.test(name))
  ) {
    return null;
  }
  return {
    url,
    name,
    mime: mime as CommunityAttachmentMime,
    size,
    ...(caption ? { caption } : {}),
  };
}

export function serializeCommunityAttachment(
  kind: CommunityAttachmentKind,
  attachment: CommunityAttachment,
): string {
  const parsed = parseCommunityAttachment(kind, JSON.stringify(attachment));
  if (!parsed) {
    throw new Error(
      "Choose a JPEG, PNG, or WebP image up to 5 MB, or a PDF up to 10 MB.",
    );
  }
  return JSON.stringify(parsed);
}
