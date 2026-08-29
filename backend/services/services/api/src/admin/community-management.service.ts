import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { AuditService } from "../common/audit";
import { db } from "../db";
import {
  communityCreationRequests,
  communityGroupMembers,
  communityGroups,
  opportunities,
  type CommunityCreationRequest,
  type CommunityGroup,
} from "../db/schema";
import { MAX_GROUPS_PER_USER } from "../communities/groups.service";
import type {
  AdminCreateCommunityDto,
  AdminUpdateCommunityDto,
} from "./community-management.dto";

export class CommunityApprovalLimitError extends Error {
  constructor() {
    super("Community approval limit reached");
    this.name = "CommunityApprovalLimitError";
  }
}

export class CommunityManagementStateError extends Error {
  constructor() {
    super("Community management state changed");
    this.name = "CommunityManagementStateError";
  }
}

export class CommunityTrendingEligibilityError extends Error {
  constructor() {
    super("Community is not eligible for Trending");
    this.name = "CommunityTrendingEligibilityError";
  }
}

export type CommunityManagementSummary = {
  active: number;
  pending: number;
  trending: number;
  creatorsAtLimit: number;
};

export type AdminCommunityGroupFilter = {
  query?: string;
  status?: "all" | "active" | "archived";
  visibility?: "all" | "public" | "private";
  scope?: "all" | "member" | "platform";
  trending?: boolean;
  limit?: number;
};

export interface AdminCommunityManagementStore {
  listGroups(filter: AdminCommunityGroupFilter): Promise<CommunityGroup[]>;
  listCreationRequests(
    status: "all" | "pending" | "approved" | "rejected" | "cancelled",
    limit: number,
  ): Promise<CommunityCreationRequest[]>;
  getSummary(): Promise<CommunityManagementSummary>;
  approveRequest(
    requestId: string,
    reviewerId: string,
    limit: number,
  ): Promise<{ request: CommunityCreationRequest; group: CommunityGroup }>;
  rejectRequest(
    requestId: string,
    reviewerId: string,
    reason: string,
  ): Promise<CommunityCreationRequest>;
  createPlatformGroup(
    actorId: string,
    dto: AdminCreateCommunityDto,
  ): Promise<CommunityGroup>;
  updateGroup(
    groupId: string,
    dto: AdminUpdateCommunityDto,
  ): Promise<CommunityGroup>;
  archiveGroup(groupId: string): Promise<CommunityGroup>;
  restoreGroup(groupId: string, limit: number): Promise<CommunityGroup>;
  listTrending(): Promise<CommunityGroup[]>;
  replaceTrending(groupIds: string[]): Promise<CommunityGroup[]>;
}

export const ADMIN_COMMUNITY_MANAGEMENT_STORE = Symbol(
  "ADMIN_COMMUNITY_MANAGEMENT_STORE",
);

