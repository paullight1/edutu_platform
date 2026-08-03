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
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
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

const LIST_LIMIT = 50;

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
};

export type JoinResult = {
  status: "active" | "pending";
  groupId: string;
  membership: CommunityGroupMember;
  request: CommunityJoinRequest | null;
};

/**
 * The persistence boundary. The service depends on this, not on Drizzle, so
 * the spec can hand it a plain in-memory double: mocking the query-builder
 * chain call-by-call produces tests that pass against a broken WHERE clause.
 */
export interface GroupsStore {
  countActiveOwnedGroups(ownerId: string): Promise<number>;
  /** Group row + owner membership row, committed together or not at all. */
  createGroupWithOwner(
    group: NewGroupRow,
    member: NewMemberRow,
  ): Promise<CommunityGroup>;
  findGroup(groupId: string): Promise<CommunityGroup | null>;
  updateGroup(
    groupId: string,
    patch: GroupPatch,
  ): Promise<CommunityGroup | null>;
  listGroups(filter: GroupListFilter): Promise<CommunityGroup[]>;
  listMembershipsForUser(userId: string): Promise<CommunityGroupMember[]>;
  findMembership(
    groupId: string,
    userId: string,
  ): Promise<CommunityGroupMember | null>;
  upsertMembership(
    member: NewMemberRow & { groupId: string },
  ): Promise<CommunityGroupMember>;
  countActiveOwners(groupId: string): Promise<number>;
  adjustMemberCount(groupId: string, delta: number): Promise<void>;
  upsertJoinRequest(
    groupId: string,
    userId: string,
    answers: unknown[],
  ): Promise<CommunityJoinRequest>;
  findOpportunityDeadline(opportunityId: string): Promise<Date | null>;
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
  ): Promise<CommunityGroup> {
    // One transaction on purpose: the RLS helpers in
    // 20260803120000_community_groups.sql resolve "can administer" through an
    // active owner/mod membership row, so a group written without one is a
    // group its own creator cannot fully administer.
    return db.transaction(async (tx) => {
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
    const conditions = [isNull(communityGroups.archivedAt)];
    if (filter.opportunityId) {
      conditions.push(eq(communityGroups.opportunityId, filter.opportunityId));
    }
    if (filter.query?.trim()) {
      const pattern = `%${filter.query.trim()}%`;
      conditions.push(
        sql`(${communityGroups.name} ilike ${pattern} or ${communityGroups.description} ilike ${pattern})`,
      );
    }
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
          inArray(communityGroupMembers.status, ["active", "pending"]),
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

  async adjustMemberCount(groupId: string, delta: number): Promise<void> {
    // greatest(...) keeps the member_count >= 0 check constraint satisfied even
    // if two removals race.
    await db
      .update(communityGroups)
      .set({
        memberCount: sql`greatest(0, ${communityGroups.memberCount} + ${delta})`,
      })
      .where(eq(communityGroups.id, groupId));
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

  async findOpportunityDeadline(opportunityId: string): Promise<Date | null> {
    const [row] = await db
      .select({ deadline: opportunities.deadline })
      .from(opportunities)
      .where(eq(opportunities.id, opportunityId))
      .limit(1);
    return row?.deadline ?? null;
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

    const owned = await this.store.countActiveOwnedGroups(ownerId);
    if (owned >= MAX_GROUPS_PER_USER) {
      throw new BadRequestException(
        `You can run ${MAX_GROUPS_PER_USER} active groups at a time — archive one before starting another.`,
      );
    }

    let expiresAt: Date | null = null;
    if (dto.opportunityId) {
      this.assertUuid(dto.opportunityId, "opportunity");
      // A group about a deadline outlives its usefulness the day the deadline
      // passes, so the group inherits it rather than lingering forever.
      expiresAt = await this.store.findOpportunityDeadline(dto.opportunityId);
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

    try {
      return await this.store.createGroupWithOwner(values, owner);
    } catch (error) {
      // The 6-char suffix collides about never; retrying once is cheaper than
      // a loop and turns the only realistic collision into a non-event.
      if (!this.isUniqueViolation(error)) throw error;
      this.logger.warn(`Slug collision on "${values.slug}", retrying once`);
      try {
        return await this.store.createGroupWithOwner(
          { ...values, slug: `${stem}-${this.slugSuffix()}` },
          owner,
        );
      } catch (retryError) {
        if (!this.isUniqueViolation(retryError)) throw retryError;
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
    const rows = await this.store.listGroups(filter);
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
    if (group.visibility === "private" && membership?.status !== "active") {
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

    if (group.joinPolicy === "request") {
      const request = await this.store.upsertJoinRequest(
        groupId,
        joinerId,
        answers,
      );
      const membership = await this.store.upsertMembership({
        groupId,
        userId: joinerId,
        role: existing?.role === "mod" ? "mod" : "member",
        status: "pending",
      });
      return { status: "pending", groupId, membership, request };
    }

    const membership = await this.store.upsertMembership({
      groupId,
      userId: joinerId,
      role: existing?.role === "mod" ? "mod" : "member",
      status: "active",
    });
    await this.store.adjustMemberCount(groupId, 1);
    return { status: "active", groupId, membership, request: null };
  }

  async leave(userId: string, groupId: string): Promise<{ success: true }> {
    await this.requireGroup(groupId);
    const membership = await this.store.findMembership(groupId, userId);
    if (!membership || membership.status === "removed") {
      throw new BadRequestException("You're not a member of this group.");
    }

    // Losing the last owner leaves a group nobody can administer, moderate, or
    // archive, so this is refused rather than silently orphaning it.
    if (membership.role === "owner") {
      const owners = await this.store.countActiveOwners(groupId);
      if (owners <= 1) {
        throw new BadRequestException(
          "You're the only owner of this group. Make someone else an owner, or archive the group instead.",
        );
      }
    }

    // Read before writing: the count only moves for someone who was actually
    // counted, and re-reading the row after the update would see "removed".
    const wasCounted = membership.status === "active";
    await this.store.upsertMembership({
      groupId,
      userId,
      role: membership.role,
      status: "removed",
    });
    if (wasCounted) await this.store.adjustMemberCount(groupId, -1);
    return { success: true };
  }

  async removeMember(
    actorId: string,
    groupId: string,
    targetId: string,
  ): Promise<{ success: true }> {
    const group = await this.requireGroup(groupId);
    await this.assertCanAdminister(
      actorId,
      group,
      "You're not allowed to remove members from this group.",
    );

    // Removing yourself is leaving, including the only-owner guard it carries.
    if (actorId === targetId) return this.leave(actorId, groupId);

    const target = await this.store.findMembership(groupId, targetId);
    if (!target || target.status === "removed") {
      throw new NotFoundException("That person isn't in this group.");
    }
    if (target.role === "owner") {
      throw new ForbiddenException("You can't remove the group's owner.");
    }

    const wasCounted = target.status === "active";
    await this.store.upsertMembership({
      groupId,
      userId: targetId,
      role: target.role,
      status: "removed",
    });
    if (wasCounted) await this.store.adjustMemberCount(groupId, -1);
    return { success: true };
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
   * is enough so a drifted row never locks a real owner out.
   */
  private async assertCanAdminister(
    userId: string,
    group: CommunityGroup,
    message: string,
  ): Promise<void> {
    if (group.ownerId === userId) return;
    const membership = await this.store.findMembership(group.id, userId);
    const allowed =
      membership?.status === "active" &&
      (membership.role === "owner" || membership.role === "mod");
    if (!allowed) throw new ForbiddenException(message);
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

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "23505"
    );
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
