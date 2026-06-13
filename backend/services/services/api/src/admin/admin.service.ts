import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ClerkClient } from "@clerk/clerk-sdk-node";
import { eq, desc, count, gte, sql } from "drizzle-orm";
import { AuditService } from "../common/audit";
import { db } from "../db";
import { creatorApplications, opportunities, profiles } from "../db/schema";
import {
  type AdminDashboardActivity,
  type AdminDashboardResponse,
  type AdminDashboardStats,
  type AdminInvitation,
  type AdminInviteResponse,
  type AdminInviteUserDto,
  type AdminUserRecord,
  type AdminUsersResponse,
  type AdminUsersStats,
} from "./admin.dto";

type ProfileRow = typeof profiles.$inferSelect;

type OpportunityApplicationRow = {
  id: string;
  user_id: string | null;
  opportunity_id: string | null;
  created_at: string | Date | null;
};

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

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
    adminUserId: string,
    dto: AdminInviteUserDto,
  ): Promise<AdminInviteResponse> {
    const emailAddress = dto.email.trim().toLowerCase();

    try {
      const invitation = await this.clerkClient.invitations.createInvitation({
        emailAddress,
        notify: dto.notify ?? true,
        redirectUrl: dto.redirectUrl,
        ignoreExisting: true,
      });

      await this.auditService.log("user.invite", adminUserId, "user", {
        emailAddress,
        invitationId: invitation.id,
        status: invitation.status,
        url: invitation.url || null,
      });

      return {
        success: true,
        invitation: this.toInvitation(invitation),
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
