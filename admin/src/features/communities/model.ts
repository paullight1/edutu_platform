export type CommunityVisibility = "public" | "private";
export type CommunityJoinPolicy = "open" | "request";
export type CommunityManagementScope = "member" | "platform";
export type CommunityCreationRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export interface AdminCommunityGroup {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  opportunityId: string | null;
  ownerId: string;
  visibility: CommunityVisibility;
  joinPolicy: CommunityJoinPolicy;
  coverEmoji: string;
  coverImageResourceUrl: string | null;
  accent: string | null;
  expiresAt: string | null;
  archivedAt: string | null;
  memberCount: number;
  messageCount: number;
  lastMessageAt: string | null;
  managementScope: CommunityManagementScope;
  trendingRank: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCommunityCreationRequest {
  id: string;
  requesterId: string;
  name: string;
  description: string | null;
  opportunityId: string | null;
  visibility: CommunityVisibility;
  joinPolicy: CommunityJoinPolicy;
  coverEmoji: string;
  coverImageResourceUrl: string | null;
  status: CommunityCreationRequestStatus;
  reviewReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  approvedGroupId: string | null;
  createdAt: string;
  updatedAt: string;
  slotsUsed?: number;
}

export interface CommunityManagementSummary {
  active: number;
  pending: number;
  trending: number;
  creatorsAtLimit: number;
}

export interface AdminCommunityCatalogResponse {
  groups: AdminCommunityGroup[];
  summary: CommunityManagementSummary;
  generatedAt: string;
}

export interface AdminCommunityRequestsResponse {
  requests: AdminCommunityCreationRequest[];
  status: CommunityCreationRequestStatus | "all";
  generatedAt: string;
}

export interface CommunityProposalInput {
  name: string;
  description?: string;
  visibility: CommunityVisibility;
  joinPolicy: CommunityJoinPolicy;
  coverEmoji: string;
}