export class DrizzleAdminCommunityManagementStore implements AdminCommunityManagementStore {
  async listGroups(
    filter: AdminCommunityGroupFilter,
  ): Promise<CommunityGroup[]> {
    const conditions: SQL[] = [];
    if (filter.query?.trim()) {
      const pattern = `%${filter.query.trim()}%`;
      conditions.push(
        or(
          ilike(communityGroups.name, pattern),
          ilike(communityGroups.description, pattern),
          ilike(communityGroups.ownerId, pattern),
        )!,
      );
    }
    if (filter.status === "active")
      conditions.push(isNull(communityGroups.archivedAt));
    if (filter.status === "archived")
      conditions.push(isNotNull(communityGroups.archivedAt));
    if (filter.visibility && filter.visibility !== "all") {
      conditions.push(eq(communityGroups.visibility, filter.visibility));
    }
    if (filter.scope && filter.scope !== "all") {
      conditions.push(eq(communityGroups.managementScope, filter.scope));
    }
    if (filter.trending)
      conditions.push(isNotNull(communityGroups.trendingRank));

    return db
      .select()
      .from(communityGroups)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(communityGroups.createdAt), desc(communityGroups.id))
      .limit(Math.min(Math.max(filter.limit ?? 100, 1), 200));
  }

  async listCreationRequests(
    status: "all" | "pending" | "approved" | "rejected" | "cancelled",
    limit: number,
  ): Promise<CommunityCreationRequest[]> {
    return db
      .select()
      .from(communityCreationRequests)
      .where(
        status === "all"
          ? undefined
          : eq(communityCreationRequests.status, status),
      )
      .orderBy(
        sql`case when ${communityCreationRequests.status} = 'pending' then 0 else 1 end`,
        asc(communityCreationRequests.createdAt),
      )
      .limit(Math.min(Math.max(limit, 1), 200));
  }

  async getSummary(): Promise<CommunityManagementSummary> {
    const [[active], [pending], [trending], owners] = await Promise.all([
      db
        .select({ value: count() })
        .from(communityGroups)
        .where(isNull(communityGroups.archivedAt)),
      db
        .select({ value: count() })
        .from(communityCreationRequests)
        .where(eq(communityCreationRequests.status, "pending")),
      db
        .select({ value: count() })
        .from(communityGroups)
        .where(isNotNull(communityGroups.trendingRank)),
      db
        .select({ ownerId: communityGroups.ownerId, value: count() })
        .from(communityGroups)
        .where(
          and(
            eq(communityGroups.managementScope, "member"),
            isNull(communityGroups.archivedAt),
          ),
        )
        .groupBy(communityGroups.ownerId)
        .having(sql`count(*) >= ${MAX_GROUPS_PER_USER}`),
    ]);
    return {
      active: Number(active?.value ?? 0),
      pending: Number(pending?.value ?? 0),
      trending: Number(trending?.value ?? 0),
      creatorsAtLimit: owners.length,
    };
  }

  async approveRequest(
    requestId: string,
    reviewerId: string,
    limit: number,
  ): Promise<{ request: CommunityCreationRequest; group: CommunityGroup }> {
    return db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(communityCreationRequests)
        .where(eq(communityCreationRequests.id, requestId))
        .for("update")
        .limit(1);
      if (!request) throw new NotFoundException("Community request not found.");
      if (request.status === "approved" && request.approvedGroupId) {
        const [group] = await tx
          .select()
          .from(communityGroups)
          .where(eq(communityGroups.id, request.approvedGroupId))
          .limit(1);
        if (group) return { request, group };
      }
      if (request.status !== "pending") {
        throw new CommunityManagementStateError();
      }

      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`community_creation_slots:${request.requesterId}`}))`,
      );
      const [owned] = await tx
        .select({ value: count() })
        .from(communityGroups)
        .where(
          and(
            eq(communityGroups.ownerId, request.requesterId),
            eq(communityGroups.managementScope, "member"),
            isNull(communityGroups.archivedAt),
          ),
        );
      if (Number(owned?.value ?? 0) >= limit) {
        throw new CommunityApprovalLimitError();
      }

      let expiresAt: Date | null = null;
      if (request.opportunityId) {
        const [opportunity] = await tx
          .select({ deadline: opportunities.deadline })
          .from(opportunities)
          .where(eq(opportunities.id, request.opportunityId))
          .limit(1);
        expiresAt = opportunity?.deadline ?? null;
      }

      const [group] = await tx
        .insert(communityGroups)
        .values({
          slug: this.slug(request.name),
          name: request.name,
          description: request.description,
          opportunityId: request.opportunityId,
          ownerId: request.requesterId,
          visibility: request.visibility,
          joinPolicy: request.joinPolicy,
          coverEmoji: request.coverEmoji,
          coverImageResourceUrl: request.coverImageResourceUrl,
          expiresAt,
          managementScope: "member",
          memberCount: 1,
        })
        .returning();
      await tx.insert(communityGroupMembers).values({
        groupId: group.id,
        userId: request.requesterId,
        role: "owner",
        status: "active",
      });
      const [approved] = await tx
        .update(communityCreationRequests)
        .set({
          status: "approved",
          approvedGroupId: group.id,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(communityCreationRequests.id, request.id),
            eq(communityCreationRequests.status, "pending"),
          ),
        )
        .returning();
      if (!approved) throw new CommunityManagementStateError();
      return { request: approved, group };
    });
  }

  async rejectRequest(
    requestId: string,
    reviewerId: string,
    reason: string,
  ): Promise<CommunityCreationRequest> {
    const [request] = await db
      .update(communityCreationRequests)
      .set({
        status: "rejected",
        reviewReason: reason,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(communityCreationRequests.id, requestId),
          eq(communityCreationRequests.status, "pending"),
        ),
      )
      .returning();
    if (!request) throw new CommunityManagementStateError();
    return request;
  }

  async createPlatformGroup(
    actorId: string,
    dto: AdminCreateCommunityDto,
  ): Promise<CommunityGroup> {
    return db.transaction(async (tx) => {
      const [group] = await tx
        .insert(communityGroups)
        .values({
          slug: this.slug(dto.name),
          name: dto.name,
          description: dto.description?.trim() || null,
          opportunityId: dto.opportunityId ?? null,
          ownerId: actorId,
          visibility: dto.visibility,
          joinPolicy: dto.joinPolicy,
          coverEmoji: dto.coverEmoji,
          managementScope: "platform",
          memberCount: 1,
        })
        .returning();
      await tx.insert(communityGroupMembers).values({
        groupId: group.id,
        userId: actorId,
        role: "owner",
        status: "active",
      });
      return group;
    });
  }

  async updateGroup(
    groupId: string,
    dto: AdminUpdateCommunityDto,
  ): Promise<CommunityGroup> {
    const patch: Record<string, unknown> = { ...dto, updatedAt: new Date() };
    if (dto.description !== undefined) {
      patch.description = dto.description.trim() || null;
    }
    if (dto.visibility === "private") patch.trendingRank = null;
    const [group] = await db
      .update(communityGroups)
      .set(patch)
      .where(eq(communityGroups.id, groupId))
      .returning();
    if (!group) throw new NotFoundException("Community not found.");
    return group;
  }

  async archiveGroup(groupId: string): Promise<CommunityGroup> {
    const [group] = await db
      .update(communityGroups)
      .set({
        archivedAt: new Date(),
        trendingRank: null,
        updatedAt: new Date(),
      })
      .where(eq(communityGroups.id, groupId))
      .returning();
    if (!group) throw new NotFoundException("Community not found.");
    return group;
  }

  async restoreGroup(groupId: string, limit: number): Promise<CommunityGroup> {
    return db.transaction(async (tx) => {
      const [group] = await tx
        .select()
        .from(communityGroups)
        .where(eq(communityGroups.id, groupId))
        .for("update")
        .limit(1);
      if (!group) throw new NotFoundException("Community not found.");
      if (!group.archivedAt) return group;
      if (group.managementScope === "member") {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`community_creation_slots:${group.ownerId}`}))`,
        );
        const [owned] = await tx
          .select({ value: count() })
          .from(communityGroups)
          .where(
            and(
              eq(communityGroups.ownerId, group.ownerId),
              eq(communityGroups.managementScope, "member"),
              isNull(communityGroups.archivedAt),
            ),
          );
        if (Number(owned?.value ?? 0) >= limit) {
          throw new CommunityApprovalLimitError();
        }
      }
      const [restored] = await tx
        .update(communityGroups)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(eq(communityGroups.id, group.id))
        .returning();
      return restored;
    });
  }

  async listTrending(): Promise<CommunityGroup[]> {
    return db
      .select()
      .from(communityGroups)
      .where(isNotNull(communityGroups.trendingRank))
      .orderBy(asc(communityGroups.trendingRank), asc(communityGroups.id));
  }

  async replaceTrending(groupIds: string[]): Promise<CommunityGroup[]> {
    return db.transaction(async (tx) => {
      const selected = groupIds.length
        ? await tx
            .select()
            .from(communityGroups)
            .where(inArray(communityGroups.id, groupIds))
        : [];
      if (selected.length !== groupIds.length) {
        throw new CommunityTrendingEligibilityError();
      }
      const now = Date.now();
      if (
        selected.some(
          (group) =>
            group.visibility !== "public" ||
            group.archivedAt !== null ||
            (group.expiresAt !== null && group.expiresAt.getTime() <= now),
        )
      ) {
        throw new CommunityTrendingEligibilityError();
      }

      await tx
        .update(communityGroups)
        .set({ trendingRank: null, updatedAt: new Date() })
        .where(isNotNull(communityGroups.trendingRank));
      const ordered: CommunityGroup[] = [];
      for (const [index, id] of groupIds.entries()) {
        const [group] = await tx
          .update(communityGroups)
          .set({ trendingRank: index + 1, updatedAt: new Date() })
          .where(eq(communityGroups.id, id))
          .returning();
        ordered.push(group);
      }
      return ordered;
    });
  }

  private slug(name: string): string {
    const stem =
      name
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "community";
    return `${stem}-${randomBytes(3).toString("hex")}`;
  }
}

