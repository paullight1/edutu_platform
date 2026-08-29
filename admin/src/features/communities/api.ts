import { backendFetchJson } from "../../lib/backend";
import type {
  AdminCommunityCatalogResponse,
  AdminCommunityCreationRequest,
  AdminCommunityGroup,
  AdminCommunityRequestsResponse,
  CommunityProposalInput,
} from "./model";

export type CommunityCatalogFilter = {
  query?: string;
  status?: "all" | "active" | "archived";
  visibility?: "all" | "public" | "private";
  scope?: "all" | "member" | "platform";
  trending?: boolean;
};

function queryString(values: Record<string, string | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function listCommunityGroups(
  filter: CommunityCatalogFilter = {},
): Promise<AdminCommunityCatalogResponse> {
  return backendFetchJson(
    `/admin/community/groups${queryString({ ...filter })}`,
  );
}

export function listCreationRequests(
  status: "all" | "pending" | "approved" | "rejected" | "cancelled" =
    "pending",
): Promise<AdminCommunityRequestsResponse> {
  return backendFetchJson(
    `/admin/community/creation-requests${queryString({ status })}`,
  );
}

export function approveCreationRequest(
  id: string,
): Promise<{ request: AdminCommunityCreationRequest; group: AdminCommunityGroup }> {
  return backendFetchJson(
    `/admin/community/creation-requests/${encodeURIComponent(id)}/approve`,
    { method: "POST" },
  );
}

export function rejectCreationRequest(
  id: string,
  reason: string,
): Promise<AdminCommunityCreationRequest> {
  return backendFetchJson(
    `/admin/community/creation-requests/${encodeURIComponent(id)}/reject`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export function createPlatformCommunity(
  input: CommunityProposalInput,
): Promise<AdminCommunityGroup> {
  return backendFetchJson("/admin/community/groups", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCommunity(
  id: string,
  input: Partial<CommunityProposalInput>,
): Promise<AdminCommunityGroup> {
  return backendFetchJson(`/admin/community/groups/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function archiveCommunity(id: string): Promise<AdminCommunityGroup> {
  return backendFetchJson(
    `/admin/community/groups/${encodeURIComponent(id)}/archive`,
    { method: "POST" },
  );
}

export function restoreCommunity(id: string): Promise<AdminCommunityGroup> {
  return backendFetchJson(
    `/admin/community/groups/${encodeURIComponent(id)}/restore`,
    { method: "POST" },
  );
}

export function listTrendingCommunities(): Promise<AdminCommunityGroup[]> {
  return backendFetchJson("/admin/community/trending");
}

export function replaceTrendingCommunities(
  groupIds: string[],
): Promise<AdminCommunityGroup[]> {
  return backendFetchJson("/admin/community/trending", {
    method: "PUT",
    body: JSON.stringify({ groupIds }),
  });
}
