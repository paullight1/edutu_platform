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
  type AdminCurrentUser,
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

type SupabaseProfileRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  country: string | null;
  skills: string[] | null;
  credits_balance: number | null;
  creator_status: string | null;
  creator_metadata: Record<string, unknown> | null;
  creator_rejection_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
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

  async listUsers(
    adminUser: AdminActor,
    search?: string,
    role?: string,
  ): Promise<AdminUsersResponse> {
    const generatedAt = new Date().toISOString();
    const currentAdmin = this.toCurrentAdmin(adminUser);

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
        currentAdmin,
      };
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.warn(`Drizzle admin users query failed: ${message}`);

      const supabaseResponse = await this.listUsersFromSupabase(
        currentAdmin,
        generatedAt,
        search,
        role,
      );

      if (supabaseResponse) {
        return supabaseResponse;
      }

      this.logger.warn("Falling back to empty admin users payload.");
      return {
        success: false,
        source: "fallback",
        users: [],
        stats: this.emptyUserStats(),
        generatedAt,
        currentAdmin,
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
    const adminUserId = this.assertCanManageUsers(adminUser);

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
    const adminUserId = this.assertCanManageUsers(adminUser);

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

  private assertCanManageUsers(adminUser: AdminActor): string {
    const adminUserId = this.requireAdminActorId(adminUser);

    if (this.canManageUsers(adminUser)) {
      return adminUserId;
    }

    throw new ForbiddenException(
      "Only super admins can invite users or manage platform roles.",
    );
  }

  private canManageUsers(adminUser: AdminActor): boolean {
    const role = adminUser.role?.trim();
    const email = adminUser.email?.trim().toLowerCase();

    return (
      role === PROTECTED_ROLE ||
      Boolean(email && this.adminEmails().includes(email))
    );
  }

  private toCurrentAdmin(adminUser: AdminActor): AdminCurrentUser {
    return {
      userId: adminUser.id?.trim() || null,
      email: adminUser.email?.trim().toLowerCase() || null,
      role: adminUser.role?.trim() || "user",
      canManageUsers: this.canManageUsers(adminUser),
    };
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
      "admin@edutu.org,founder@edutu.org,nwosupaul3@gmail.com,nwouspaul3@gmail.com"
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
      this.logger.warn(`Drizzle admin dashboard query failed: ${message}`);

      const supabaseResponse = await this.getDashboardFromSupabase(generatedAt);

      if (supabaseResponse) {
        return supabaseResponse;
      }

      this.logger.warn("Falling back to empty admin dashboard payload.");
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

  private async listUsersFromSupabase(
    currentAdmin: AdminCurrentUser,
    generatedAt: string,
    search?: string,
    role?: string,
  ): Promise<AdminUsersResponse | null> {
    const supabase = this.getSupabaseAdminClient();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const normalizedUsers = (data || []).map((row) =>
        this.toUserRecordFromSupabase(row as SupabaseProfileRow),
      );
      const users = this.filterUsers(normalizedUsers, search, role);

      return {
        success: true,
        source: "database",
        users,
        stats: this.buildUserStats(normalizedUsers),
        generatedAt,
        currentAdmin,
      };
    } catch (error) {
      this.logger.warn(
        `Supabase admin users query failed: ${this.errorMessage(error)}`,
      );
      return null;
    }
  }

  private async getDashboardFromSupabase(
    generatedAt: string,
  ): Promise<AdminDashboardResponse | null> {
    const supabase = this.getSupabaseAdminClient();
    if (!supabase) return null;

    try {
      const weekAgo = new Date(Date.now() - WEEK_IN_MS);
      const weekAgoIso = weekAgo.toISOString();

      const [
        profilesResult,
        activeOpportunitiesResult,
        opportunitiesThisWeekResult,
        opportunityApplicationsResult,
        creatorApplicationsResult,
        recentOpportunitiesResult,
        recentApplicationsResult,
        recentCreatorApplicationsResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("opportunities")
          .select("*", { count: "exact", head: true })
          .eq("status", "active"),
        supabase
          .from("opportunities")
          .select("*", { count: "exact", head: true })
          .gte("created_at", weekAgoIso),
        supabase
          .from("opportunity_applications")
          .select("*", { count: "exact", head: true }),
        supabase
          .from("creator_applications")
          .select("*")
          .order("submitted_at", { ascending: false })
          .limit(10),
        supabase
          .from("opportunities")
          .select("id, title, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("opportunity_applications")
          .select("id, user_id, opportunity_id, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("creator_applications")
          .select("id, user_id, display_name, status, submitted_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(5),
      ]);

      const firstError = [
        profilesResult.error,
        activeOpportunitiesResult.error,
        opportunitiesThisWeekResult.error,
        opportunityApplicationsResult.error,
        creatorApplicationsResult.error,
        recentOpportunitiesResult.error,
        recentApplicationsResult.error,
        recentCreatorApplicationsResult.error,
      ].find(Boolean);

      if (firstError) throw firstError;

      const users = (profilesResult.data || []).map((row) =>
        this.toUserRecordFromSupabase(row as SupabaseProfileRow),
      );
      const creatorApplicationsData = creatorApplicationsResult.data || [];
      const recentOpportunities = recentOpportunitiesResult.data || [];
      const recentApplications = recentApplicationsResult.data || [];
      const recentCreatorApplications =
        recentCreatorApplicationsResult.data || [];

      const opportunityMap = new Map(
        recentOpportunities.map((opportunity) => [
          String(opportunity.id),
          String(opportunity.title || "Opportunity"),
        ]),
      );

      const activity = [
        ...users.slice(0, 5).map<AdminDashboardActivity>((user) => ({
          id: `user-${user.userId}`,
          type: "user",
          action: "New user registered",
          detail: user.email !== "No email" ? user.email : user.fullName,
          timestamp: user.createdAt,
        })),
        ...recentOpportunities.map<AdminDashboardActivity>((opportunity) => ({
          id: `opp-${opportunity.id}`,
          type: "opportunity",
          action: "New opportunity posted",
          detail: String(opportunity.title || "Opportunity"),
          timestamp: this.dateToIso(opportunity.created_at),
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
            detail: String(application.display_name || "Creator application"),
            timestamp: this.dateToIso(
              application.updated_at || application.submitted_at,
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
          activeOpportunities: activeOpportunitiesResult.count || 0,
          applications: opportunityApplicationsResult.count || 0,
          approvedCreators: users.filter(
            (user) => user.creatorStatus === "approved",
          ).length,
          pendingCreators: creatorApplicationsData.filter(
            (application) => application.status === "pending",
          ).length,
          newUsersThisWeek: users.filter(
            (user) => new Date(user.createdAt).getTime() >= weekAgo.getTime(),
          ).length,
          newOpportunitiesThisWeek: opportunitiesThisWeekResult.count || 0,
        },
        recentActivity: activity,
        generatedAt,
      };
    } catch (error) {
      this.logger.warn(
        `Supabase admin dashboard query failed: ${this.errorMessage(error)}`,
      );
      return null;
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

  private toUserRecordFromSupabase(row: SupabaseProfileRow): AdminUserRecord {
    const skills = Array.isArray(row.skills)
      ? row.skills.filter((skill): skill is string => Boolean(skill?.trim()))
      : [];

    return {
      userId: row.user_id,
      fullName: row.full_name?.trim() || "Anonymous User",
      email: row.email?.trim() || "No email",
      role: row.role?.trim() || "user",
      country: row.country?.trim() || null,
      skills,
      creditsBalance: Number(row.credits_balance ?? 0),
      creatorStatus: row.creator_status?.trim() || "none",
      creatorRejectionReason: row.creator_rejection_reason || null,
      creatorMetadata: this.toRecord(row.creator_metadata),
      createdAt: this.dateToIso(row.created_at),
      updatedAt: this.dateToIso(row.updated_at),
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