@Injectable()
export class AdminCommunityManagementService {
  private readonly store: AdminCommunityManagementStore;

  constructor(
    @Optional()
    @Inject(ADMIN_COMMUNITY_MANAGEMENT_STORE)
    store: AdminCommunityManagementStore | undefined,
    private readonly audit: AuditService,
  ) {
    this.store = store ?? new DrizzleAdminCommunityManagementStore();
  }

  async listGroups(filter: AdminCommunityGroupFilter = {}) {
    const [groups, summary] = await Promise.all([
      this.store.listGroups(filter),
      this.store.getSummary(),
    ]);
    return { groups, summary, generatedAt: new Date().toISOString() };
  }

  async listRequests(
    status:
      | "all"
      | "pending"
      | "approved"
      | "rejected"
      | "cancelled" = "pending",
    limit = 100,
  ) {
    return {
      requests: await this.store.listCreationRequests(status, limit),
      status,
      generatedAt: new Date().toISOString(),
    };
  }

  async approve(adminId: string, requestId: string) {
    try {
      const result = await this.store.approveRequest(
        requestId,
        adminId,
        MAX_GROUPS_PER_USER,
      );
      await this.audit.log(
        "community.creation_request.approve",
        adminId,
        "community_creation_request",
        { resourceId: requestId, groupId: result.group.id },
      );
      return result;
    } catch (error) {
      this.translateConflict(error, false);
    }
  }

