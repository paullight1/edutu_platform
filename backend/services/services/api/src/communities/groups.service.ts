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
import type { CreateGroupDto, UpdateGroupDto } from "./dto/community.dto";

export type { CommunityGroup, CommunityGroupMember };
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

/**
 * The five membership states. `invited` and `pending` are DIFFERENT states on
 * purpose and the distinction is load-bearing:
 *
 *   invited  an owner/mod put this person here (`invite`). A standing decision
 *            to admit them, so accepting it activates the row whatever the
 *            group's visibility or join policy currently says.
 *   pending  the person put themselves here (`join` on a request-to-join
 *            group). Nobody has approved them; it is never self-activatable.
 *
 * The previous shape used one `pending` status for both and disambiguated by
 * reading `visibility`. `update` can set `visibility: 'private'`, so an owner
 * making a public request-to-join group private converted their entire unvetted
 * applicant queue into a guest list — every one of them could then "accept"
 * their own application. Making the two states distinct in the data model is
 * the only fix that does not depend on a mutable column.
 *
 * Only `active` is membership: `member_count`, `countActiveOwners`, and the RLS
 * helpers in 20260803120000_community_groups.sql all compare against `active`
 * alone, so adding a fifth status changes none of their meanings.
 */
export type MembershipStatus =
  | "active"
  | "invited"
  | "pending"
  | "removed"
  | "banned";

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

export type MemberRole = "owner" | "mod" | "member";

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
   */
  transitionMembership(input: {
    groupId: string;
    userId: string;
    role: string;
    status: MembershipStatus;
    requireSurvivingOwner: boolean;
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
    // `join` and `get` draw the same line: an `invited` row is an owner's
    // standing decision, so an invitee can read the group they were invited to —
    // being unable to see what you have been invited to would make the
    // invitation unusable. A `pending` row is an unapproved self-application and
    // buys nothing: applicants to a group that has since gone private are shut
    // out exactly like strangers.
    //
    // KNOWN DIVERGENCE FROM RLS: community_is_active_member() (see the
    // migration) admits 'active' only, so a client reading community_groups
    // directly through Supabase gets nothing for an invitee. That is deliberate
    // — an unaccepted invitation must not hand out a private group's roster or
    // messages — and it means the invite-preview screen must call this backend
    // endpoint, not Supabase.
    const invitedOrIn =
      membership?.status === "active" || membership?.status === "invited";
    if (group.visibility === "private" && !invitedOrIn) {
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

    // ACCEPTING AN INVITATION. An `invited` row is an owner's standing decision
    // to admit this person, so it is honoured before any policy check and on any
    // group: on private it is the only way in, and on a public request-to-join
    // group it is what stops an invitation from silently degrading into "now go
    // apply and wait". It can only have been written by `invite`, which is gated
    // on assertCanAdminister.
    if (existing?.status === "invited") {
      const membership = await this.store.activateMembership({
        groupId,
        userId: joinerId,
        role: this.roleOnActivation(existing),
        status: "active",
      });
      return { status: "active", groupId, membership, request: null };
    }

    // THE PRIVATE RULE: a private group can never be self-joined, whatever its
    // join policy says and whatever rows the group accumulated earlier in its
    // life. `visibility` and `joinPolicy` are independent enums, so private+open
    // is directly creatable, and group uuids travel in share links and deep
    // links — without this, anyone holding an id could walk straight past the
    // same wall `get` puts in front of them, and the backend runs as service_role
    // so RLS is not a second line of defence.
    //
    // A `pending` row explicitly does NOT open this door. It is an unapproved
    // self-application, and a group that was public+request before an owner
    // flipped it to private is carrying a queue of them: reading `pending` as
    // "invited" would auto-admit that entire queue the instant the owner asked
    // for more privacy — the exact opposite of what they asked for.
    if (group.visibility === "private") {
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
        requireSurvivingOwner: losesOwnership,
      });
    } catch (error) {
      if (error instanceof LastOwnerError) throw this.lastOwnerDemoteError();
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
    if (!membership || membership.status === "removed") {
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
    if (!target || target.status === "removed") {
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
        requireSurvivingOwner:
          membership.role === "owner" && membership.status === "active",
      });
    } catch (error) {
      if (error instanceof LastOwnerError) {
        throw kind === "leave"
          ? this.lastOwnerLeaveError()
          : this.lastOwnerDemoteError();
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

  private async requireGroup(groupId: string): Promise<CommunityGroup> {
    this.assertUuid(groupId, "group");
    const group = await this.store.findGroup(groupId);
    if (!group) throw new NotFoundException("That group was not found.");
    return group;
  }

  /**
   * Belt and braces, mirroring `community_is_owner_or_mod`: `owner_id` is the
   * canonical record, the membership row the operational one, and either alone
   * is enough so a drifted row never locks a real owner out. The one exception
   * is an explicit departure — a `removed` or `banned` row is a decision, not
   * drift, so it beats `owner_id`. Returns the role the caller acted with.
   *
   * `leave` refuses the creator outright and `removeMember` refuses any owner,
   * so no supported path can now produce a departed `owner_id` holder; this arm
   * is left in place for hand-edited rows. `invited` and `pending` are not
   * departures and are not administration either — neither satisfies the
   * `status === 'active'` test below.
   */
  private async assertCanAdminister(
    userId: string,
    group: CommunityGroup,
    message: string,
  ): Promise<MemberRole> {
    const membership = await this.store.findMembership(group.id, userId);
    const departed =
      membership?.status === "removed" || membership?.status === "banned";
    if (group.ownerId === userId && !departed) return "owner";
    const allowed =
      membership?.status === "active" &&
      (membership.role === "owner" || membership.role === "mod");
    if (!allowed) throw new ForbiddenException(message);
    return membership.role === "owner" ? "owner" : "mod";
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
