import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  communityGroupMembers,
  communityGroups,
  communityJoinRequests,
  opportunities,
  type CommunityGroup,
  type CommunityGroupMember,
} from "../db/schema";
import {
  canReadGroup,
  canSelfActivate,
  canSelfJoinWithoutInvite,
  isLiveMembershipStatus,
  resolveAdminRole,
  type MemberRole,
  type MembershipStatus,
} from "./community-authz";
import type { CreateGroupDto, UpdateGroupDto } from "./dto/community.dto";

export type { CommunityGroup, CommunityGroupMember };
/**
 * Re-exported, not redefined: the membership vocabulary is part of the
 * authorization rule, so it lives beside the predicates that read it. See
 * community-authz.ts for why `invited` and `pending` are distinct states.
 */
export type { MemberRole, MembershipStatus };
export type CommunityJoinRequest = typeof communityJoinRequests.$inferSelect;

/**
 * A flat cap for everybody. The spec floats a raise to 10 for mentors sourced
 * from the creator pipeline, but `creator_profiles` currently holds zero rows,
 * so that branch would buy a cross-module join in exchange for granting eight
 * extra groups to nobody. Recorded as a follow-up, not built speculatively.
 */
export const MAX_GROUPS_PER_USER = 2;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Exported so the spec asserts against the real cap, not a copy of it. */
export const LIST_LIMIT = 50;

export type NewGroupRow = {
  slug: string;
  name: string;
  description?: string | null;
  opportunityId?: string | null;
  ownerId: string;
  visibility: string;
  joinPolicy: string;
  coverEmoji: string;
  expiresAt?: Date | null;
};

export type NewMemberRow = {
  userId: string;
  role: string;
  status: string;
};

export type GroupPatch = Partial<
  Pick<
    CommunityGroup,
    | "name"
    | "description"
    | "visibility"
    | "joinPolicy"
    | "coverEmoji"
    | "archivedAt"
  >
>;

export type GroupListFilter = {
  opportunityId?: string;
  query?: string;
  limit?: number;
  /**
   * Group ids the caller is an active member of. The visibility filter has to
   * run in the same query as the LIMIT: filtering other people's private groups
   * out *after* the 50-row cap returns a short page while more public groups
   * are still waiting, which reads to the user as "there is nothing else".
   */
  visibleGroupIds?: string[];
};

export type JoinResult = {
  status: "active" | "pending";
  groupId: string;
  membership: CommunityGroupMember;
  request: CommunityJoinRequest | null;
};

/**
 * Raised by the store when the in-transaction re-check of the per-owner group
 * cap fails. It is a distinct type so the service can turn it into the same
 * human sentence as the optimistic pre-check without string-matching.
 */
export class GroupCapReachedError extends Error {
  constructor() {
    super("Group cap reached");
    this.name = "GroupCapReachedError";
  }
}

/**
 * Raised by `transitionMembership` when the write would have left the group
 * with zero active owners. The service's own pre-check produces the friendly
 * sentence; this is the authoritative one, taken under a lock, and exists as a
 * type so the service does not string-match the store.
 */
export class LastOwnerError extends Error {
  constructor() {
    super("Group would be left with no owner");
    this.name = "LastOwnerError";
  }
}

/**
 * Raised by `transitionMembership` when the row it locked is no longer in the
 * status the caller read before taking the lock. The caller's decision was made
 * against a snapshot that has since been overwritten — writing anyway would
 * resurrect a row somebody else just retired (a promotion racing a `leave`
 * re-activates the leaver as a mod) or undo a ban. A type, not a string match.
 */
export class MembershipChangedError extends Error {
  constructor() {
    super("Membership changed before the write");
    this.name = "MembershipChangedError";
  }
}

/**
 * The persistence boundary. The service depends on this, not on Drizzle, so
 * the spec can hand it a plain in-memory double: mocking the query-builder
 * chain call-by-call produces tests that pass against a broken WHERE clause.
 */
