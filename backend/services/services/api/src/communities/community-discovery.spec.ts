import type {
  CommunityGroup,
  GroupListFilter,
  GroupsStore,
} from "./groups.service";
import { GroupsService } from "./groups.service";

function group(
  id: string,
  name: string,
  trendingRank: number | null,
): CommunityGroup {
  return {
    id,
    slug: id,
    name,
    description: null,
    opportunityId: null,
    ownerId: `owner_${id}`,
    visibility: "public",
    joinPolicy: "open",
    coverEmoji: "💬",
    coverImageResourceUrl: null,
    accent: null,
    expiresAt: null,
    archivedAt: null,
    memberCount: 1,
    messageCount: 0,
    lastMessageAt: null,
    managementScope: "member",
    trendingRank,
    createdAt: new Date("2026-08-28T12:00:00.000Z"),
    updatedAt: new Date("2026-08-28T12:00:00.000Z"),
  };
}

describe("community discovery", () => {
  it("keeps every explicitly curated community in rank order", async () => {
    const rows = [
      group("g-regular", "Very active regular", null),
      group("g-two", "Second", 2),
      group("g-three", "Third", 3),
      group("g-one", "First", 1),
    ];
    const store: Partial<GroupsStore> = {
      listMembershipsForUser: async () => [],
      listGroups: async (filter: GroupListFilter) => {
        if (filter.trending) {
          return rows
            .filter((row) => row.trendingRank !== null)
            .sort((a, b) => a.trendingRank! - b.trendingRank!);
        }
        if (filter.excludeTrending) {
          return rows.filter((row) => row.trendingRank === null);
        }
        return rows;
      },
    };
    const service = new GroupsService(store as GroupsStore);

    const result = await service.discovery("user_viewer", 50);

    expect(result.trending.map(({ group: row }) => row.id)).toEqual([
      "g-one",
      "g-two",
      "g-three",
    ]);
    expect(result.communities.map(({ group: row }) => row.id)).toEqual([
      "g-regular",
    ]);
  });
});
