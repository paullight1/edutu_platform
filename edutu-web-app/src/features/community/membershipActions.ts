import type { CommunityApi } from "./api";
import type { CommunityMemberSummary } from "./types";

export function declineCommunityInvitation(
  api: Pick<CommunityApi, "leaveGroup">,
  groupId: string,
  userId: string,
): Promise<{ success: boolean }> {
  return api.leaveGroup(groupId, userId);
}

export function buildCommunityDmHref(
  member: CommunityMemberSummary,
  currentUserId: string | null | undefined,
): string | null {
  const targetUserId = member.membership.userId.trim();
  if (!targetUserId || !currentUserId || targetUserId === currentUserId) {
    return null;
  }

  return `/app/community/dm/new?userId=${encodeURIComponent(targetUserId)}&name=${encodeURIComponent(member.profile.displayName)}`;
}