export interface GroupsStore {
  countActiveOwnedGroups(ownerId: string): Promise<number>;
  /**
   * Group row + owner membership row, committed together or not at all, with
   * the per-owner cap re-counted *inside* the same transaction. Throws
   * `GroupCapReachedError` when the owner is already at `limits.maxOwnedGroups`.
   */
  createGroupWithOwner(
    group: NewGroupRow,
    member: NewMemberRow,
    limits: { maxOwnedGroups: number },
  ): Promise<CommunityGroup>;
  findGroup(groupId: string): Promise<CommunityGroup | null>;
  updateGroup(
    groupId: string,
    patch: GroupPatch,
  ): Promise<CommunityGroup | null>;
  /** Browsable groups only: never archived, never past `expires_at`. */
  listGroups(filter: GroupListFilter): Promise<CommunityGroup[]>;
  listMembershipsForUser(userId: string): Promise<CommunityGroupMember[]>;
  findMembership(
    groupId: string,
    userId: string,
  ): Promise<CommunityGroupMember | null>;
  upsertMembership(
    member: NewMemberRow & { groupId: string },
  ): Promise<CommunityGroupMember>;
  /**
   * Upsert to `status: 'active'` and bump `member_count` in ONE transaction,
   * incrementing only when the row was not already active. Two statements would
   * let a double-tapped join count the same person twice against one row.
   */
  activateMembership(
    member: NewMemberRow & { groupId: string },
  ): Promise<CommunityGroupMember>;
  /**
   * Move one membership row to a new (role, status) inside ONE transaction
   * that, under a group-scoped advisory lock:
   *   - re-counts active owners when `requireSurvivingOwner` is set and throws
   *     `LastOwnerError` rather than stranding the group with nobody who can
   *     moderate or archive it;
   *   - adjusts `member_count` by exactly the change in "is this row active",
   *     so two concurrent removals of the same person decrement once, not twice.
   * The increment path (`activateMembership`) was already transactional; this is
   * the same treatment for every other transition.
   *
   * `expectedStatus` closes the last unlocked read: every caller decides what to
   * write from a membership row fetched OUTSIDE this transaction, so without it
   * a stale snapshot is written back verbatim under the lock. When set, the
   * in-lock row must still hold that status or `MembershipChangedError` is
   * raised and nothing is written.
   */
  transitionMembership(input: {
    groupId: string;
    userId: string;
    role: string;
    status: MembershipStatus;
    requireSurvivingOwner: boolean;
    expectedStatus?: MembershipStatus;
  }): Promise<CommunityGroupMember>;
  countActiveOwners(groupId: string): Promise<number>;
  upsertJoinRequest(
    groupId: string,
    userId: string,
    answers: unknown[],
  ): Promise<CommunityJoinRequest>;
  /** `null` means no such opportunity — distinct from an opportunity with no deadline. */
  findOpportunity(
    opportunityId: string,
  ): Promise<{ deadline: Date | null } | null>;
}

/** Token so Task 6's module can swap the store without touching the service. */
export const GROUPS_STORE = Symbol("GROUPS_STORE");

// ---------------------------------------------------------------------------
// Drizzle-backed store
// ---------------------------------------------------------------------------

export class DrizzleGroupsStore implements GroupsStore {
  async countActiveOwnedGroups(ownerId: string): Promise<number> {
    const [row] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(communityGroups)
      .where(
        and(
          eq(communityGroups.ownerId, ownerId),
          isNull(communityGroups.archivedAt),
        ),
      );
    return row?.value ?? 0;
  }

