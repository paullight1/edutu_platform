import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { ClerkClient } from "@clerk/clerk-sdk-node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq, desc, count, gte, sql } from "drizzle-orm";
import { AuditService } from "../common/audit";
import { db } from "../db";
import { creatorApplications, opportunities, profiles } from "../db/schema";
import {
  type AdminDashboardActivity,
  type AdminDashboardResponse,
  type AdminDashboardStats,
  type AdminInvitation,
  type AdminAssignableRole,
  type AdminInviteResponse,
  type AdminInviteUserDto,
  type AdminUpdateUserRoleDto,
  type AdminUpdateUserRoleResponse,
  type AdminUserRecord,
  type AdminUsersResponse,
  type AdminUsersStats,
} from "./admin.dto";

type ProfileRow = typeof profiles.$inferSelect;

export type AdminActor = {
  id?: string | null;
  email?: string | null;
  role?: string | null;
};

type OpportunityApplicationRow = {
  id: string;
  user_id: string | null;
  opportunity_id: string | null;
  created_at: string | Date | null;
};

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
const PROTECTED_ROLE = "super_admin";
const ROLE_METADATA_KEY = "role";

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private supabaseAdminClient: SupabaseClient | null | undefined;

  constructor(
    @Inject("ClerkClient") private readonly clerkClient: ClerkClient,
    private readonly auditService: AuditService,
  ) {}

  async listUsers(search?: string, role?: string): Promise<AdminUsersResponse> {
    const generatedAt = new Date().toISOString();

    try {
      const rows = await db
        .select()
        .from(profiles)
        .orderBy(desc(profiles.createdAt));

      const normalizedUsers = rows.map((row) => this.toUserRecord(row));
      const users = this.filterUsers(normalizedUsers, search, role);

      return {
        success: true,
        source: "database",
        users,
        stats: this.buildUserStats(normalizedUsers),
        generatedAt,
      };
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.warn(`Falling back to empty admin users payload: ${message}`);
      return {
        success: false,
        source: "fallback",
        users: [],
        stats: this.emptyUserStats(),
        generatedAt,
        error: "Unable to load users right now.",
      };
    }
  }

  async inviteUser(
    adminUser: AdminActor,
    dto: AdminInviteUserDto,
  ): Promise<AdminInviteResponse> {
    const emailAddress = dto.email.trim().toLowerCase();
    const assignedRole = dto.role || "user";
    const adminUserId =
      assignedRole === "user"
        ? this.requireAdminActorId(adminUser)
        : this.assertCanManageRoles(adminUser);

    try {
      const invitation = await this.clerkClient.invitations.createInvitation({
        emailAddress,
        notify: dto.notify ?? true,
        redirectUrl: dto.redirectUrl,
        ignoreExisting: true,
        ...(assignedRole !== "user"
          ? {
              publicMetadata: {
                [ROLE_METADATA_KEY]: assignedRole,
                invitedBy: adminUserId,
              },
            }
          : {}),
      });

      const updatedUser =
        assignedRole === "user"
          ? null
          : await this.updateExistingProfileRoleByEmail(
              adminUserId,
              emailAddress,
              assignedRole,
            );

      await Promise.all([
        this.syncClerkRoleByEmail(emailAddress, assignedRole),
        this.syncSupabaseRoleByEmail(emailAddress, assignedRole),
      ]);

      await this.auditService.log("user.invite", adminUserId, "user", {
        emailAddress,
        assignedRole,
        invitationId: invitation.id,
        status: invitation.status,
        url: invitation.url || null,
        updatedUserId: updatedUser?.userId || null,
      });

      return {
        success: true,
        invitation: this.toInvitation(invitation),
        assignedRole,
        updatedUser,
      };
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.warn(`Failed to create admin invitation: ${message}`);
      return {
        success: false,
        invitation: null,
        error: "Unable to create the invitation right now.",
      };
    }
  }

  async updateUserRole(
    adminUser: AdminActor,
    targetUserId: string,
    dto: AdminUpdateUserRoleDto,
  ): Promise<AdminUpdateUserRoleResponse> {
    const adminUserId = this.assertCanManageRoles(adminUser);

    try {
      const user = await this.updateProfileRole(
        adminUserId,
        targetUserId,
        dto.role,
      );

      return {
        success: true,
        user,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      const message = this.errorMessage(error);
      this.logger.warn(`Failed to update user role: ${message}`);
      return {
        success: false,
        user: null,
        error: "Unable to update this user's role right now.",
      };
    }
  }

  private assertCanManageRoles(adminUser: AdminActor): string {
    const adminUserId = this.requireAdminActorId(adminUser);
    const role = adminUser.role?.trim();
    const email = adminUser.email?.trim().toLowerCase();

    if (
      role === "admin" ||
      role === "super_admin" ||
      (email && this.adminEmails().includes(email))
    ) {
      return adminUserId;
    }

    throw new ForbiddenException("Only admins can assign platform roles.");
  }

  private requireAdminActorId(adminUser: AdminActor): string {
    const adminUserId = adminUser.id?.trim();
    if (!adminUserId) {
      throw new ForbiddenException("Authenticated admin context required.");
    }

    return adminUserId;
  }

  private adminEmails(): string[] {
    return (
      process.env.ADMIN_EMAILS ||
      "admin@edutu.ai,founder@edutu.ai,nwosupaul3@gmail.com,nwouspaul3@gmail.com"
    )
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
  }

  async getDashboard(): Promise<AdminDashboardResponse> {
    const generatedAt = new Date().toISOString();

    try {
      const weekAgo = new Date(Date.now() - WEEK_IN_MS);

      const [
        userRows,
        activeOpportunitiesResult,
        opportunityApplicationsResult,
        opportunitiesThisWeekResult,
        creatorApplicationRows,
        recentUsers,
        recentOpportunities,
        recentApplications,
        recentCreatorApplications,
      ] = await Promise.all([
        db.select().from(profiles).orderBy(desc(profiles.createdAt)),
        db
          .select({ count: count() })
          .from(opportunities)
          .where(eq(opportunities.status, "active")),
        db
          .select({ count: count() })
          .from(opportunities)
          .where(gte(opportunities.createdAt, weekAgo)),
        db.execute(sql`
          select count(*)::int as count
          from opportunity_applications
        `),
        db
          .select()
          .from(creatorApplications)
          .orderBy(desc(creatorApplications.submittedAt))
          .limit(10),
        db
          .select({
            userId: profiles.userId,
            fullName: profiles.fullName,
            email: profiles.email,
            createdAt: profiles.createdAt,
            creatorMetadata: profiles.creatorMetadata,
          })
          .from(profiles)
          .orderBy(desc(profiles.createdAt))
          .limit(5),
        db
          .select({
            id: opportunities.id,
            title: opportunities.title,
            createdAt: opportunities.createdAt,
          })
          .from(opportunities)
          .orderBy(desc(opportunities.createdAt))
          .limit(5),
        db
          .execute(
            sql`
          select id, user_id, opportunity_id, created_at
          from opportunity_applications
          order by created_at desc
          limit 5
        `,
          )
          .then((result) =>
            this.extractRows<OpportunityApplicationRow>(result),
          ),
        db
          .select({
            id: creatorApplications.id,
            userId: creatorApplications.userId,
            displayName: creatorApplications.displayName,
            status: creatorApplications.status,
            submittedAt: creatorApplications.submittedAt,
            updatedAt: creatorApplications.updatedAt,
          })
          .from(creatorApplications)
          .orderBy(desc(creatorApplications.updatedAt))
          .limit(5),
      ]);

      const users = userRows.map((row) => this.toUserRecord(row));
      const opportunityCount = this.extractCount(activeOpportunitiesResult);
      const opportunitiesThisWeek = this.extractCount(
        opportunitiesThisWeekResult,
      );
      const applicationsCount = this.extractCount(
        opportunityApplicationsResult,
      );
      const approvedCreators = users.filter(
        (user) => user.creatorStatus === "approved",
      ).length;
      const pendingCreators = creatorApplicationRows.filter(
        (application) => application.status === "pending",
      ).length;

      const opportunityMap = new Map(
        recentOpportunities.map((opportunity) => [
          opportunity.id,
          opportunity.title,
        ]),
      );

      const activity = [
        ...recentUsers.map<AdminDashboardActivity>((user) => ({
          id: `user-${user.userId}`,
          type: "user",
          action: "New user registered",
          detail: this.getUserActivityLabel(user),
          timestamp: this.dateToIso(user.createdAt),
        })),
        ...recentOpportunities.map<AdminDashboardActivity>((opportunity) => ({
          id: `opp-${opportunity.id}`,
          type: "opportunity",
          action: "New opportunity posted",
          detail: opportunity.title,
          timestamp: this.dateToIso(opportunity.createdAt),
        })),
        ...recentApplications.map<AdminDashboardActivity>((application) => ({
          id: `application-${application.id}`,
          type: "application",
          action: "New application submitted",
          detail:
            opportunityMap.get(String(application.opportunity_id)) ||
            "Opportunity application",
          timestamp: this.dateToIso(application.created_at),
        })),
        ...recentCreatorApplications.map<AdminDashboardActivity>(
          (application) => ({
            id: `creator-${application.id}`,
            type: "creator",
            action:
              application.status === "approved"
                ? "Creator approved"
                : application.status === "rejected"
                  ? "Creator rejected"
                  : "Creator application submitted",
            detail: application.displayName,
            timestamp: this.dateToIso(
              application.updatedAt || application.submittedAt,
            ),
          }),
        ),
      ]
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        .slice(0, 10);

      return {
        success: true,
        source: "database",
        stats: {
          totalUsers: users.length,
          activeOpportunities: opportunityCount,
          applications: applicationsCount,
          approvedCreators,
          pendingCreators,
          newUsersThisWeek: users.filter(
            (user) => new Date(user.createdAt).getTime() >= weekAgo.getTime(),
          ).length,
          newOpportunitiesThisWeek: opportunitiesThisWeek,
        },
        recentActivity: activity,
        generatedAt,
      };
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.warn(
        `Falling back to empty admin dashboard payload: ${message}`,
      );
      return {
        success: false,
        source: "fallback",
        stats: this.emptyDashboardStats(),
        recentActivity: [],
        generatedAt,
        error: "Dashboard data is temporarily unavailable.",
      };
    }
  }

  private async updateExistingProfileRoleByEmail(
    adminUserId: string,
    emailAddress: string,
    nextRole: AdminAssignableRole,
  ): Promise<AdminUserRecord | null> {
    const [existing] = await db
      .select()
      .from(profiles)
      .where(sql`lower(${profiles.email}) = ${emailAddress}`)
      .limit(1);

    if (!existing) {
      return null;
    }

    const updated = await this.applyRoleToProfile(
      adminUserId,
      existing,
      nextRole,
    );

    return this.toUserRecord(updated);
  }

  private async updateProfileRole(
    adminUserId: string,
    targetUserId: string,
    nextRole: AdminAssignableRole,
  ): Promise<AdminUserRecord> {
    const [existing] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, targetUserId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException("User profile not found");
    }

    const updated = await this.applyRoleToProfile(
      adminUserId,
      existing,
      nextRole,
    );

    await Promise.all([
      this.syncClerkRoleByEmail(updated.email, nextRole),
      this.syncSupabaseRoleByEmail(updated.email, nextRole),
    ]);

    return this.toUserRecord(updated);
  }

  private async applyRoleToProfile(
    adminUserId: string,
    profile: ProfileRow,
    nextRole: AdminAssignableRole,
  ): Promise<ProfileRow> {
    const previousRole = profile.role?.trim() || "user";

    if (previousRole === PROTECTED_ROLE) {
      throw new ForbiddenException(
        "Super admin roles must be managed manually.",
      );
    }

    if (previousRole === nextRole) {
      return profile;
    }

    const [updated] = await db
      .update(profiles)
      .set({
        role: nextRole,
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, profile.userId))
      .returning();

    if (!updated) {
      throw new NotFoundException("User profile not found");
    }

    await this.auditService.logUserRoleChange(
      adminUserId,
      profile.userId,
      previousRole,
      nextRole,
    );

    return updated;
  }

  private async syncClerkRoleByEmail(
    emailAddress: string | null | undefined,
    role: AdminAssignableRole,
  ): Promise<void> {
    const email = emailAddress?.trim().toLowerCase();
    if (!email) return;

    try {
      const clerkUsers = await this.clerkClient.users.getUserList({
        emailAddress: [email],
        limit: 10,
      });

      await Promise.all(
        clerkUsers.data.map((user) =>
          this.clerkClient.users.updateUserMetadata(user.id, {
            publicMetadata: {
              ...this.toRecord(user.publicMetadata),
              [ROLE_METADATA_KEY]: role,
            },
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Unable to sync Clerk role metadata for ${email}: ${this.errorMessage(error)}`,
      );
    }
  }

  private async syncSupabaseRoleByEmail(
    emailAddress: string | null | undefined,
    role: AdminAssignableRole,
  ): Promise<void> {
    const email = emailAddress?.trim().toLowerCase();
    const supabase = this.getSupabaseAdminClient();
    if (!email || !supabase) return;

    try {
      const { data, error } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (error) {
        throw error;
      }

      const matchingUsers = data.users.filter(
        (user) => user.email?.trim().toLowerCase() === email,
      );

      await Promise.all(
        matchingUsers.map(async (user) => {
          const { error: updateError } =
            await supabase.auth.admin.updateUserById(user.id, {
              app_metadata: {
                ...this.toRecord(user.app_metadata),
                [ROLE_METADATA_KEY]: role,
              },
            });

          if (updateError) {
            throw updateError;
          }
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Unable to sync Supabase app metadata for ${email}: ${this.errorMessage(error)}`,
      );
    }
  }

  private getSupabaseAdminClient(): SupabaseClient | null {
    if (this.supabaseAdminClient !== undefined) {
      return this.supabaseAdminClient;
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    this.supabaseAdminClient =
      url && key
        ? createClient(url, key, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          })
        : null;

    return this.supabaseAdminClient;
  }

  private filterUsers(
    users: AdminUserRecord[],
    search?: string,
    role?: string,
  ): AdminUserRecord[] {
    let filtered = [...users];

    if (search?.trim()) {
      const term = search.trim().toLowerCase();
      filtered = filtered.filter((user) => {
        const haystack = [
          user.fullName,
          user.email,
          user.country || "",
          user.role,
          user.creatorStatus,
          user.skills.join(" "),
          user.creditsBalance.toString(),
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(term);
      });
    }

    if (role && role !== "all") {
      filtered = filtered.filter((user) => user.role === role);
    }

    return filtered;
  }

  private toUserRecord(row: ProfileRow): AdminUserRecord {
    return {
      userId: row.userId,
      fullName: row.fullName?.trim() || "Anonymous User",
      email: row.email?.trim() || "No email",
      role: row.role?.trim() || "user",
      country: row.country?.trim() || null,
      skills: Array.isArray(row.skills)
        ? row.skills.filter((skill): skill is string => Boolean(skill?.trim()))
        : [],
      creditsBalance: Number(row.creditsBalance ?? 0),
      creatorStatus: row.creatorStatus?.trim() || "none",
      creatorRejectionReason: row.creatorRejectionReason || null,
      creatorMetadata: this.toRecord(row.creatorMetadata),
      createdAt: this.dateToIso(row.createdAt),
      updatedAt: this.dateToIso(row.updatedAt),
    };
  }

  private buildUserStats(users: AdminUserRecord[]): AdminUsersStats {
    const roleCounts = users.reduce<Record<string, number>>((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});

    const creatorStatusCounts = users.reduce<Record<string, number>>(
      (acc, user) => {
        acc[user.creatorStatus] = (acc[user.creatorStatus] || 0) + 1;
        return acc;
      },
      {},
    );

    const countryCounts = users.reduce<Record<string, number>>((acc, user) => {
      if (!user.country) return acc;
      acc[user.country] = (acc[user.country] || 0) + 1;
      return acc;
    }, {});

    const topCountry =
      Object.entries(countryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      "N/A";

    const totalCredits = users.reduce(
      (sum, user) => sum + Number(user.creditsBalance || 0),
      0,
    );

    return {
      total: users.length,
      roleCounts,
      creatorStatusCounts,
      newThisWeek: users.filter(
        (user) => new Date(user.createdAt).getTime() >= Date.now() - WEEK_IN_MS,
      ).length,
      countryCount: Object.keys(countryCounts).length,
      topCountry,
      totalCredits,
      averageCredits: users.length
        ? Math.round(totalCredits / users.length)
        : 0,
      profilesWithCountry: users.filter((user) => Boolean(user.country)).length,
      profilesWithSkills: users.filter((user) => user.skills.length > 0).length,
    };
  }

  private emptyUserStats(): AdminUsersStats {
    return {
      total: 0,
      roleCounts: {},
      creatorStatusCounts: {},
      newThisWeek: 0,
      countryCount: 0,
      topCountry: "N/A",
      totalCredits: 0,
      averageCredits: 0,
      profilesWithCountry: 0,
      profilesWithSkills: 0,
    };
  }

  private emptyDashboardStats(): AdminDashboardStats {
    return {
      totalUsers: 0,
      activeOpportunities: 0,
      applications: 0,
      approvedCreators: 0,
      pendingCreators: 0,
      newUsersThisWeek: 0,
      newOpportunitiesThisWeek: 0,
    };
  }

  private toInvitation(invitation: {
    id: string;
    emailAddress: string;
    status: string;
    url?: string;
    createdAt: number;
    updatedAt: number;
  }): AdminInvitation {
    return {
      id: invitation.id,
      emailAddress: invitation.emailAddress,
      status: invitation.status,
      url: invitation.url,
      createdAt: new Date(invitation.createdAt).toISOString(),
      updatedAt: new Date(invitation.updatedAt).toISOString(),
    };
  }

  private getUserActivityLabel(
    user: Pick<ProfileRow, "email" | "fullName">,
  ): string {
    if (user.email && user.email !== "No email") {
      return user.email;
    }

    if (user.fullName && user.fullName !== "Anonymous User") {
      return user.fullName;
    }

    return "Anonymous user";
  }

  private extractCount(result: unknown): number {
    const row = Array.isArray(result)
      ? (result[0] as Record<string, unknown> | undefined)
      : (result as { rows?: Array<Record<string, unknown>> })?.rows?.[0];
    if (!row) return 0;
    return Number(row.count ?? row.value ?? 0);
  }

  private extractRows<T>(result: unknown): T[] {
    if (Array.isArray(result)) {
      return result as T[];
    }
    const rows = (result as { rows?: T[] })?.rows;
    return Array.isArray(rows) ? rows : [];
  }

  private dateToIso(value: string | Date | null | undefined): string {
    if (!value) return new Date(0).toISOString();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime())
      ? new Date(0).toISOString()
      : date.toISOString();
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
