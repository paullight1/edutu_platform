import { randomUUID } from "node:crypto";
import type {
  CommunityGroup,
  CommunityGroupMember,
  CommunityJoinRequest,
  GroupListFilter,
  GroupsStore,
  GroupWithMembership,
  NewGroupRow,
  NewMemberRow,
} from "./groups.service";
import type { AuthorDirectory, MessagesStore } from "./messages.service";
import { MessagesService } from "./messages.service";
import {
  GroupCapReachedError,
  GroupsService,
  LastOwnerError,
  MembershipChangedError,
  LIST_LIMIT,
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
    const visible = new Set(filter.visibleGroupIds ?? []);
    // Honoured, including the empty-array short-circuit, because the real
    // adapter honours it: a fake that ignored `restrictToGroupIds` would leave
    // the id set the service builds for `mine` completely unchecked here.
    const restrict = filter.restrictToGroupIds
      ? new Set(filter.restrictToGroupIds)
      : null;
    const isOwned = (group: CommunityGroup) =>
      group.ownerId === filter.includeOwnedBy;
    return (
      this.groups
        .filter((group) => group.archivedAt === null)
        .filter(
          (group) => !restrict || restrict.has(group.id) || isOwned(group),
        )
        // Applied BEFORE the slice, exactly as the SQL applies it before LIMIT:
        // a fake that filtered afterwards would hide the short-page bug.
        .filter(
          (group) =>
            group.visibility === "public" ||
            visible.has(group.id) ||
            isOwned(group),
        )
        .filter((group) => !group.expiresAt || group.expiresAt.getTime() > now)
        .filter(
          (group) =>
            !filter.opportunityId ||
            group.opportunityId === filter.opportunityId,
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
        .slice(0, Math.min(filter.limit ?? LIST_LIMIT, LIST_LIMIT))
    );
  }

  async listMembershipsForUser(
    userId: string,
  ): Promise<CommunityGroupMember[]> {
    return this.members.filter((member) => member.userId === userId);
  }

  async listActiveGroupMembers(
    groupId: string,
    limit: number,
  ): Promise<CommunityGroupMember[]> {
    const rank: Record<string, number> = { owner: 0, mod: 1, member: 2 };
    return this.members
      .filter(
        (member) => member.groupId === groupId && member.status === "active",
      )
      .sort(
        (left, right) =>
          (rank[left.role] ?? 3) - (rank[right.role] ?? 3) ||
          left.joinedAt.getTime() - right.joinedAt.getTime(),
      )
      .slice(0, limit);
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

  /**
   * Mirrors the real adapter's contract: the owner re-count, the expected-status
   * re-check and the member_count adjustment all happen inside the same
   * transaction as the write, and the count is taken with the row being changed
   * still included.
   */
  async transitionMembership(input: {
    groupId: string;
    userId: string;
    role: string;
    status: string;
    requireSurvivingOwner: boolean;
    expectedStatus?: string;
  }): Promise<CommunityGroupMember> {
    return this.transaction(async () => {
      // Read straight off the table, NOT through findMembership: the adapter's
      // in-transaction read is a separate `select ... for update`, and a test
      // that simulates a stale caller by stubbing findMembership would
      // otherwise make this read stale too and could never fail.
      const existing =
        this.members.find(
          (row) => row.groupId === input.groupId && row.userId === input.userId,
        ) ?? null;
      // Re-read INSIDE the transaction, exactly like the adapter's FOR UPDATE
      // select: a fake that trusted the caller's snapshot could never fail the
      // stale-status test, so the test would prove nothing.
      if (input.expectedStatus && existing?.status !== input.expectedStatus) {
        throw new MembershipChangedError();
      }
      if (input.requireSurvivingOwner) {
        if ((await this.countActiveOwners(input.groupId)) <= 1) {
          throw new LastOwnerError();
        }
      }
      const wasActive = existing?.status === "active";
      const nowActive = input.status === "active";
      const row = await this.upsertMembership({
        groupId: input.groupId,
        userId: input.userId,
        role: input.role,
        status: input.status,
      });
      if (wasActive !== nowActive) {
        await this.adjustMemberCount(input.groupId, nowActive ? 1 : -1);
      }
      return row;
    });
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

/** Group names in a stable order, so assertions read as sets. */
function names(rows: GroupWithMembership[]): string[] {
  return rows.map((row) => row.group.name).sort();
}

/**
 * The REAL `MessagesService`, reading the same groups and memberships this
 * spec's store holds. Its `list` and `GroupsService.list` are supposed to
 * enforce one rule through one function; a hand-rolled stub of the message side
 * would only prove this file's opinion of that rule.
 */
function messagesOver(store: FakeGroupsStore): MessagesService {
  const adapter: MessagesStore = {
    findGroup: (groupId) => store.findGroup(groupId),
    findMembership: (groupId, userId) => store.findMembership(groupId, userId),
    listMessages: async () => [],
    findMessage: async () => null,
    insertMessage: () => {
      throw new Error("insertMessage should never be reached in these tests");
    },
    updateMessage: async () => null,
  };
  return new MessagesService(adapter);
}

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
    it("refuses to let the group's creator leave, whoever else is an owner", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await expect(service.leave("user_owner", GROUP_ID)).rejects.toThrow(
        /created this group, so you can't leave it/i,
      );
      // Even after following the old advice to hand ownership to someone else.
      await service.join("user_heir", GROUP_ID, []);
      await service.setMemberRole("user_owner", GROUP_ID, "user_heir", "owner");
      await expect(service.leave("user_owner", GROUP_ID)).rejects.toThrow(
        /created this group, so you can't leave it/i,
      );
    });

    /**
     * PROBE B. The creator used to be able to leave after promoting an heir,
     * which cost them a group slot forever: countActiveOwnedGroups counts by
     * owner_id regardless of membership, while assertCanAdminister let the
     * `removed` row beat owner_id — so the group kept its slot and could never
     * be archived. Refusing the departure is what keeps the slot recoverable.
     */
    it("never leaves the creator holding a slot they cannot free", async () => {
      const db = fakeDb({ ownedActive: 1 });
      const group = db.groups[0];
      const service = new GroupsService(db);
      await service.join("user_heir", group.id, []);
      await service.setMemberRole("user_abc", group.id, "user_heir", "owner");
      await expect(service.leave("user_abc", group.id)).rejects.toThrow(
        /archive it instead/i,
      );
      // Still an owner, so archiving still works, so the slot comes back.
      await expect(
        service.archive("user_abc", group.id),
      ).resolves.toMatchObject({ id: group.id });
      expect(await db.countActiveOwnedGroups("user_abc")).toBe(0);
    });

    it("lets a promoted owner leave while the creator is still an owner", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await service.join("user_heir", GROUP_ID, []);
      await service.setMemberRole("user_owner", GROUP_ID, "user_heir", "owner");
      await expect(service.leave("user_heir", GROUP_ID)).resolves.toEqual({
        success: true,
      });
      expect(await service.activeMembership("user_heir", GROUP_ID)).toBeNull();
    });

    it("re-checks the last-owner rule inside the transaction, not just before it", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await service.join("user_heir", GROUP_ID, []);
      await service.setMemberRole("user_owner", GROUP_ID, "user_heir", "owner");
      // The racing co-owner: the unlocked pre-check still reads 2 owners, the
      // locked re-count inside the write sees 1. Without the in-transaction
      // check both departures commit and the group is stranded with none.
      db.countActiveOwners = async () => 2;
      const original = db.transitionMembership.bind(db);
      let sawRequirement = false;
      db.transitionMembership = async (input) => {
        if (input.requireSurvivingOwner) {
          sawRequirement = true;
          throw new LastOwnerError();
        }
        return original(input);
      };
      await expect(service.leave("user_heir", GROUP_ID)).rejects.toThrow(
        /only owner/i,
      );
      expect(sawRequirement).toBe(true);
    });

    /**
     * PROBE C. `leave` used to accept anything that was not `removed`, so a
     * banned user could launder their own ban: join is refused → they "leave"
     * → the ban becomes `removed` → join admits them. Walked end to end here,
     * because each step in isolation looks harmless.
     */
    it("does not let a banned user launder their ban by leaving", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      db.members.push({
        id: randomUUID(),
        groupId: GROUP_ID,
        userId: "user_banned",
        role: "member",
        status: "banned",
        joinedAt: new Date(),
      });
      await expect(service.join("user_banned", GROUP_ID, [])).rejects.toThrow(
        /can't join this group/i,
      );
      await expect(service.leave("user_banned", GROUP_ID)).rejects.toThrow(
        /banned/i,
      );
      const row = db.members.find((item) => item.userId === "user_banned")!;
      expect(row.status).toBe("banned");
      await expect(service.join("user_banned", GROUP_ID, [])).rejects.toThrow(
        /can't join this group/i,
      );
    });

    it("lets an invitee decline and an applicant withdraw", async () => {
      const db = fakeDb({
        group: { id: GROUP_ID, visibility: "public", joinPolicy: "request" },
      });
      const service = new GroupsService(db);
      await service.invite("user_owner", GROUP_ID, "user_friend");
      await service.join("user_applicant", GROUP_ID, []);
      const before = db.groups[0].memberCount;
      await expect(service.leave("user_friend", GROUP_ID)).resolves.toEqual({
        success: true,
      });
      await expect(service.leave("user_applicant", GROUP_ID)).resolves.toEqual({
        success: true,
      });
      // Neither was ever counted, so neither departure may move the counter.
      expect(db.groups[0].memberCount).toBe(before);
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

    it("refuses to let the creator remove themselves", async () => {
      const service = new GroupsService(
        fakeDb({ group: { id: GROUP_ID, ownerId: "user_owner" } }),
      );
      await expect(
        service.removeMember("user_owner", GROUP_ID, "user_owner"),
      ).rejects.toThrow(/created this group, so you can't leave it/i);
    });

    it("does not move member_count when the removal write fails", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await service.join("user_xyz", GROUP_ID, []);
      const before = db.groups[0].memberCount;
      // The failure is injected into the COUNT step, which runs AFTER the status
      // write has landed — the only ordering that can tell a transaction from
      // two unrelated statements. Failing the status write instead (the earlier
      // version of this test) never reaches the counter at all, so it passes
      // identically against a store with no transaction whatsoever.
      db.adjustMemberCount = async () => {
        throw new Error("write failed");
      };
      await expect(
        service.removeMember("user_owner", GROUP_ID, "user_xyz"),
      ).rejects.toThrow(/write failed/);
      expect(db.groups[0].memberCount).toBe(before);
      expect(
        await service.activeMembership("user_xyz", GROUP_ID),
      ).not.toBeNull();
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

    it("does not let a mod undo an owner's ban by removing the banned user", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await service.join("user_mod", GROUP_ID, []);
      await service.setMemberRole("user_owner", GROUP_ID, "user_mod", "mod");
      db.members.push({
        id: randomUUID(),
        groupId: GROUP_ID,
        userId: "user_banned",
        role: "member",
        status: "banned",
        joinedAt: new Date(),
      });
      await expect(
        service.removeMember("user_mod", GROUP_ID, "user_banned"),
      ).rejects.toThrow(/already banned/i);
      // Rewriting the ban to `removed` would have let them rejoin.
      expect(
        db.members.find((row) => row.userId === "user_banned")!.status,
      ).toBe("banned");
      await expect(service.join("user_banned", GROUP_ID, [])).rejects.toThrow(
        /can't join this group/i,
      );
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

  describe("listMembers", () => {
    const directory: AuthorDirectory = {
      async findAuthors(userIds) {
        return userIds
          .filter((userId) => userId !== "user_without_profile")
          .map((userId) => ({
            userId,
            fullName: userId === "user_owner" ? "Amina Owner" : "Kofi Member",
            avatarUrl:
              userId === "user_owner" ? "https://img.test/amina.jpg" : null,
          }));
      },
    };

    it("lists only active members with a minimal public profile", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, visibility: "public" } });
      await db.upsertMembership({
        groupId: GROUP_ID,
        userId: "user_member",
        role: "mod",
        status: "active",
      });
      await db.upsertMembership({
        groupId: GROUP_ID,
        userId: "user_without_profile",
        role: "member",
        status: "active",
      });
      await db.upsertMembership({
        groupId: GROUP_ID,
        userId: "user_departed",
        role: "member",
        status: "removed",
      });

      const result = await new GroupsService(db, directory).listMembers(
        "user_stranger",
        GROUP_ID,
      );

      expect(result.hasMore).toBe(false);
      expect(result.members.map((row) => row.membership.userId)).toEqual([
        "user_owner",
        "user_member",
        "user_without_profile",
      ]);
      expect(result.members[0].profile).toEqual({
        displayName: "Amina Owner",
        avatarUrl: "https://img.test/amina.jpg",
      });
      expect(result.members[2].profile.displayName).toBe("Edutu member");
      expect(JSON.stringify(result)).not.toMatch(/email|school|country|cgpa/i);
    });

    it("protects a private roster with the same visibility rule as the group", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, visibility: "private" } });
      const service = new GroupsService(db, directory);

      await expect(
        service.listMembers("user_stranger", GROUP_ID),
      ).rejects.toThrow(/private/i);

      await service.invite("user_owner", GROUP_ID, "user_invited");
      await expect(
        service.listMembers("user_invited", GROUP_ID),
      ).resolves.toMatchObject({
        members: [{ membership: { userId: "user_owner", status: "active" } }],
      });
    });

    it("is bounded and reports when more active members exist", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, visibility: "public" } });
      for (const userId of ["user_a", "user_b", "user_c"]) {
        await db.upsertMembership({
          groupId: GROUP_ID,
          userId,
          role: "member",
          status: "active",
        });
      }
      const result = await new GroupsService(db, directory).listMembers(
        "user_stranger",
        GROUP_ID,
        2,
      );
      expect(result.members).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });
  });

  describe("list", () => {
    it("keeps an owned group visible when a legacy owner membership row is missing", async () => {
      const db = fakeDb();
      const owned = seedGroup(db, {
        id: randomUUID(),
        slug: "legacy-owned",
        name: "My earlier group",
        ownerId: "user_abc",
        visibility: "private",
      });
      db.members = db.members.filter((row) => row.groupId !== owned.id);

      const rows = await new GroupsService(db).list("user_abc", {
        mine: true,
      });

      expect(rows.map((row) => row.group.id)).toEqual([owned.id]);
      expect(rows[0].membership).toBeNull();
    });

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
      expect(names(rows)).toEqual(["My own secret", "Public one"]);
      // Each row carries the caller's own membership, mirroring `get`.
      const own = rows.find((row) => row.group.name === "My own secret");
      expect(own?.membership?.status).toBe("active");
      expect(
        rows.find((row) => row.group.name === "Public one")?.membership,
      ).toBeNull();
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
      expect(names(rows)).toEqual(["Linked"]);
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
      expect(names(rows)).toEqual(["Chevening applicants", "Scholarship crew"]);
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
      expect(rows[0].group.name).toBe("Bulk 59");
      const capped = await service.list("user_abc", { limit: 500 });
      expect(capped).toHaveLength(50);
      const small = await service.list("user_abc", { limit: 3 });
      expect(small.map((row) => row.group.name)).toEqual([
        "Bulk 59",
        "Bulk 58",
        "Bulk 57",
      ]);
    });

    it("fills the page with public groups instead of returning a short one", async () => {
      const db = fakeDb();
      // 60 private groups belonging to someone else, all more recently active
      // than any public one. Filtering them out AFTER the 50-row cap returns a
      // near-empty page while 60 public groups sit behind it.
      for (let i = 0; i < 60; i += 1) {
        seedGroup(db, {
          id: randomUUID(),
          slug: `secret-${i}`,
          name: `Secret ${i}`,
          ownerId: "user_other",
          visibility: "private",
          lastMessageAt: new Date(2027, 6, 1 + i),
        });
      }
      for (let i = 0; i < 60; i += 1) {
        seedGroup(db, {
          id: randomUUID(),
          slug: `open-${i}`,
          name: `Open ${i}`,
          ownerId: "user_other",
          lastMessageAt: new Date(2027, 0, 1 + i),
        });
      }
      const rows = await new GroupsService(db).list("user_abc", {});
      expect(rows).toHaveLength(LIST_LIMIT);
      expect(rows.every((row) => row.group.visibility === "public")).toBe(true);
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
      expect(names(rows)).toEqual(["Live"]);
    });
  });

  // -------------------------------------------------------------------------
  // Invitation visibility. A private group can never be self-joined, so every
  // entry to one runs through an `invited` row — and while `list` returned bare
  // groups filtered to `active`, that row appeared NOWHERE in the app: the
  // group is not public, and an invitee is not active. The invitation existed
  // in the database and was unreachable.
  // -------------------------------------------------------------------------
  describe("list — membership visibility", () => {
    /** A private group owned by somebody else, plus the caller's row on it. */
    function privateGroupWith(status: string | null) {
      const db = fakeDb();
      const group = seedGroup(db, {
        id: randomUUID(),
        slug: "invite-only",
        name: "Invite only",
        ownerId: "user_owner",
        visibility: "private",
      });
      // A public group alongside it, so "sees nothing" is distinguishable from
      // "the query returned nothing at all".
      seedGroup(db, {
        id: randomUUID(),
        slug: "open-door",
        name: "Open door",
        ownerId: "user_owner",
      });
      if (status) {
        db.members.push({
          id: randomUUID(),
          groupId: group.id,
          userId: "user_guest",
          role: "member",
          status,
          joinedAt: new Date(),
        });
      }
      return { db, group, service: new GroupsService(db) };
    }

    it("shows an invited user the private group, marked invited", async () => {
      const { service } = privateGroupWith("invited");
      const rows = await service.list("user_guest", {});
      expect(names(rows)).toEqual(["Invite only", "Open door"]);
      expect(
        rows.find((row) => row.group.name === "Invite only")?.membership
          ?.status,
      ).toBe("invited");
    });

    it("marks a pending applicant's group pending instead of leaving them looking like a stranger", async () => {
      const db = fakeDb();
      const group = seedGroup(db, {
        id: randomUUID(),
        slug: "request-to-join",
        name: "Request to join",
        ownerId: "user_owner",
        joinPolicy: "request",
      });
      db.members.push({
        id: randomUUID(),
        groupId: group.id,
        userId: "user_guest",
        role: "member",
        status: "pending",
        joinedAt: new Date(),
      });
      const rows = await new GroupsService(db).list("user_guest", {});
      expect(rows.map((row) => row.membership?.status)).toEqual(["pending"]);
    });

    it("does NOT let a pending application unlock a private group", async () => {
      // The queue-of-applicants case: a public request-to-join group made
      // private carries unvetted `pending` rows. Listing it for them would
      // disclose a private group in exchange for having asked to join while it
      // was still public — and `get` would 403 on the row `list` handed over.
      const { service } = privateGroupWith("pending");
      expect(names(await service.list("user_guest", {}))).toEqual([
        "Open door",
      ]);
    });

    it("does not let a banned user's group reappear in their list", async () => {
      const { service } = privateGroupWith("banned");
      expect(names(await service.list("user_guest", {}))).toEqual([
        "Open door",
      ]);
    });

    it("does not show a removed user the group they were removed from", async () => {
      const { service } = privateGroupWith("removed");
      expect(names(await service.list("user_guest", {}))).toEqual([
        "Open door",
      ]);
    });

    it("shows a stranger no private group at all", async () => {
      const { service } = privateGroupWith(null);
      expect(names(await service.list("user_guest", {}))).toEqual([
        "Open door",
      ]);
    });

    it("still reports a banned user's own status on a group that is public anyway", async () => {
      // The ban does not hide a public group — `canReadGroup` says a signed-out
      // stranger could read it, so hiding it buys nothing — but withholding the
      // row is what makes a browse screen offer "Join" to somebody the owners
      // have banned.
      const db = fakeDb();
      const group = seedGroup(db, {
        id: randomUUID(),
        slug: "open-door",
        name: "Open door",
        ownerId: "user_owner",
      });
      db.members.push({
        id: randomUUID(),
        groupId: group.id,
        userId: "user_guest",
        role: "member",
        status: "banned",
        joinedAt: new Date(),
      });
      const rows = await new GroupsService(db).list("user_guest", {});
      expect(rows.map((row) => row.membership?.status)).toEqual(["banned"]);
      // ...and it is still not "theirs".
      expect(
        await new GroupsService(db).list("user_guest", { mine: true }),
      ).toEqual([]);
    });

    it("agrees with get on every group, row by row", async () => {
      // The failure mode this whole feature keeps producing is two methods that
      // must agree, disagreeing. Rather than assert that in prose: for each of
      // the five statuses plus no-row, whatever `list` decides about the private
      // group, `get` must decide the same.
      for (const status of [
        "active",
        "invited",
        "pending",
        "removed",
        "banned",
        null,
      ]) {
        const { service, group } = privateGroupWith(status);
        const listed = (await service.list("user_guest", {})).some(
          (row) => row.group.id === group.id,
        );
        const gettable = await service
          .get("user_guest", group.id)
          .then(() => true)
          .catch(() => false);
        expect({ status, listed }).toEqual({ status, listed: gettable });
      }
    });

    it("does not widen message access for anyone it newly lists", async () => {
      // Being visible in a browse list is not being in the room. Full message
      // access requires an active membership, while an invited user may only
      // see the group preview until they accept.
      for (const status of ["pending", "removed", "banned", null]) {
        const { db, group } = privateGroupWith(status);
        await expect(
          messagesOver(db).list("user_guest", group.id),
        ).rejects.toThrow(/join this community/i);
      }
      const { db, group } = privateGroupWith("invited");
      await expect(
        messagesOver(db).send("user_guest", group.id, { body: "hello" }),
      ).rejects.toThrow(/join this group/i);
    });

    it("counts an invitation and an application as MINE, and a ban as not", async () => {
      for (const [status, expected] of [
        ["active", ["Invite only"]],
        ["invited", ["Invite only"]],
        // Live, so it is "mine" — but the private group still does not unlock,
        // so `mine` and the visibility rule compose rather than fight.
        ["pending", []],
        ["removed", []],
        ["banned", []],
      ] as const) {
        const { service } = privateGroupWith(status);
        expect({
          status,
          rows: names(await service.list("user_guest", { mine: true })),
        }).toEqual({ status, rows: expected });
      }
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

    /**
     * PROBE A. `visibility` is mutable and `update` exposes it, so a single
     * overloaded `pending` status could be read as "invited" the moment the
     * owner asked for MORE privacy: every unvetted applicant in the queue could
     * then accept their own application. `invited` and `pending` are separate
     * states precisely so this flip changes nothing about who may enter.
     */
    it("does not admit a queued applicant when the owner flips the group to private", async () => {
      const db = fakeDb({
        group: { id: GROUP_ID, visibility: "public", joinPolicy: "request" },
      });
      const service = new GroupsService(db);
      const applied = await service.join("user_stranger", GROUP_ID, []);
      expect(applied.status).toBe("pending");

      await service.update("user_owner", GROUP_ID, { visibility: "private" });

      await expect(service.join("user_stranger", GROUP_ID, [])).rejects.toThrow(
        /private\. Ask an owner for an invite/i,
      );
      expect(
        await service.activeMembership("user_stranger", GROUP_ID),
      ).toBeNull();
      await expect(service.get("user_stranger", GROUP_ID)).rejects.toThrow(
        /private/i,
      );
      expect(db.groups[0].memberCount).toBe(1);
    });

    it("lets an invitee skip the queue on a public request-to-join group", async () => {
      const db = fakeDb({
        group: { id: GROUP_ID, visibility: "public", joinPolicy: "request" },
      });
      const service = new GroupsService(db);
      await service.invite("user_owner", GROUP_ID, "user_friend");
      // Without this, an invitation to a request-to-join group degrades into
      // "now go and apply", which is not what the owner did.
      const result = await service.join("user_friend", GROUP_ID, []);
      expect(result.status).toBe("active");
      expect(db.groups[0].memberCount).toBe(2);
    });

    it("keeps the role an owner gave an invitee before they accepted", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, visibility: "private" } });
      const service = new GroupsService(db);
      await service.invite("user_owner", GROUP_ID, "user_heir");
      await service.setMemberRole("user_owner", GROUP_ID, "user_heir", "mod");
      const result = await service.join("user_heir", GROUP_ID, []);
      expect(result.membership.role).toBe("mod");
    });

    it("does not hand a departed mod their powers back when they rejoin", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await service.join("user_mod", GROUP_ID, []);
      await service.setMemberRole("user_owner", GROUP_ID, "user_mod", "mod");
      await service.leave("user_mod", GROUP_ID);
      const result = await service.join("user_mod", GROUP_ID, []);
      expect(result.membership.role).toBe("member");
    });

    it("refuses to invite anyone to a group whose deadline has passed", async () => {
      const db = fakeDb({
        group: {
          id: GROUP_ID,
          visibility: "private",
          expiresAt: new Date(Date.now() - 60_000),
        },
      });
      const service = new GroupsService(db);
      // `join` refuses an expired group before it reaches the `invited` branch,
      // so allowing the invite would issue one that can never be accepted.
      await expect(
        service.invite("user_owner", GROUP_ID, "user_friend"),
      ).rejects.toThrow(/deadline has passed/i);
      expect(db.members.some((row) => row.userId === "user_friend")).toBe(
        false,
      );
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
      // The creator cannot leave through the API any more, so the only way to
      // reach "the heir is the last active owner" is a drifted row.
      const creatorRow = db.members.find(
        (row) => row.groupId === GROUP_ID && row.userId === "user_owner",
      )!;
      creatorRow.status = "removed";
      await expect(
        service.setMemberRole("user_heir", GROUP_ID, "user_heir", "member"),
      ).rejects.toThrow(/no owner/i);
    });

    /**
     * PROBE D. The role write is decided from a membership row read outside any
     * transaction, then written back complete with that snapshot's `status`. An
     * owner promoting a member who is concurrently leaving used to write
     * `role: 'mod', status: 'active'` over the committed `removed` row —
     * resurrecting a departed member as a moderator. member_count stays correct
     * throughout, so nothing self-heals and nothing alerts.
     */
    it("refuses a promotion decided against a status that has since changed", async () => {
      const db = fakeDb({ group: { id: GROUP_ID, joinPolicy: "open" } });
      const service = new GroupsService(db);
      await service.join("user_xyz", GROUP_ID, []);
      const stale = { ...db.members.find((r) => r.userId === "user_xyz")! };
      // The racing `leave` commits first.
      await service.leave("user_xyz", GROUP_ID);
      const after = db.groups[0].memberCount;
      // ...but the promotion is still holding the pre-leave snapshot.
      const original = db.findMembership.bind(db);
      db.findMembership = async (groupId, userId) =>
        userId === "user_xyz" ? stale : original(groupId, userId);

      await expect(
        service.setMemberRole("user_owner", GROUP_ID, "user_xyz", "mod"),
      ).rejects.toThrow(/membership changed/i);

      const row = db.members.find((r) => r.userId === "user_xyz")!;
      expect(row.status).toBe("removed");
      expect(row.role).toBe("member");
      expect(db.groups[0].memberCount).toBe(after);
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