  async createGroupWithOwner(
    group: NewGroupRow,
    member: NewMemberRow,
    limits: { maxOwnedGroups: number },
  ): Promise<CommunityGroup> {
    // One transaction on purpose: the RLS helpers in
    // 20260803120000_community_groups.sql resolve "can administer" through an
    // active owner/mod membership row, so a group written without one is a
    // group its own creator cannot fully administer.
    return db.transaction(async (tx) => {
      // The cap is a check-then-insert, and a plain `count(*)` takes no lock, so
      // two concurrent creates would both read 1 and both insert. There is no
      // row to lock (the third group does not exist yet) and no partial unique
      // index can express "at most 2 rows per owner_id", so the serialisation
      // point is a transaction-scoped advisory lock keyed on the owner.
      // RESIDUAL RACE: hashtext() collisions merely serialise two unrelated
      // owners for the length of one insert — harmless. What this does NOT cover
      // is any writer that creates groups outside this method (none today); a
      // database-level close would need a counter column with a check
      // constraint, or a trigger, which belongs in a migration we cannot amend.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`community_group_cap:${group.ownerId}`}))`,
      );
      const [owned] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(communityGroups)
        .where(
          and(
            eq(communityGroups.ownerId, group.ownerId),
            isNull(communityGroups.archivedAt),
          ),
        );
      if ((owned?.value ?? 0) >= limits.maxOwnedGroups) {
        throw new GroupCapReachedError();
      }

      const [row] = await tx
        .insert(communityGroups)
        .values({
          slug: group.slug,
          name: group.name,
          description: group.description ?? null,
          opportunityId: group.opportunityId ?? null,
          ownerId: group.ownerId,
          visibility: group.visibility,
          joinPolicy: group.joinPolicy,
          coverEmoji: group.coverEmoji,
          expiresAt: group.expiresAt ?? null,
          memberCount: 1,
        })
        .returning();
      await tx.insert(communityGroupMembers).values({
        groupId: row.id,
        userId: member.userId,
        role: member.role,
        status: member.status,
      });
      return row;
    });
  }

  async findGroup(groupId: string): Promise<CommunityGroup | null> {
    const [row] = await db
      .select()
      .from(communityGroups)
      .where(eq(communityGroups.id, groupId))
      .limit(1);
    return row ?? null;
  }

  async updateGroup(
    groupId: string,
    patch: GroupPatch,
  ): Promise<CommunityGroup | null> {
    const [row] = await db
      .update(communityGroups)
      .set(patch)
      .where(eq(communityGroups.id, groupId))
      .returning();
    return row ?? null;
  }

  async listGroups(filter: GroupListFilter): Promise<CommunityGroup[]> {
    const conditions = [
      isNull(communityGroups.archivedAt),
      // `join` refuses a group whose deadline has passed, so leaving expired
      // groups in the browse feed would only advertise dead ends.
      sql`(${communityGroups.expiresAt} is null or ${communityGroups.expiresAt} > now())`,
    ];
    if (filter.opportunityId) {
      conditions.push(eq(communityGroups.opportunityId, filter.opportunityId));
    }
    if (filter.query?.trim()) {
      const pattern = `%${filter.query.trim()}%`;
      conditions.push(
        sql`(${communityGroups.name} ilike ${pattern} or ${communityGroups.description} ilike ${pattern})`,
      );
    }
    // Visibility filtered here rather than after the fetch, so the LIMIT counts
    // rows the caller can actually see.
    const visible = filter.visibleGroupIds ?? [];
    const isPublic = eq(communityGroups.visibility, "public");
    conditions.push(
      visible.length
        ? or(isPublic, inArray(communityGroups.id, visible))!
        : isPublic,
    );
    return db
      .select()
      .from(communityGroups)
      .where(and(...conditions))
      .orderBy(
        sql`${communityGroups.lastMessageAt} desc nulls last`,
        desc(communityGroups.createdAt),
      )
      .limit(Math.min(filter.limit ?? LIST_LIMIT, LIST_LIMIT));
  }

  async listMembershipsForUser(
    userId: string,
  ): Promise<CommunityGroupMember[]> {
    return db
      .select()
      .from(communityGroupMembers)
      .where(
        and(
          eq(communityGroupMembers.userId, userId),
          // 'invited' rides along so a future "your invitations" surface has
          // the rows; `list` itself still narrows to 'active' only.
          inArray(communityGroupMembers.status, [
            "active",
            "invited",
            "pending",
          ]),
        ),
      );
  }

  async findMembership(
    groupId: string,
    userId: string,
  ): Promise<CommunityGroupMember | null> {
    const [row] = await db
      .select()
      .from(communityGroupMembers)
      .where(
        and(
          eq(communityGroupMembers.groupId, groupId),
          eq(communityGroupMembers.userId, userId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async upsertMembership(
    member: NewMemberRow & { groupId: string },
  ): Promise<CommunityGroupMember> {
    const [row] = await db
      .insert(communityGroupMembers)
      .values({
        groupId: member.groupId,
        userId: member.userId,
        role: member.role,
        status: member.status,
      })
      .onConflictDoUpdate({
        target: [communityGroupMembers.groupId, communityGroupMembers.userId],
        set: { role: member.role, status: member.status },
      })
      .returning();
    return row;
  }

  async activateMembership(
    member: NewMemberRow & { groupId: string },
  ): Promise<CommunityGroupMember> {
    return db.transaction(async (tx) => {
      // FOR UPDATE so a double-tapped join serialises: the second transaction
      // waits, then reads status 'active' and returns without incrementing.
      const [existing] = await tx
        .select()
        .from(communityGroupMembers)
        .where(
          and(
            eq(communityGroupMembers.groupId, member.groupId),
            eq(communityGroupMembers.userId, member.userId),
          ),
        )
        .limit(1)
        .for("update");
      if (existing?.status === "active") return existing;

      const [row] = await tx
        .insert(communityGroupMembers)
        .values({
          groupId: member.groupId,
          userId: member.userId,
          role: member.role,
          status: "active",
        })
        .onConflictDoUpdate({
          target: [communityGroupMembers.groupId, communityGroupMembers.userId],
          set: { role: member.role, status: "active" },
        })
        .returning();
      await tx
        .update(communityGroups)
        .set({
          memberCount: sql`greatest(0, ${communityGroups.memberCount} + 1)`,
        })
        .where(eq(communityGroups.id, member.groupId));
      return row;
    });
  }

  async countActiveOwners(groupId: string): Promise<number> {
    const [row] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(communityGroupMembers)
      .where(
        and(
          eq(communityGroupMembers.groupId, groupId),
          eq(communityGroupMembers.role, "owner"),
          eq(communityGroupMembers.status, "active"),
        ),
      );
    return row?.value ?? 0;
  }

  async transitionMembership(input: {
    groupId: string;
    userId: string;
    role: string;
    status: MembershipStatus;
    requireSurvivingOwner: boolean;
    expectedStatus?: MembershipStatus;
  }): Promise<CommunityGroupMember> {
    return db.transaction(async (tx) => {
      // The owner count is a check-then-write over MANY rows, so FOR UPDATE on
      // the caller's own row is not enough: two different last-two owners
      // leaving concurrently lock different rows, both read 2, and both write
      // 'removed'. The serialisation point is therefore a transaction-scoped
      // advisory lock keyed on the group — the same pattern the per-owner group
      // cap uses in createGroupWithOwner. A zero-owner group is unrecoverable:
      // there is no unarchive and no ownership transfer, so nobody could ever
      // moderate or retire it again.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`community_group_members:${input.groupId}`}))`,
      );
      const [existing] = await tx
        .select()
        .from(communityGroupMembers)
        .where(
          and(
            eq(communityGroupMembers.groupId, input.groupId),
            eq(communityGroupMembers.userId, input.userId),
          ),
        )
        .limit(1)
        .for("update");

      // The caller read this row before the lock existed. If it moved in the
      // meantime, their whole decision is void: a promotion computed against an
      // `active` snapshot would write `status: 'active'` back over a row that
      // has since been left or banned, resurrecting the person as a mod while
      // member_count stays "correct", so nothing self-heals and nothing alerts.
      if (input.expectedStatus && existing?.status !== input.expectedStatus) {
        throw new MembershipChangedError();
      }

      if (input.requireSurvivingOwner) {
        // Counted BEFORE the write, so the row being changed is still included:
        // <= 1 means "this is the last active owner".
        const [owners] = await tx
          .select({ value: sql<number>`count(*)::int` })
          .from(communityGroupMembers)
          .where(
            and(
              eq(communityGroupMembers.groupId, input.groupId),
              eq(communityGroupMembers.role, "owner"),
              eq(communityGroupMembers.status, "active"),
            ),
          );
        if ((owners?.value ?? 0) <= 1) throw new LastOwnerError();
      }

      const wasActive = existing?.status === "active";
      const nowActive = input.status === "active";
      const [row] = await tx
        .insert(communityGroupMembers)
        .values({
          groupId: input.groupId,
          userId: input.userId,
          role: input.role,
          status: input.status,
        })
        .onConflictDoUpdate({
          target: [communityGroupMembers.groupId, communityGroupMembers.userId],
          set: { role: input.role, status: input.status },
        })
        .returning();

      if (wasActive !== nowActive) {
        // greatest(...) keeps the member_count >= 0 check constraint satisfied
        // even if an unrelated writer has already floored the counter.
        const delta = nowActive ? 1 : -1;
        await tx
          .update(communityGroups)
          .set({
            memberCount: sql`greatest(0, ${communityGroups.memberCount} + ${delta})`,
          })
          .where(eq(communityGroups.id, input.groupId));
      }
      return row;
    });
  }

  async upsertJoinRequest(
    groupId: string,
    userId: string,
    answers: unknown[],
  ): Promise<CommunityJoinRequest> {
    // community_join_requests carries `unique (group_id, user_id)` forever, so a
    // rejected applicant re-applying is an UPSERT back to pending — a blind
    // insert would hand them a raw 23505 instead of a second chance.
    const [row] = await db
      .insert(communityJoinRequests)
      .values({ groupId, userId, answers, status: "pending" })
      .onConflictDoUpdate({
        target: [communityJoinRequests.groupId, communityJoinRequests.userId],
        set: {
          answers,
          status: "pending",
          decidedBy: null,
          decidedAt: null,
          createdAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async findOpportunity(
    opportunityId: string,
  ): Promise<{ deadline: Date | null } | null> {
    // Returning the row (not just the deadline) is what lets `create` tell "no
    // such opportunity" apart from "opportunity with no deadline". Inserting a
    // dangling opportunity_id hits the FK and raises 23503, which would reach
    // the user as raw driver text.
    const [row] = await db
      .select({ deadline: opportunities.deadline })
      .from(opportunities)
      .where(eq(opportunities.id, opportunityId))
      .limit(1);
    return row ? { deadline: row.deadline ?? null } : null;
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);
  private readonly store: GroupsStore;

  constructor(@Optional() @Inject(GROUPS_STORE) store?: GroupsStore) {
    this.store = store ?? new DrizzleGroupsStore();
  }

  // -------------------------------------------------------------------------
  // Create / browse / read / update
  // -------------------------------------------------------------------------

  async create(userId: string, dto: CreateGroupDto): Promise<CommunityGroup> {
    const ownerId = this.requireUserId(userId);

    // Optimistic pre-check purely so the common case gets the friendly sentence
    // without opening a transaction; `createGroupWithOwner` re-counts under a
    // lock and is the authority.
    const owned = await this.store.countActiveOwnedGroups(ownerId);
    if (owned >= MAX_GROUPS_PER_USER) throw this.groupCapError();

    let expiresAt: Date | null = null;
    if (dto.opportunityId) {
      this.assertUuid(dto.opportunityId, "opportunity");
      const opportunity = await this.store.findOpportunity(dto.opportunityId);
      if (!opportunity) {
        throw new BadRequestException(
          "We couldn't find that opportunity, so we can't link a group to it.",
        );
      }
      // A group about a deadline outlives its usefulness the day the deadline
      // passes, so the group inherits it rather than lingering forever.
      expiresAt = opportunity.deadline;
    }

    const stem = this.slugStem(dto.name);
    const values: NewGroupRow = {
      slug: `${stem}-${this.slugSuffix()}`,
      name: dto.name,
      description: dto.description?.trim() || null,
      opportunityId: dto.opportunityId ?? null,
      ownerId,
      visibility: dto.visibility,
      joinPolicy: dto.joinPolicy,
      coverEmoji: dto.coverEmoji,
      expiresAt,
    };
    const owner: NewMemberRow = {
      userId: ownerId,
      role: "owner",
      status: "active",
    };

    const limits = { maxOwnedGroups: MAX_GROUPS_PER_USER };
    try {
      return await this.store.createGroupWithOwner(values, owner, limits);
    } catch (error) {
      if (error instanceof GroupCapReachedError) throw this.groupCapError();
      // The 6-char suffix collides about never; retrying once is cheaper than
      // a loop and turns the only realistic collision into a non-event.
      if (!this.isSlugConflict(error)) throw error;
      this.logger.warn(`Slug collision on "${values.slug}", retrying once`);
      try {
        return await this.store.createGroupWithOwner(
          { ...values, slug: `${stem}-${this.slugSuffix()}` },
          owner,
          limits,
        );
      } catch (retryError) {
        if (retryError instanceof GroupCapReachedError)
          throw this.groupCapError();
        if (!this.isSlugConflict(retryError)) throw retryError;
        throw new BadRequestException(
          "We couldn't create that group just now. Please try again.",
        );
      }
    }
  }

  /** Public groups, plus any group the caller already belongs to. */
  async list(
    userId: string,
    filter: GroupListFilter = {},
  ): Promise<CommunityGroup[]> {
    const memberships = await this.store.listMembershipsForUser(userId);
    const mine = new Set(
      memberships
        .filter((member) => member.status === "active")
        .map((member) => member.groupId),
    );
    // Handed to the store so the visibility rule and the 50-row cap are applied
    // by the same query: filtering afterwards returns a short page while more
    // public groups are still waiting behind the cap. The post-filter stays as
    // defence in depth for a store that ignores the hint.
    const rows = await this.store.listGroups({
      ...filter,
      visibleGroupIds: [...mine],
    });
    return rows.filter(
      (group) => group.visibility === "public" || mine.has(group.id),
    );
  }

  async get(
    userId: string,
    groupId: string,
  ): Promise<{
    group: CommunityGroup;
    membership: CommunityGroupMember | null;
  }> {
    const group = await this.requireGroup(groupId);
    const membership = await this.store.findMembership(groupId, userId);
    // The shared read rule — `MessagesService.list` calls the same function, so
    // the group and its messages cannot disagree about who may see them. See
    // community-authz.ts for why `invited` reads and `pending` does not.
    if (!canReadGroup(group, membership)) {
      throw new ForbiddenException(
        "This group is private. Ask an owner for an invite.",
      );
    }
    return { group, membership };
  }

  async update(
    userId: string,
    groupId: string,
    dto: UpdateGroupDto,
  ): Promise<CommunityGroup> {
    const group = await this.requireGroup(groupId);
    await this.assertCanAdminister(
      userId,
      group,
      "You're not allowed to change this group's settings.",
    );

    const patch: GroupPatch = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) {
      patch.description = dto.description.trim() || null;
    }
    if (dto.visibility !== undefined) patch.visibility = dto.visibility;
    if (dto.joinPolicy !== undefined) patch.joinPolicy = dto.joinPolicy;
    if (dto.coverEmoji !== undefined) patch.coverEmoji = dto.coverEmoji;

    const row = await this.store.updateGroup(groupId, patch);
    if (!row) throw new NotFoundException("That group was not found.");
    return row;
  }

  /**
   * Retire a group. Owner-only, and **one-way: archiving cannot be undone.**
   * There is deliberately no `unarchive` — that is a scope decision, not a
   * technical one (un-retiring would be strictly simpler than `create`: the same
   * capped re-count, none of the slug or opportunity work). Archiving is offered
   * as "for a group you're finished with", not as a park button, so every
   * message that mentions it says the door does not reopen. If product wants a
   * park button later, `unarchive` is a small method, not a rewrite.
   *
   * An archived group is read-only: it is excluded from `list`, from the cap
   * count, and `join` refuses it.
   */
  async archive(actorId: string, groupId: string): Promise<CommunityGroup> {
    const group = await this.requireGroup(groupId);
    await this.assertIsOwner(
      actorId,
      group,
      "Only an owner can archive this group.",
    );
    if (group.archivedAt) {
      throw new BadRequestException("This group is already archived.");
    }
    const row = await this.store.updateGroup(groupId, {
      archivedAt: new Date(),
    });
    if (!row) throw new NotFoundException("That group was not found.");
    return row;
  }

  // -------------------------------------------------------------------------
  // Membership
  // -------------------------------------------------------------------------

  async join(
    userId: string,
    groupId: string,
    answers: unknown[] = [],
  ): Promise<JoinResult> {
    const joinerId = this.requireUserId(userId);
    const group = await this.requireGroup(groupId);

    if (group.archivedAt) {
      throw new BadRequestException(
        "This group has been archived, so you can't join it.",
      );
    }
    if (group.expiresAt && group.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        "This group has closed because its deadline has passed.",
      );
    }

    const existing = await this.store.findMembership(groupId, joinerId);
    if (existing?.status === "banned") {
      throw new ForbiddenException("You can't join this group.");
    }
    if (existing?.status === "active") {
      return {
        status: "active",
        groupId,
        membership: existing,
        request: null,
      };
    }

    // ACCEPTING AN INVITATION. Honoured before any policy check and on any
    // group: on private it is the only way in, and on a public request-to-join
    // group it is what stops an invitation from silently degrading into "now go
    // apply and wait". The row can only have been written by `invite`, which is
    // gated on assertCanAdminister. `canSelfActivate` takes no group argument at
    // all, so no mutable column can widen this branch — see community-authz.ts.
    if (canSelfActivate(existing)) {
      const membership = await this.store.activateMembership({
        groupId,
        userId: joinerId,
        role: this.roleOnActivation(existing),
        status: "active",
      });
      return { status: "active", groupId, membership, request: null };
    }

    // THE PRIVATE RULE: a private group can never be self-joined, whatever its
    // join policy says and whatever rows it accumulated earlier in its life.
    // The mirror image of `canReadGroup` above — what cannot be read without an
    // invite cannot be joined without one. Reached only when `canSelfActivate`
    // said no, so the `pending` queue of a group that has since gone private
    // stops here rather than being auto-admitted.
    if (!canSelfJoinWithoutInvite(group)) {
      throw new ForbiddenException(
        "This group is private. Ask an owner for an invite.",
      );
    }

    if (group.joinPolicy === "request") {
      const request = await this.store.upsertJoinRequest(
        groupId,
        joinerId,
        answers,
      );
      const membership = await this.store.upsertMembership({
        groupId,
        userId: joinerId,
        role: this.roleOnActivation(existing),
        status: "pending",
      });
      return { status: "pending", groupId, membership, request };
    }

    // One call, one transaction: upserting the row and bumping member_count as
    // two statements lets a double-tapped join count one person twice.
    const membership = await this.store.activateMembership({
      groupId,
      userId: joinerId,
      role: this.roleOnActivation(existing),
      status: "active",
    });
    return { status: "active", groupId, membership, request: null };
  }

  /**
   * The owner action that lets someone into a group. Writes an `invited`
   * membership row the invitee converts by calling `join`; nothing is counted
   * against `member_count` until they actually accept.
   *
   * Allowed on public groups too, and it is not a no-op there: on a public
   * request-to-join group the `invited` row is what lets the invitee walk
   * straight in instead of joining the approval queue they were invited past.
   * On public+open it is a harmless pre-registration.
   */
  async invite(
    actorId: string,
    groupId: string,
    inviteeId: string,
  ): Promise<CommunityGroupMember> {
    const group = await this.requireGroup(groupId);
    await this.assertCanAdminister(
      actorId,
      group,
      "You're not allowed to invite people to this group.",
    );
    const invitee = this.requireUserId(inviteeId);
    if (group.archivedAt) {
      throw new BadRequestException(
        "This group has been archived, so you can't invite anyone to it.",
      );
    }
    // `join` refuses an expired group before it ever reaches the `invited`
    // branch, so an invitation written past the deadline is one the invitee is
    // told "this group has closed" for accepting. Refuse it at the source
    // rather than issuing an invitation that cannot be accepted.
    if (group.expiresAt && group.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        "This group has closed because its deadline has passed, so you can't invite anyone to it.",
      );
    }

    const existing = await this.store.findMembership(groupId, invitee);
    if (existing?.status === "active") return existing;
    if (existing?.status === "banned") {
      throw new BadRequestException(
        "That person is banned from this group. Unban them before inviting them back.",
      );
    }
    return this.store.upsertMembership({
      groupId,
      userId: invitee,
      role: this.roleOnActivation(existing),
      status: "invited",
    });
  }

  /**
   * Promote or demote a member between owner / mod / member. Owner-only, and
   * the group can never be left with nobody who can administer it.
   */
  async setMemberRole(
    actorId: string,
    groupId: string,
    targetUserId: string,
    role: MemberRole,
  ): Promise<CommunityGroupMember> {
    const group = await this.requireGroup(groupId);
    await this.assertIsOwner(
      actorId,
      group,
      "Only an owner can change what someone can do in this group.",
    );
    if (group.archivedAt) {
      throw new BadRequestException(
        "This group has been archived, so its roles can't be changed.",
      );
    }
    if (role !== "owner" && role !== "mod" && role !== "member") {
      throw new BadRequestException("Pick one of owner, moderator, or member.");
    }

    const target = await this.store.findMembership(groupId, targetUserId);
    if (!target || target.status === "removed" || target.status === "banned") {
      throw new NotFoundException("That person isn't in this group.");
    }
    if (target.role === role) return target;

    // Demoting an active owner is the only transition here that can strand the
    // group, so it is the only one that needs the locked re-count.
    const losesOwnership =
      target.role === "owner" && target.status === "active";
    if (target.role === "owner") {
      // community_groups.owner_id is NOT NULL and is the canonical record of
      // who made the group; there is no transfer, so demoting it would leave a
      // row whose owner_id points at somebody the roster calls a member.
      if (group.ownerId === targetUserId) {
        throw new BadRequestException(
          "You created this group, so you stay its owner. You can archive the group instead.",
        );
      }
      // Optimistic pre-check, purely for the friendly sentence; the store
      // re-counts under a lock and is the authority.
      if (
        losesOwnership &&
        (await this.store.countActiveOwners(groupId)) <= 1
      ) {
        throw this.lastOwnerDemoteError();
      }
    }

    try {
      return await this.store.transitionMembership({
        groupId,
        userId: targetUserId,
        role,
        status: target.status as MembershipStatus,
        // `target` was read without a lock, so the status above is a snapshot.
        // Pinning it makes the store refuse the write if the row moved — a
        // promotion racing the member's own `leave` would otherwise write the
        // stale 'active' back and hand a departed member moderator powers.
        expectedStatus: target.status as MembershipStatus,
        requireSurvivingOwner: losesOwnership,
      });
    } catch (error) {
      if (error instanceof LastOwnerError) throw this.lastOwnerDemoteError();
      if (error instanceof MembershipChangedError) {
        throw this.membershipChangedError();
      }
      throw error;
    }
  }

  /**
   * THE CREATOR CANNOT LEAVE; they archive instead.
   *
   * Three rules were possible once a departed creator turned out to be able to
   * neither administer the group (a `removed` row beats `owner_id` in
   * assertCanAdminister) nor stop it counting against their 2-group cap
   * (countActiveOwnedGroups counts by `owner_id`): stop counting groups whose
   * creator left, let `owner_id` keep the right to archive, or refuse the
   * departure. The third is chosen because it is the only one that keeps
   * `community_groups.owner_id` meaning one thing. Option 1 leaves a live group
   * with an absentee owner nobody can replace (there is no transfer); option 2
   * resurrects moderation powers for someone the roster says has left, which is
   * exactly the drift the `removed`-beats-`owner_id` rule exists to respect.
   * Refusing keeps the creator's slot always recoverable — archive is available
   * to them at any moment — and it is already how `setMemberRole` treats the
   * creator ("you stay its owner"), so the two now say the same thing.
   */
  async leave(userId: string, groupId: string): Promise<{ success: true }> {
    const group = await this.requireGroup(groupId);
    const membership = await this.store.findMembership(groupId, userId);
    // A WHITELIST, not "anything but removed". `banned` is a moderator's
    // decision and every other reader of it here (join, invite, setMemberRole,
    // assertCanAdminister) treats it as one; a denylist let a banned user
    // launder their own ban by "leaving" — the row went to `removed`, and
    // `join` then let them straight back in.
    if (membership?.status === "banned") {
      throw new ForbiddenException(
        "You've been banned from this group, so there's nothing to leave.",
      );
    }
    if (!membership || !isLiveMembershipStatus(membership.status)) {
      throw new BadRequestException("You're not a member of this group.");
    }

    if (group.ownerId === userId) {
      throw new BadRequestException(
        "You created this group, so you can't leave it. Archive it instead when you're finished — archiving can't be undone, and it frees up one of your group slots.",
      );
    }

    // Losing the last owner leaves a group nobody can administer, moderate, or
    // archive, so this is refused rather than silently orphaning it. Optimistic
    // pre-check for the friendly sentence; the store re-counts under a lock.
    if (membership.role === "owner" && membership.status === "active") {
      const owners = await this.store.countActiveOwners(groupId);
      if (owners <= 1) throw this.lastOwnerLeaveError();
    }

    await this.deactivate(groupId, userId, membership, "leave");
    return { success: true };
  }

  async removeMember(
    actorId: string,
    groupId: string,
    targetId: string,
  ): Promise<{ success: true }> {
    const group = await this.requireGroup(groupId);

    // Removing yourself is leaving, including the only-owner guard it carries.
    // Checked BEFORE the admin gate: an ordinary member asking to remove
    // themselves is asking to leave, and telling them they're "not allowed to
    // remove members" describes something they never asked to do.
    if (actorId === targetId) return this.leave(actorId, groupId);

    const actorRole = await this.assertCanAdminister(
      actorId,
      group,
      "You're not allowed to remove members from this group.",
    );

    const target = await this.store.findMembership(groupId, targetId);
    // Same whitelist as `leave`, for the same reason: on a denylist a mod could
    // "remove" a banned user, rewriting the ban to `removed` and letting them
    // rejoin — a moderator silently undoing an owner's ban.
    if (target?.status === "banned") {
      throw new BadRequestException(
        "That person is already banned from this group.",
      );
    }
    if (!target || !isLiveMembershipStatus(target.status)) {
      throw new NotFoundException("That person isn't in this group.");
    }
    if (target.role === "owner") {
      throw new ForbiddenException("You can't remove the group's owner.");
    }
    // Mods moderate members, not each other: letting one mod remove a peer
    // turns a moderation team into a race between whoever clicks first.
    if (target.role === "mod" && actorRole !== "owner") {
      throw new ForbiddenException(
        "Only an owner can remove another moderator.",
      );
    }

    await this.deactivate(groupId, targetId, target, "remove");
    return { success: true };
  }

  /**
   * The single write behind `leave` and `removeMember`. One transaction, under
   * the group lock: the row goes to `removed` and `member_count` moves by
   * exactly the change in "is this row active". Doing it as read-status →
   * upsert → adjust, the way this used to, let two concurrent removals of the
   * same person both read `active` and both decrement.
   */
  private async deactivate(
    groupId: string,
    userId: string,
    membership: CommunityGroupMember,
    kind: "leave" | "remove",
  ): Promise<void> {
    try {
      await this.store.transitionMembership({
        groupId,
        userId,
        role: membership.role,
        status: "removed",
        // Pinned for the same reason as setMemberRole: `membership` was read
        // before the lock, and a row that has since been banned must not be
        // rewritten to `removed` by a removal that was decided against the
        // older status.
        expectedStatus: membership.status as MembershipStatus,
        requireSurvivingOwner:
          membership.role === "owner" && membership.status === "active",
      });
    } catch (error) {
      if (error instanceof LastOwnerError) {
        throw kind === "leave"
          ? this.lastOwnerLeaveError()
          : this.lastOwnerDemoteError();
      }
      if (error instanceof MembershipChangedError) {
        throw this.membershipChangedError();
      }
      throw error;
    }
  }

  /** The membership row when it is active, otherwise null. */
  async activeMembership(
    userId: string,
    groupId: string,
  ): Promise<CommunityGroupMember | null> {
    const membership = await this.store.findMembership(groupId, userId);
    return membership?.status === "active" ? membership : null;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * ACCEPTED LEAK, not an oversight: this runs before every authz gate, so a
   * signed-in caller can tell "this private group exists" (403 "ask an owner
   * for an invite") from "no such group" (404) for any uuid they can guess.
   * Collapsing both to 404 would take the invite flow's one actionable sentence
   * away from every legitimate invitee who follows a share link before
   * accepting. The ids are random v4 uuids and are not enumerable, and the
   * response carries no name, roster, or message, so what leaks is one bit
   * about an unguessable id. Revisit if group ids ever become sequential or
   * derived from anything guessable.
   */
  private async requireGroup(groupId: string): Promise<CommunityGroup> {
    this.assertUuid(groupId, "group");
    const group = await this.store.findGroup(groupId);
    if (!group) throw new NotFoundException("That group was not found.");
    return group;
  }

  /**
   * The shared admin rule — `MessagesService.assertCanModerate` calls the same
   * function, so who may moderate a group and who may delete its messages
   * cannot drift apart. Returns the role the caller acted with; see
   * community-authz.ts for why `owner_id` and the membership row are both
   * authoritative and why a departure beats `owner_id`.
   */
  private async assertCanAdminister(
    userId: string,
    group: CommunityGroup,
    message: string,
  ): Promise<MemberRole> {
    const membership = await this.store.findMembership(group.id, userId);
    const role = resolveAdminRole(group, userId, membership);
    if (!role) throw new ForbiddenException(message);
    return role;
  }

  /** Owner-only gate for the two irreversible-ish powers: archive and roles. */
  private async assertIsOwner(
    userId: string,
    group: CommunityGroup,
    message: string,
  ): Promise<void> {
    const role = await this.assertCanAdminister(userId, group, message);
    if (role !== "owner") throw new ForbiddenException(message);
  }

  /**
   * The role an existing row keeps when it is activated or re-invited.
   *
   * A live row (`invited` / `pending`) keeps whatever role an owner gave it:
   * `setMemberRole` can promote an invitee before they accept, and flattening
   * that to "member" on acceptance would silently undo the owner's decision.
   * Anything else — no row at all, or a `removed` / `banned` one — starts again
   * as a plain member, so a former owner cannot get their powers back merely by
   * rejoining a public group.
   */
  private roleOnActivation(existing: CommunityGroupMember | null): string {
    if (existing?.status === "invited" || existing?.status === "pending") {
      return existing.role;
    }
    return "member";
  }

  private membershipChangedError(): BadRequestException {
    return new BadRequestException(
      "That person's membership changed while you were looking at it. Open the group again and retry.",
    );
  }

  private lastOwnerLeaveError(): BadRequestException {
    return new BadRequestException(
      "You're the only owner of this group. Make another member an owner first, or archive the group — archiving can't be undone.",
    );
  }

  private lastOwnerDemoteError(): BadRequestException {
    return new BadRequestException(
      "This group would be left with no owner. Make someone else an owner first.",
    );
  }

  private groupCapError(): BadRequestException {
    return new BadRequestException(
      `You can run ${MAX_GROUPS_PER_USER} active groups at a time. Archive one you've finished with — archiving can't be undone — before starting another.`,
    );
  }

  private slugStem(name: string): string {
    const stem = name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "");
    return stem || "group";
  }

  private slugSuffix(): string {
    return randomBytes(3).toString("hex");
  }

  /**
   * Specifically the slug unique index. `createGroupWithOwner` also inserts the
   * owner membership row, which carries `unique (group_id, user_id)`: retrying
   * *that* 23505 with a fresh slug would re-run a doomed insert and then report
   * a slug problem that never existed.
   */
  private isSlugConflict(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const pg = error as {
      code?: string;
      constraint?: string;
      detail?: string;
      message?: string;
    };
    if (pg.code !== "23505") return false;
    const where = `${pg.constraint ?? ""} ${pg.detail ?? ""} ${pg.message ?? ""}`;
    return /slug/i.test(where);
  }

  private requireUserId(userId: string): string {
    // Raw Clerk subject, never toDatabaseUserId: these columns are `text` and
    // the RLS policies compare them straight against auth.jwt() ->> 'sub'.
    const trimmed = (userId || "").trim();
    if (!trimmed) throw new BadRequestException("You need to be signed in.");
    return trimmed;
  }

  private assertUuid(value: string, label: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException(`That ${label} link isn't valid.`);
    }
  }
}
