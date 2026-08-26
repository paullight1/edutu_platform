import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CommunityApi } from "./api";
import type {
  CommunityMemberList,
  CommunityMemberSummary,
} from "./types";
import { useCommunityMemberRoster } from "./useCommunityMemberRoster";

function member(id: string, joinedAt: string): CommunityMemberSummary {
  return {
    membership: {
      id,
      groupId: "group-1",
      userId: `user-${id}`,
      role: "member",
      status: "active",
      joinedAt,
    },
    profile: { displayName: `Member ${id}`, avatarUrl: null },
  };
}

describe("useCommunityMemberRoster", () => {
  it("loads every cursor page and preserves unique members", async () => {
    const first = member("member-1", "2026-08-20T10:00:00.000Z");
    const second = member("member-2", "2026-08-19T10:00:00.000Z");
    const pages: CommunityMemberList[] = [
      {
        members: [first],
        hasMore: true,
        nextCursor: {
          role: "member",
          joinedAt: first.membership.joinedAt,
          id: first.membership.id,
        },
      },
      { members: [first, second], hasMore: false, nextCursor: null },
    ];
    const getMembers = vi
      .fn()
      .mockResolvedValueOnce(pages[0])
      .mockResolvedValueOnce(pages[1]);
    const api = { getMembers } as unknown as CommunityApi;

    const { result } = renderHook(() =>
      useCommunityMemberRoster(api, "group-1", true, 25),
    );

    await waitFor(() => expect(result.current.members).toEqual([first]));
    await act(async () => result.current.loadMore());

    expect(getMembers).toHaveBeenNthCalledWith(1, "group-1", 25, null);
    expect(getMembers).toHaveBeenNthCalledWith(
      2,
      "group-1",
      25,
      pages[0].nextCursor,
    );
    expect(result.current.members).toEqual([first, second]);
    expect(result.current.hasMore).toBe(false);
  });
});