  async reject(adminId: string, requestId: string, reason: string) {
    const normalized = reason.trim();
    try {
      const request = await this.store.rejectRequest(
        requestId,
        adminId,
        normalized,
      );
      await this.audit.log(
        "community.creation_request.reject",
        adminId,
        "community_creation_request",
        { resourceId: requestId, reason: normalized },
      );
      return request;
    } catch (error) {
      this.translateConflict(error, false);
    }
  }

  async create(adminId: string, dto: AdminCreateCommunityDto) {
    const group = await this.store.createPlatformGroup(adminId, dto);
    await this.audit.log(
      "community.group.create_platform",
      adminId,
      "community_group",
      { resourceId: group.id, name: group.name },
    );
    return group;
  }

  async update(adminId: string, groupId: string, dto: AdminUpdateCommunityDto) {
    const group = await this.store.updateGroup(groupId, dto);
    await this.audit.log("community.group.update", adminId, "community_group", {
      resourceId: groupId,
      changes: Object.keys(dto),
    });
    return group;
  }

  async archive(adminId: string, groupId: string) {
    const group = await this.store.archiveGroup(groupId);
    await this.audit.log(
      "community.group.archive",
      adminId,
      "community_group",
      { resourceId: groupId },
    );
    return group;
  }

  async restore(adminId: string, groupId: string) {
    try {
      const group = await this.store.restoreGroup(groupId, MAX_GROUPS_PER_USER);
      await this.audit.log(
        "community.group.restore",
        adminId,
        "community_group",
        { resourceId: groupId },
      );
      return group;
    } catch (error) {
      this.translateConflict(error, true);
    }
  }

  listTrending() {
    return this.store.listTrending();
  }

  async replaceTrending(adminId: string, groupIds: string[]) {
    if (new Set(groupIds).size !== groupIds.length) {
      throw new BadRequestException(
        "A community can appear in Trending only once.",
      );
    }
    try {
      const groups = await this.store.replaceTrending(groupIds);
      await this.audit.log(
        "community.trending.replace",
        adminId,
        "community_group",
        { groupIds },
      );
      return groups;
    } catch (error) {
      if (error instanceof CommunityTrendingEligibilityError) {
        throw new BadRequestException({
          statusCode: 400,
          code: "COMMUNITY_TRENDING_INELIGIBLE",
          message:
            "Trending can include only active, public, unexpired communities.",
        });
      }
      throw error;
    }
  }

  private translateConflict(error: unknown, restore: boolean): never {
    if (error instanceof CommunityApprovalLimitError) {
      throw new ConflictException({
        statusCode: 409,
        code: restore
          ? "COMMUNITY_RESTORE_LIMIT_REACHED"
          : "COMMUNITY_CREATION_LIMIT_REACHED",
        message: restore
          ? "Restoring this community would give its creator more than two active communities."
          : "This creator already has two active communities.",
      });
    }
    if (error instanceof CommunityManagementStateError) {
      throw new ConflictException({
        statusCode: 409,
        code: "COMMUNITY_REQUEST_STATE_CHANGED",
        message:
          "This community request already changed. Refresh and try again.",
      });
    }
    throw error;
  }
}
