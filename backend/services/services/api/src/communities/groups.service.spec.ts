import { randomUUID } from "node:crypto";
import type {
  CommunityGroup,
  CommunityGroupMember,
  CommunityJoinRequest,
  GroupsStore,
  NewGroupRow,
  NewMemberRow,
} from "./groups.service";
import { GroupsService, MAX_GROUPS_PER_USER } from "./groups.service";

/**
 * An in-memory stand-in for the Drizzle-backed store: plain arrays plus the
 * handful of reads the service actually performs. Mocking Drizzle's builder
 * chain method-by-method would let a broken query pass, so the double sits at
 * the store boundary instead — the same boundary the real adapter implements.
 */
class FakeGroupsStore implements GroupsStore {
  groups: CommunityGroup[] = [];
  members: CommunityGroupMember[] = [];
  requests: CommunityJoinRequest[] = [];
  opportunityDeadlines = new Map<string, Date | null>();
  /** Slugs that should collide once, to exercise the retry path. */
  collidingSlugs = new Set<string>();

  async countActiveOwnedGroups(ownerId: string): Promise<number> {
    return this.groups.filter(
      (group) => group.ownerId === ownerId && group.archivedAt === null,
    ).length;
  }

  async createGroupWithOwner(
    group: NewGroupRow,
    member: NewMemberRow,
  ): Promise<CommunityGroup> {
    if (this.collidingSlugs.has(group.slug)) {
      // Mirrors what Postgres raises for community_groups_slug_key.
      this.collidingSlugs.delete(group.slug);
      const error = new Error("duplicate key value violates unique constraint");
      (error as Error & { code?: string }).code = "23505";
      throw error;
    }
    const row: CommunityGroup = {
      id: randomUUID(),
      slug: group.slug,
      name: group.name,
      description: group.description ?? null,
      opportunityId: group.opportunityId ?? null,
      ownerId: group.ownerId,
      visibility: group.visibility,
      joinPolicy: group.joinPolicy,
      coverEmoji: group.coverEmoji,
      accent: null,
      expiresAt: group.expiresAt ?? null,
      archivedAt: null,
      memberCount: 1,
      messageCount: 0,
      lastMessageAt: null,
      createdAt: new Date(),
    };
    this.groups.push(row);
    this.members.push({
      id: randomUUID(),
      groupId: row.id,
      userId: member.userId,
      role: member.role,
      status: member.status,
      joinedAt: new Date(),
    });
    return row;
  }

  async findGroup(groupId: string): Promise<CommunityGroup | null> {
    return this.groups.find((group) => group.id === groupId) ?? null;
  }

  async updateGroup(
    groupId: string,
    patch: Partial<CommunityGroup>,
  ): Promise<CommunityGroup | null> {
    const group = this.groups.find((item) => item.id === groupId);
    if (!group) return null;
    Object.assign(group, patch);
    return group;
  }

  async listGroups(): Promise<CommunityGroup[]> {
    return this.groups.filter((group) => group.archivedAt === null);
  }

  async listMembershipsForUser(
    userId: string,
  ): Promise<CommunityGroupMember[]> {
    return this.members.filter((member) => member.userId === userId);
  }

  async findMembership(
    groupId: string,
    userId: string,
  ): Promise<CommunityGroupMember | null> {
    return (
      this.members.find(
        (member) => member.groupId === groupId && member.userId === userId,
      ) ?? null
    );
  }

  async upsertMembership(
    member: NewMemberRow & { groupId: string },
  ): Promise<CommunityGroupMember> {
    const existing = this.members.find(
      (row) => row.groupId === member.groupId && row.userId === member.userId,
    );
    if (existing) {
      existing.role = member.role;
      existing.status = member.status;
      return existing;
    }
    const row: CommunityGroupMember = {
      id: randomUUID(),
      groupId: member.groupId,
      userId: member.userId,
      role: member.role,
      status: member.status,
      joinedAt: new Date(),
    };
    this.members.push(row);
    return row;
  }

