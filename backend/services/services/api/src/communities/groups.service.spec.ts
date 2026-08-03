import { randomUUID } from "node:crypto";
import type {
  CommunityGroup,
  CommunityGroupMember,
  CommunityJoinRequest,
  GroupListFilter,
  GroupsStore,
  NewGroupRow,
  NewMemberRow,
} from "./groups.service";
import {
  GroupCapReachedError,
  GroupsService,
  MAX_GROUPS_PER_USER,
} from "./groups.service";

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
  /** Present-in-map = the opportunity exists; the value is its deadline. */
  opportunityDeadlines = new Map<string, Date | null>();
  /** Slugs that should collide once, to exercise the retry path. */
  collidingSlugs = new Set<string>();
  /** Forces the owner-membership insert to blow up mid-transaction. */
  failMemberInsert = false;

  /**
   * Real transaction semantics, not a comment claiming them: snapshot the
   * tables, run the body, restore every table on any throw. Without this, a
   * "written in one transaction" test passes just as happily against two
   * independent un-transacted inserts.
   */
  private async transaction<T>(body: () => Promise<T>): Promise<T> {
    const snapshot = {
      groups: this.groups.map((row) => ({ ...row })),
      members: this.members.map((row) => ({ ...row })),
      requests: this.requests.map((row) => ({ ...row })),
    };
    try {
      return await body();
    } catch (error) {
      this.groups = snapshot.groups;
      this.members = snapshot.members;
      this.requests = snapshot.requests;
      throw error;
    }
  }

  async countActiveOwnedGroups(ownerId: string): Promise<number> {
    return this.groups.filter(
      (group) => group.ownerId === ownerId && group.archivedAt === null,
    ).length;
  }

  async createGroupWithOwner(
    group: NewGroupRow,
    member: NewMemberRow,
    limits: { maxOwnedGroups: number },
  ): Promise<CommunityGroup> {
    return this.transaction(async () => {
      // Counted inline, not via countActiveOwnedGroups: the two are separate
      // reads in the real adapter too (one before the transaction, one inside
      // it under an advisory lock), and a test that stubs the optimistic
      // pre-check must still meet the authoritative one.
      const owned = this.groups.filter(
        (row) => row.ownerId === group.ownerId && row.archivedAt === null,
      ).length;
      if (owned >= limits.maxOwnedGroups) throw new GroupCapReachedError();

      if (this.collidingSlugs.has(group.slug)) {
        // Mirrors what Postgres raises for community_groups_slug_key.
        this.collidingSlugs.delete(group.slug);
        const error = new Error(
          "duplicate key value violates unique constraint",
        ) as Error & { code?: string; constraint?: string };
        error.code = "23505";
        error.constraint = "community_groups_slug_key";
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
      if (this.failMemberInsert) {
        const error = new Error(
          "duplicate key value violates unique constraint",
        ) as Error & { code?: string; constraint?: string };
        error.code = "23505";
        error.constraint = "community_group_members_group_id_user_id_key";
        throw error;
      }
      this.members.push({
        id: randomUUID(),
        groupId: row.id,
        userId: member.userId,
        role: member.role,
        status: member.status,
        joinedAt: new Date(),
      });
      return row;
    });
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

  /**
   * Honours the same contract as `DrizzleGroupsStore.listGroups`: never
   * archived, never expired, optional opportunity + ilike filters, newest
   * activity first, capped at 50. A fake that ignored `filter` would leave
   * every one of those untested.
   */
  async listGroups(filter: GroupListFilter): Promise<CommunityGroup[]> {
    const now = Date.now();
    const needle = filter.query?.trim().toLowerCase();
    return this.groups
      .filter((group) => group.archivedAt === null)
      .filter((group) => !group.expiresAt || group.expiresAt.getTime() > now)
      .filter(
        (group) =>
          !filter.opportunityId || group.opportunityId === filter.opportunityId,
      )
      .filter(
        (group) =>
          !needle ||
          group.name.toLowerCase().includes(needle) ||
          (group.description ?? "").toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        const left = a.lastMessageAt?.getTime() ?? -Infinity;
        const right = b.lastMessageAt?.getTime() ?? -Infinity;
        if (left !== right) return right - left;
        return b.createdAt.getTime() - a.createdAt.getTime();
      })
      .slice(0, Math.min(filter.limit ?? 50, 50));
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

  async activateMembership(
    member: NewMemberRow & { groupId: string },
  ): Promise<CommunityGroupMember> {
    return this.transaction(async () => {
      const existing = await this.findMembership(member.groupId, member.userId);
      if (existing?.status === "active") return existing;
      const row = await this.upsertMembership({ ...member, status: "active" });
      await this.adjustMemberCount(member.groupId, 1);
      return row;
    });
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

  async findOpportunity(
    opportunityId: string,
  ): Promise<{ deadline: Date | null } | null> {
    if (!this.opportunityDeadlines.has(opportunityId)) return null;
    return { deadline: this.opportunityDeadlines.get(opportunityId) ?? null };
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

    it("leaves no group row behind when the owner membership insert fails", async () => {
      const db = fakeDb();
      db.failMemberInsert = true;
      const service = new GroupsService(db);
      await expect(
        service.create("user_abc", {
          name: "Half written group",
          visibility: "public",
          joinPolicy: "open",
          coverEmoji: "💬",
        }),
      ).rejects.toThrow();
      // The whole point of the transaction: a group whose creator has no
      // owner-membership row is a group its own creator cannot administer,
      // because the RLS helpers resolve ownership through that row.
      expect(db.groups).toHaveLength(0);
      expect(db.members).toHaveLength(0);
    });

    it("rejects an opportunityId that does not exist, in plain words", async () => {
      const service = new GroupsService(fakeDb());
      await expect(
        service.create("user_abc", {
          name: "Dangling link",
          opportunityId: "00000000-0000-4000-8000-0000000000ee",
          visibility: "public",
          joinPolicy: "open",
          coverEmoji: "💬",
        }),
      ).rejects.toThrow(/couldn't find that opportunity/i);
    });

    it("still creates when the linked opportunity has no deadline", async () => {
      const db = fakeDb();
      const opportunityId = "00000000-0000-4000-8000-0000000000dd";
      db.opportunityDeadlines.set(opportunityId, null);
      const group = await new GroupsService(db).create("user_abc", {
        name: "Deadline-free group",
        opportunityId,
        visibility: "public",
        joinPolicy: "open",
        coverEmoji: "💬",
      });
      expect(group.expiresAt).toBeNull();
    });

    it("re-checks the cap inside the transaction, not just before it", async () => {
      const db = fakeDb({ ownedActive: 2 });
      const service = new GroupsService(db);
      // Simulate the racing writer: the pre-check reads a stale 1, the
      // in-transaction count sees the real 2.
      db.countActiveOwnedGroups = async () => 1;
      await expect(
        service.create("user_abc", {
          name: "Racing third group",
          visibility: "public",
          joinPolicy: "open",
          coverEmoji: "💬",
        }),
      ).rejects.toThrow(/2 active groups/i);
      expect(db.groups).toHaveLength(2);
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
      db.createGroupWithOwner = async (group, member, limits) => {
        calls += 1;
        if (calls === 1) db.collidingSlugs.add(group.slug);
        return original(group, member, limits);
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

    it("counts a double-tapped join once", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      const before = db.groups[0].memberCount;
      await service.join("user_xyz", GROUP_ID, []);
      await service.join("user_xyz", GROUP_ID, []);
      expect(db.groups[0].memberCount).toBe(before + 1);
      expect(
        db.members.filter((row) => row.userId === "user_xyz"),
      ).toHaveLength(1);
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

    it("lets an owner remove an ordinary member and decrements the count", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await service.join("user_xyz", GROUP_ID, []);
      const before = db.groups[0].memberCount;
      await service.removeMember("user_owner", GROUP_ID, "user_xyz");
      expect(await service.activeMembership("user_xyz", GROUP_ID)).toBeNull();
      // Asserted on this path too: the "read wasCounted before the write"
      // ordering is duplicated in leave() and removeMember(), so testing it
      // only on leave() lets the bug come back here unnoticed.
      expect(db.groups[0].memberCount).toBe(before - 1);
    });

    it("does not decrement twice when a removed member is removed again", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await service.join("user_xyz", GROUP_ID, []);
      const before = db.groups[0].memberCount;
      await service.removeMember("user_owner", GROUP_ID, "user_xyz");
      await expect(
        service.removeMember("user_owner", GROUP_ID, "user_xyz"),
      ).rejects.toThrow(/isn't in this group/i);
      expect(db.groups[0].memberCount).toBe(before - 1);
    });

    it("treats a plain member removing themselves as leaving", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await service.join("user_xyz", GROUP_ID, []);
      await expect(
        service.removeMember("user_xyz", GROUP_ID, "user_xyz"),
      ).resolves.toEqual({ success: true });
      expect(await service.activeMembership("user_xyz", GROUP_ID)).toBeNull();
    });

    it("stops a mod from removing a peer mod", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await service.join("user_mod_a", GROUP_ID, []);
      await service.join("user_mod_b", GROUP_ID, []);
      await service.setMemberRole("user_owner", GROUP_ID, "user_mod_a", "mod");
      await service.setMemberRole("user_owner", GROUP_ID, "user_mod_b", "mod");
      await expect(
        service.removeMember("user_mod_a", GROUP_ID, "user_mod_b"),
      ).rejects.toThrow(/only an owner can remove another moderator/i);
      // The owner still can.
      await expect(
        service.removeMember("user_owner", GROUP_ID, "user_mod_b"),
      ).resolves.toEqual({ success: true });
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
        name: "Someone else's secret",
        ownerId: "user_other",
        visibility: "private",
      });
      // The half the name promises: a private group the caller belongs to.
      seedGroup(db, {
        id: randomUUID(),
        slug: "my-secret",
        name: "My own secret",
        ownerId: "user_abc",
        visibility: "private",
      });
      const service = new GroupsService(db);
      const rows = await service.list("user_abc", {});
      expect(rows.map((row) => row.name).sort()).toEqual([
        "My own secret",
        "Public one",
      ]);
    });

    it("filters by opportunityId", async () => {
      const db = fakeDb();
      const opportunityId = "00000000-0000-4000-8000-0000000000aa";
      seedGroup(db, {
        id: randomUUID(),
        slug: "linked",
        name: "Linked",
        opportunityId,
      });
      seedGroup(db, { id: randomUUID(), slug: "unlinked", name: "Unlinked" });
      const rows = await new GroupsService(db).list("user_abc", {
        opportunityId,
      });
      expect(rows.map((row) => row.name)).toEqual(["Linked"]);
    });

    it("matches the query against name and description", async () => {
      const db = fakeDb();
      seedGroup(db, {
        id: randomUUID(),
        slug: "by-name",
        name: "Chevening applicants",
      });
      seedGroup(db, {
        id: randomUUID(),
        slug: "by-description",
        name: "Scholarship crew",
        description: "For chevening hopefuls",
      });
      seedGroup(db, { id: randomUUID(), slug: "other", name: "Coding club" });
      const rows = await new GroupsService(db).list("user_abc", {
        query: "CHEVENING",
      });
      expect(rows.map((row) => row.name).sort()).toEqual([
        "Chevening applicants",
        "Scholarship crew",
      ]);
    });

    it("orders by most recent activity and caps the page at 50", async () => {
      const db = fakeDb();
      for (let i = 0; i < 60; i += 1) {
        seedGroup(db, {
          id: randomUUID(),
          slug: `bulk-${i}`,
          name: `Bulk ${i}`,
          lastMessageAt: new Date(2027, 0, 1 + i),
        });
      }
      const service = new GroupsService(db);
      const rows = await service.list("user_abc", {});
      expect(rows).toHaveLength(50);
      expect(rows[0].name).toBe("Bulk 59");
      const capped = await service.list("user_abc", { limit: 500 });
      expect(capped).toHaveLength(50);
      const small = await service.list("user_abc", { limit: 3 });
      expect(small.map((row) => row.name)).toEqual([
        "Bulk 59",
        "Bulk 58",
        "Bulk 57",
      ]);
    });

    it("leaves expired groups out of the browse feed", async () => {
      const db = fakeDb();
      seedGroup(db, { id: randomUUID(), slug: "live", name: "Live" });
      seedGroup(db, {
        id: randomUUID(),
        slug: "expired",
        name: "Expired",
        expiresAt: new Date(Date.now() - 60_000),
      });
      const rows = await new GroupsService(db).list("user_abc", {});
      expect(rows.map((row) => row.name)).toEqual(["Live"]);
    });
  });

  describe("private groups", () => {
    it("refuses a stranger's join even when the join policy is open", async () => {
      const db = fakeDb({
        group: { id: GROUP_ID, visibility: "private", joinPolicy: "open" },
      });
      const service = new GroupsService(db);
      await expect(service.join("user_stranger", GROUP_ID, [])).rejects.toThrow(
        /private\. Ask an owner for an invite/i,
      );
      expect(
        await service.activeMembership("user_stranger", GROUP_ID),
      ).toBeNull();
      expect(db.groups[0].memberCount).toBe(1);
    });

    it("still lets a stranger request into a public request-only group", async () => {
      const service = new GroupsService(
        fakeDb({
          group: { id: GROUP_ID, visibility: "public", joinPolicy: "request" },
        }),
      );
      const result = await service.join("user_stranger", GROUP_ID, []);
      expect(result.status).toBe("pending");
    });

    it("lets an invited user accept and join a private group", async () => {
      const db = fakeDb({
        group: { id: GROUP_ID, visibility: "private", joinPolicy: "request" },
      });
      const service = new GroupsService(db);
      await service.invite("user_owner", GROUP_ID, "user_friend");
      const result = await service.join("user_friend", GROUP_ID, []);
      expect(result.status).toBe("active");
      expect(db.groups[0].memberCount).toBe(2);
    });

    it("refuses an invite from someone who cannot administer the group", async () => {
      const service = new GroupsService(
        fakeDb({ group: { id: GROUP_ID, visibility: "private" } }),
      );
      await expect(
        service.invite("user_stranger", GROUP_ID, "user_friend"),
      ).rejects.toThrow(/not allowed to invite/i);
    });

    it("lets an invitee read the group they were invited to, but nobody else", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, visibility: "private" } });
      const service = new GroupsService(db);
      await service.invite("user_owner", GROUP_ID, "user_friend");
      await expect(service.get("user_friend", GROUP_ID)).resolves.toMatchObject(
        { group: { id: GROUP_ID } },
      );
      await expect(service.get("user_stranger", GROUP_ID)).rejects.toThrow(
        /private/i,
      );
    });
  });

  describe("archive", () => {
    it("lets the owner archive, after which nobody can join", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      const archived = await service.archive("user_owner", GROUP_ID);
      expect(archived.archivedAt).toBeInstanceOf(Date);
      await expect(service.join("user_xyz", GROUP_ID, [])).rejects.toThrow(
        /archived/i,
      );
    });

    it("refuses to archive from a non-owner, and refuses to archive twice", async () => {
      const db = fakeDb({ group: { id: GROUP_ID } });
      const service = new GroupsService(db);
      await expect(service.archive("user_other", GROUP_ID)).rejects.toThrow(
        /only an owner/i,
      );
      await service.archive("user_owner", GROUP_ID);
      await expect(service.archive("user_owner", GROUP_ID)).rejects.toThrow(
        /already archived/i,
      );
    });

    it("frees a slot so the capped owner can start another group", async () => {
      const db = fakeDb({ ownedActive: 2 });
      const service = new GroupsService(db);
      const dto = {
        name: "Third group",
        visibility: "public" as const,
        joinPolicy: "open" as const,
        coverEmoji: "💬",
      };
      await expect(service.create("user_abc", dto)).rejects.toThrow(
        /2 active groups/i,
      );
      await service.archive("user_abc", db.groups[0].id);
      await expect(service.create("user_abc", dto)).resolves.toMatchObject({
        name: "Third group",
      });
    });
  });

  describe("setMemberRole", () => {
    it("lets an owner promote a member, who can then moderate", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await service.join("user_xyz", GROUP_ID, []);
      await service.join("user_victim", GROUP_ID, []);
      const promoted = await service.setMemberRole(
        "user_owner",
        GROUP_ID,
        "user_xyz",
        "mod",
      );
      expect(promoted.role).toBe("mod");
      await service.removeMember("user_xyz", GROUP_ID, "user_victim");
      expect(
        await service.activeMembership("user_victim", GROUP_ID),
      ).toBeNull();
    });

    it("unblocks the only owner: promote someone else, then leave", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await service.join("user_heir", GROUP_ID, []);
      await expect(service.leave("user_owner", GROUP_ID)).rejects.toThrow(
        /only owner/i,
      );
      await service.setMemberRole("user_owner", GROUP_ID, "user_heir", "owner");
      await expect(service.leave("user_owner", GROUP_ID)).resolves.toEqual({
        success: true,
      });
      expect(await service.activeMembership("user_owner", GROUP_ID)).toBeNull();
    });

    it("refuses to demote the last owner", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await service.join("user_heir", GROUP_ID, []);
      await service.setMemberRole("user_owner", GROUP_ID, "user_heir", "owner");
      // The heir is a real owner now, but the creator's row is the canonical
      // owner_id and cannot be demoted at all.
      await expect(
        service.setMemberRole("user_heir", GROUP_ID, "user_owner", "member"),
      ).rejects.toThrow(/you created this group|stay its owner/i);
      // The heir can be demoted while a second owner exists...
      await expect(
        service.setMemberRole("user_owner", GROUP_ID, "user_heir", "member"),
      ).resolves.toMatchObject({ role: "member" });
      // ...but now that they are the last owner again, nothing can demote them.
      await service.setMemberRole("user_owner", GROUP_ID, "user_heir", "owner");
      await service.leave("user_owner", GROUP_ID);
      await expect(
        service.setMemberRole("user_heir", GROUP_ID, "user_heir", "member"),
      ).rejects.toThrow(/no owner/i);
    });

    it("refuses a role change from a mod", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await service.join("user_mod", GROUP_ID, []);
      await service.setMemberRole("user_owner", GROUP_ID, "user_mod", "mod");
      await service.join("user_xyz", GROUP_ID, []);
      await expect(
        service.setMemberRole("user_mod", GROUP_ID, "user_xyz", "mod"),
      ).rejects.toThrow(/only an owner/i);
    });
  });
});
