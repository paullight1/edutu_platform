import type { AuthorDirectory } from "./messages.service";
import {
  GroupsService,
  type CommunityGroup,
  type CommunityGroupMember,
  type GroupsStore,
} from "./groups.service";

const GROUP_ID = "00000000-0000-4000-8000-000000000001";
const VIEWER_ID = "user_viewer";

const group: CommunityGroup = {
  id: GROUP_ID,
  slug: "scale-group",
  name: "Scale group",
  description: null,
  opportunityId: null,
  ownerId: "user_owner",
  visibility: "public",
  joinPolicy: "open",
  coverEmoji: "👥",
  coverImageResourceUrl: null,
  accent: null,
  expiresAt: null,
  archivedAt: null,
  memberCount: 4,
  messageCount: 0,
  lastMessageAt: null,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
};

const members: CommunityGroupMember[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    groupId: GROUP_ID,
    userId: "user_owner",
    role: "owner",
    status: "active",
    joinedAt: new Date("2026-08-01T00:00:00.000Z"),
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    groupId: GROUP_ID,
    userId: "user_mod",
    role: "mod",
    status: "active",
    joinedAt: new Date("2026-08-02T00:00:00.000Z"),
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    groupId: GROUP_ID,
    userId: "user_member_1",
    role: "member",
    status: "active",
    joinedAt: new Date("2026-08-03T00:00:00.000Z"),
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    groupId: GROUP_ID,
    userId: "user_member_2",
    role: "member",
    status: "active",
    joinedAt: new Date("2026-08-04T00:00:00.000Z"),
  },
];

const roleRank: Record<string, number> = { owner: 0, mod: 1, member: 2 };

function compareMembers(
  left: CommunityGroupMember,
  right: CommunityGroupMember,
) {
  return (
    (roleRank[left.role] ?? 3) - (roleRank[right.role] ?? 3) ||
    left.joinedAt.getTime() - right.joinedAt.getTime() ||
    left.id.localeCompare(right.id)
  );
}

describe("GroupsService member pagination", () => {
  it("returns a stable next cursor and advances to the next active-member page", async () => {
    const store = {
      findGroup: async () => group,
      findMembership: async () => null,
      listActiveGroupMembers: async (
        _groupId: string,
        limit: number,
        after?: { role: string; joinedAt: Date; id: string },
      ) => {
        const sorted = [...members].sort(compareMembers);
        const page = after
          ? sorted.filter(
              (row) =>
                compareMembers(row, {
                  ...row,
                  id: after.id,
                  role: after.role,
                  joinedAt: after.joinedAt,
                }) > 0,
            )
          : sorted;
        return page.slice(0, limit);
      },
    } as unknown as GroupsStore;

    const authors: AuthorDirectory = {
      findAuthors: async (userIds) =>
        userIds.map((userId) => ({
          userId,
          fullName: userId,
          avatarUrl: null,
        })),
    };
    const service = new GroupsService(store, authors);

    const first = await service.listMembers(VIEWER_ID, GROUP_ID, 2);
    expect(first.members.map((row) => row.membership.userId)).toEqual([
      "user_owner",
      "user_mod",
    ]);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toEqual({
      role: "mod",
      joinedAt: "2026-08-02T00:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000102",
    });

    const second = await service.listMembers(
      VIEWER_ID,
      GROUP_ID,
      2,
      first.nextCursor!,
    );

    expect(second.members.map((row) => row.membership.userId)).toEqual([
      "user_member_1",
      "user_member_2",
    ]);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
  });
});
