import { getApiBaseUrl } from "../../lib/apiBaseUrl";
import { getLocalDevAuthHeaders } from "../../lib/localDevAuthHeaders";
import type { PublicCommunityGroupSummary } from "./types";

async function requestPublicCommunity<T>(path: string): Promise<T> {
  const response = await fetch(`${getApiBaseUrl("Public community API")}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...getLocalDevAuthHeaders(),
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: unknown } | null;
    const message = typeof payload?.message === "string" ? payload.message : "That community is unavailable.";
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function fetchPublicGroups(limit = 12): Promise<PublicCommunityGroupSummary[]> {
  const resolved = Math.max(1, Math.min(Math.floor(limit || 12), 50));
  return requestPublicCommunity(`/public/communities/groups?limit=${resolved}`);
}

export function fetchPublicGroup(slug: string): Promise<PublicCommunityGroupSummary> {
  return requestPublicCommunity(`/public/communities/groups/${encodeURIComponent(slug)}`);
}
