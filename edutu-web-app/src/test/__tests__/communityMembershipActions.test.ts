import { describe, expect, it, vi } from "vitest";
import {
  buildCommunityDmHref,
  declineCommunityInvitation,
} from "../../features/community/membershipActions";
import type { CommunityMemberSummary } from "../../features/community/types";

describe("community membership actions", () => {
  it("declines an invitation by retiring the invitee's own live membership", async () => {
    const leaveGroup = vi.fn().mockResolvedValue({ success: true });
    const api = { leaveGroup } as never;

    await expect(
      declineCommunityInvitation(api, "group-1", "user_me"),
    ).resolves.toEqual({ success: true });

    expect(leaveGroup).toHaveBeenCalledWith("group-1", "user_me");
  });

  it("builds the existing protected DM request route for another group member", () => {
    const member: CommunityMemberSummary = {
      membership: {
        id: "member-1",
        groupId: "group-1",
        userId: "user_other",
        role: "member",
        status: "active",
        joinedAt: "2026-08-21T00:00:00.000Z",
      },
      profile: {
        displayName: "Amina Bello",
        avatarUrl: null,
      },
    };

    expect(buildCommunityDmHref(member, "user_me")).toBe(
      "/app/community/dm/new?userId=user_other&name=Amina%20Bello",
    );
  });

  it("does not offer a DM route to the signed-in member themself", () => {
    const member: CommunityMemberSummary = {
      membership: {
        id: "member-1",
        groupId: "group-1",
        userId: "user_me",
        role: "member",
        status: "active",
        joinedAt: "2026-08-21T00:00:00.000Z",
      },
      profile: {
        displayName: "Me",
        avatarUrl: null,
      },
    };

    expect(buildCommunityDmHref(member, "user_me")).toBeNull();
  });
});