  async countActiveOwners(groupId: string): Promise<number> {
    return this.members.filter(
      (member) =>
        member.groupId === groupId &&
        member.role === "owner" &&
        member.status === "active",
    ).length;
  }

  async adjustMemberCount(groupId: string, delta: number): Promise<void> {
    const group = this.groups.find((item) => item.id === groupId);
    if (group) group.memberCount = Math.max(0, group.memberCount + delta);
  }

  async upsertJoinRequest(
    groupId: string,
    userId: string,
    answers: unknown[],
  ): Promise<CommunityJoinRequest> {
    const existing = this.requests.find(
      (row) => row.groupId === groupId && row.userId === userId,
    );
    if (existing) {
      existing.answers = answers;
      existing.status = "pending";
      existing.decidedBy = null;
      existing.decidedAt = null;
      return existing;
    }
    const row: CommunityJoinRequest = {
      id: randomUUID(),
      groupId,
      userId,
      answers,
      status: "pending",
      decidedBy: null,
      decidedAt: null,
      createdAt: new Date(),
    };
    this.requests.push(row);
    return row;
  }

  async findOpportunityDeadline(opportunityId: string): Promise<Date | null> {
    return this.opportunityDeadlines.get(opportunityId) ?? null;
  }
}

const GROUP_ID = "00000000-0000-4000-8000-000000000001";

function seedGroup(
  store: FakeGroupsStore,
  overrides: Partial<CommunityGroup> = {},
): CommunityGroup {
  const group: CommunityGroup = {
    id: GROUP_ID,
    slug: "chevening-2027-abc123",
    name: "Chevening 2027",
    description: null,
    opportunityId: null,
    ownerId: "user_owner",
    visibility: "public",
    joinPolicy: "open",
    coverEmoji: "🎓",
    accent: null,
    expiresAt: null,
    archivedAt: null,
    memberCount: 1,
    messageCount: 0,
    lastMessageAt: null,
    createdAt: new Date(),
    ...overrides,
  };
  store.groups.push(group);
  store.members.push({
    id: randomUUID(),
    groupId: group.id,
    userId: group.ownerId,
    role: "owner",
    status: "active",
    joinedAt: new Date(),
  });
  return group;
}

/**
 * `ownedActive` / `ownedArchived` seed groups owned by `user_abc`; `group`
 * seeds one addressable group (id `g1` in the brief's shorthand, a real uuid
 * here) with its owner already an active owner-member.
 */
function fakeDb(
  config: {
    ownedActive?: number;
    ownedArchived?: number;
    group?: Partial<CommunityGroup>;
  } = {},
): FakeGroupsStore {
  const store = new FakeGroupsStore();
  for (let i = 0; i < (config.ownedActive ?? 0); i += 1) {
    seedGroup(store, {
      id: randomUUID(),
      slug: `owned-active-${i}`,
      name: `Owned active ${i}`,
      ownerId: "user_abc",
    });
  }
  for (let i = 0; i < (config.ownedArchived ?? 0); i += 1) {
    seedGroup(store, {
      id: randomUUID(),
      slug: `owned-archived-${i}`,
      name: `Owned archived ${i}`,
      ownerId: "user_abc",
      archivedAt: new Date(),
    });
  }
  if (config.group) seedGroup(store, config.group);
  return store;
}

describe("GroupsService", () => {
  describe("create", () => {
    it("refuses a third active group for the same owner", async () => {
      const service = new GroupsService(fakeDb({ ownedActive: 2 }));
      await expect(
        service.create("user_abc", {
          name: "Third group",
          visibility: "public",
          joinPolicy: "open",
          coverEmoji: "💬",
        }),
      ).rejects.toThrow(/2 active groups/i);
    });

    it("does not count archived groups against the limit", async () => {
      const service = new GroupsService(
        fakeDb({ ownedActive: 1, ownedArchived: 5 }),
      );
      await expect(
        service.create("user_abc", {
          name: "Second group",
          visibility: "public",
          joinPolicy: "open",
          coverEmoji: "💬",
        }),
      ).resolves.toMatchObject({ name: "Second group" });
    });

    it("makes the creator an active owner in one transaction", async () => {
      const db = fakeDb({ ownedActive: 0 });
      const service = new GroupsService(db);
      const group = await service.create("user_abc", {
        name: "Chevening 2027",
        visibility: "public",
        joinPolicy: "open",
        coverEmoji: "🎓",
      });
      expect(db.groups).toContainEqual(
        expect.objectContaining({ id: group.id, ownerId: "user_abc" }),
      );
      expect(db.members).toContainEqual(
        expect.objectContaining({
          groupId: group.id,
          userId: "user_abc",
          role: "owner",
          status: "active",
        }),
      );
    });

    it("stores the raw Clerk subject as the owner, not a derived uuid", async () => {
      const db = fakeDb();
      const service = new GroupsService(db);
      const group = await service.create("user_2abcDEF", {
        name: "Raw subject group",
        visibility: "public",
        joinPolicy: "open",
        coverEmoji: "💬",
      });
      expect(group.ownerId).toBe("user_2abcDEF");
    });

    it("retries once with a fresh slug when the first one collides", async () => {
      const db = fakeDb();
      const service = new GroupsService(db);
      // Pre-arm the collision on whatever slug stem this name produces.
      const original = db.createGroupWithOwner.bind(db);
      let calls = 0;
      db.createGroupWithOwner = async (group, member) => {
        calls += 1;
        if (calls === 1) db.collidingSlugs.add(group.slug);
        return original(group, member);
      };
      const group = await service.create("user_abc", {
        name: "Chevening 2027",
        visibility: "public",
        joinPolicy: "open",
        coverEmoji: "🎓",
      });
      expect(calls).toBe(2);
      expect(group.slug).toMatch(/^chevening-2027-[a-z0-9]{6}$/);
    });

    it("copies the linked opportunity's deadline onto expiresAt", async () => {
      const db = fakeDb();
      const deadline = new Date("2027-11-05T00:00:00.000Z");
      const opportunityId = "00000000-0000-4000-8000-0000000000ff";
      db.opportunityDeadlines.set(opportunityId, deadline);
      const service = new GroupsService(db);
      const group = await service.create("user_abc", {
        name: "Deadline group",
        opportunityId,
        visibility: "public",
        joinPolicy: "open",
        coverEmoji: "💬",
      });
      expect(group.expiresAt).toEqual(deadline);
    });

    it("caps creation at MAX_GROUPS_PER_USER, which is a flat 2", () => {
      expect(MAX_GROUPS_PER_USER).toBe(2);
    });
  });

  describe("join", () => {
    it("puts a joiner in pending when the policy is request", async () => {
      const service = new GroupsService(
        fakeDb({ group: { id: GROUP_ID, joinPolicy: "request" } }),
      );
      const result = await service.join("user_xyz", GROUP_ID, []);
      expect(result.status).toBe("pending");
    });

    it("admits a joiner immediately when the policy is open", async () => {
      const service = new GroupsService(
        fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } }),
      );
      const result = await service.join("user_xyz", GROUP_ID, []);
      expect(result.status).toBe("active");
    });

    it("lets a previously rejected user request again", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "request" } });
      const service = new GroupsService(db);
      await service.join("user_xyz", GROUP_ID, []);
      // The owner rejects them: one row per (group, user), decided.
      const request = db.requests[0];
      request.status = "rejected";
      request.decidedBy = "user_owner";
      request.decidedAt = new Date();

      const result = await service.join("user_xyz", GROUP_ID, [
        { id: "why", value: "I reapplied with a better answer" },
      ]);

      expect(result.status).toBe("pending");
      expect(db.requests).toHaveLength(1);
      expect(db.requests[0]).toMatchObject({
        status: "pending",
        decidedBy: null,
        decidedAt: null,
      });
    });

    it("refuses a banned user", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      db.members.push({
        id: randomUUID(),
        groupId: GROUP_ID,
        userId: "user_banned",
        role: "member",
        status: "banned",
        joinedAt: new Date(),
      });
      const service = new GroupsService(db);
      await expect(service.join("user_banned", GROUP_ID, [])).rejects.toThrow(
        /can't join this group/i,
      );
    });

    it("refuses to join an archived group", async () => {
      const service = new GroupsService(
        fakeDb({ group: { id: GROUP_ID, archivedAt: new Date() } }),
      );
      await expect(service.join("user_xyz", GROUP_ID, [])).rejects.toThrow(
        /archived/i,
      );
    });
  });

  describe("leave", () => {
    it("refuses to let the only owner leave", async () => {
      const service = new GroupsService(fakeDb({ group: { id: GROUP_ID } }));
      await expect(service.leave("user_owner", GROUP_ID)).rejects.toThrow(
        /only owner/i,
      );
    });

    it("removes an ordinary member and decrements the count", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await service.join("user_xyz", GROUP_ID, []);
      const before = db.groups[0].memberCount;
      await service.leave("user_xyz", GROUP_ID);
      expect(await service.activeMembership("user_xyz", GROUP_ID)).toBeNull();
      expect(db.groups[0].memberCount).toBe(before - 1);
    });
  });

  describe("removeMember", () => {
    it("refuses to let a non-owner remove a member", async () => {
      const service = new GroupsService(
        fakeDb({ group: { id: GROUP_ID, ownerId: "user_owner" } }),
      );
      await expect(
        service.removeMember("user_other", GROUP_ID, "user_victim"),
      ).rejects.toThrow(/not allowed/i);
    });

    it("refuses to let the only owner remove themselves", async () => {
      const service = new GroupsService(
        fakeDb({ group: { id: GROUP_ID, ownerId: "user_owner" } }),
      );
      await expect(
        service.removeMember("user_owner", GROUP_ID, "user_owner"),
      ).rejects.toThrow(/only owner/i);
    });

    it("lets an owner remove an ordinary member", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await service.join("user_xyz", GROUP_ID, []);
      await service.removeMember("user_owner", GROUP_ID, "user_xyz");
      expect(await service.activeMembership("user_xyz", GROUP_ID)).toBeNull();
    });
  });

  describe("get and update", () => {
    it("hides a private group from a non-member", async () => {
      const service = new GroupsService(
        fakeDb({ group: { id: GROUP_ID, visibility: "private" } }),
      );
      await expect(service.get("user_stranger", GROUP_ID)).rejects.toThrow(
        /private/i,
      );
    });

    it("refuses an update from someone who is not an owner or mod", async () => {
      const service = new GroupsService(fakeDb({ group: { id: GROUP_ID } }));
      await expect(
        service.update("user_other", GROUP_ID, { name: "Hijacked" }),
      ).rejects.toThrow(/not allowed/i);
    });

    it("lets the owner rename the group", async () => {
      const service = new GroupsService(fakeDb({ group: { id: GROUP_ID } }));
      const updated = await service.update("user_owner", GROUP_ID, {
        name: "Chevening 2028",
      });
      expect(updated.name).toBe("Chevening 2028");
    });

    it("reports a missing group in plain words", async () => {
      const service = new GroupsService(fakeDb());
      await expect(
        service.get("user_abc", "00000000-0000-4000-8000-00000000dead"),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("list", () => {
    it("returns public groups plus the caller's own private ones", async () => {
      const db = fakeDb();
      seedGroup(db, {
        id: randomUUID(),
        slug: "public-one",
        name: "Public one",
        ownerId: "user_owner",
      });
      seedGroup(db, {
        id: randomUUID(),
        slug: "secret",
        name: "Secret",
        ownerId: "user_other",
        visibility: "private",
      });
      const service = new GroupsService(db);
      const rows = await service.list("user_abc", {});
      expect(rows.map((row) => row.name)).toEqual(["Public one"]);
    });
  });
});
