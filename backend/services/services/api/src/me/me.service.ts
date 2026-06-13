import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { toDatabaseUserId } from "../common/user-id";
import type {
  CreateApplicationDto,
  SaveBookmarkDto,
  UpdateApplicationDto,
} from "./dto/me.dto";

type TableRow = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const OPPORTUNITY_FIELDS = [
  "id",
  "title",
  "category",
  "organization",
  "location",
  "deadline",
  "close_date",
  "image_url",
  "match_score",
  "quality_score",
].join(",");

@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);
  private readonly supabase: SupabaseClient | null = null;
  private readonly notificationCountWarnings = new Set<string>();

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key) {
      this.supabase = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }
  }

  async listBookmarks(userId: string) {
    const dbUserId = toDatabaseUserId(userId);
    const bookmarks = await this.fetchBookmarkRows(dbUserId);
    const opportunities = await this.fetchOpportunityMap(
      bookmarks.map((bookmark) => this.asString(bookmark.opportunity_id)),
    );

    return bookmarks.map((bookmark) =>
      this.toBookmarkResponse(bookmark, opportunities),
    );
  }

  async getBookmarkStatus(userId: string, opportunityId: string) {
    this.assertUuid(opportunityId, "Opportunity id");
    const dbUserId = toDatabaseUserId(userId);
    const { data, error } = await this.client
      .from("opportunity_bookmarks")
      .select("opportunity_id,saved_at,priority,notes")
      .eq("user_id", dbUserId)
      .eq("opportunity_id", opportunityId)
      .maybeSingle();

    this.throwIfSupabaseError(error, "Could not read bookmark status");

    return {
      saved: Boolean(data),
      bookmark: data ?? null,
    };
  }

  async saveBookmark(
    userId: string,
    opportunityId: string,
    dto: SaveBookmarkDto,
  ) {
    this.assertUuid(opportunityId, "Opportunity id");
    const dbUserId = toDatabaseUserId(userId);
    const now = new Date().toISOString();
    const payload: TableRow = {
      user_id: dbUserId,
      opportunity_id: opportunityId,
      saved_at: now,
    };

    if (Object.prototype.hasOwnProperty.call(dto, "priority")) {
      payload.priority = dto.priority ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(dto, "notes")) {
      payload.notes = dto.notes ?? null;
    }

    const { data, error } = await this.client
      .from("opportunity_bookmarks")
      .upsert(payload, { onConflict: "user_id,opportunity_id" })
      .select("*")
      .single();

    this.throwIfSupabaseError(error, "Could not save opportunity");

    const opportunities = await this.fetchOpportunityMap([opportunityId]);
    return this.toBookmarkResponse(data as TableRow, opportunities);
  }

  async removeBookmark(userId: string, opportunityId: string) {
    this.assertUuid(opportunityId, "Opportunity id");
    const dbUserId = toDatabaseUserId(userId);
    const { error } = await this.client
      .from("opportunity_bookmarks")
      .delete()
      .eq("user_id", dbUserId)
      .eq("opportunity_id", opportunityId);

    this.throwIfSupabaseError(error, "Could not remove saved opportunity");
    return { success: true };
  }

  async listApplications(userId: string) {
    const dbUserId = toDatabaseUserId(userId);
    const applications = await this.fetchApplicationRows(dbUserId);
    return this.hydrateApplications(applications);
  }

  async createApplication(userId: string, dto: CreateApplicationDto) {
    const dbUserId = toDatabaseUserId(userId);
    const now = new Date().toISOString();
    const status = dto.status ?? "draft";
    const payload: TableRow = {
      user_id: dbUserId,
      opportunity_id: dto.opportunityId,
      status,
      metadata: dto.metadata ?? {},
      updated_at: now,
    };

    if (status === "submitted") {
      payload.submitted_at = now;
    }
    if (Object.prototype.hasOwnProperty.call(dto, "notes")) {
      payload.notes = dto.notes ?? null;
    }

    const { data, error } = await this.client
      .from("opportunity_applications")
      .upsert(payload, { onConflict: "user_id,opportunity_id" })
      .select("*")
      .single();

    this.throwIfSupabaseError(error, "Could not create application");

    const [application] = await this.hydrateApplications([data as TableRow]);
    return application;
  }

  async updateApplication(
    userId: string,
    applicationId: string,
    dto: UpdateApplicationDto,
  ) {
    this.assertUuid(applicationId, "Application id");
    const dbUserId = toDatabaseUserId(userId);
    const patch: TableRow = {
      updated_at: new Date().toISOString(),
    };

    if (Object.prototype.hasOwnProperty.call(dto, "status")) {
      patch.status = dto.status;
      if (dto.status === "submitted") {
        patch.submitted_at = new Date().toISOString();
      }
    }
    if (Object.prototype.hasOwnProperty.call(dto, "notes")) {
      patch.notes = dto.notes ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(dto, "metadata")) {
      patch.metadata = dto.metadata ?? {};
    }

    const { data, error } = await this.client
      .from("opportunity_applications")
      .update(patch)
      .eq("id", applicationId)
      .eq("user_id", dbUserId)
      .select("*")
      .maybeSingle();

    this.throwIfSupabaseError(error, "Could not update application");
    if (!data) throw new NotFoundException("Application not found");

    const [application] = await this.hydrateApplications([data as TableRow]);
    return application;
  }

  async deleteApplication(userId: string, applicationId: string) {
    this.assertUuid(applicationId, "Application id");
    const dbUserId = toDatabaseUserId(userId);
    const { error } = await this.client
      .from("opportunity_applications")
      .delete()
      .eq("id", applicationId)
      .eq("user_id", dbUserId);

    this.throwIfSupabaseError(error, "Could not delete application");
    return { success: true };
  }

  async listDeadlines(userId: string) {
    const dbUserId = toDatabaseUserId(userId);
    const [bookmarks, applications, goals] = await Promise.all([
      this.fetchBookmarkRows(dbUserId),
      this.fetchApplicationRows(dbUserId),
      this.fetchGoalRows(dbUserId),
    ]);
    const opportunities = await this.fetchOpportunityMap([
      ...bookmarks.map((bookmark) => this.asString(bookmark.opportunity_id)),
      ...applications.map((application) =>
        this.asString(application.opportunity_id),
      ),
    ]);

    const deadlines = [
      ...bookmarks.map((bookmark) =>
        this.toOpportunityDeadline("bookmark", bookmark, opportunities),
      ),
      ...applications.map((application) =>
        this.toOpportunityDeadline("application", application, opportunities),
      ),
      ...goals.map((goal) => this.toGoalDeadline(goal)),
    ].filter((deadline): deadline is NonNullable<typeof deadline> =>
      Boolean(deadline),
    );

    deadlines.sort((left, right) => left.daysUntil - right.daysUntil);

    return {
      summary: {
        total: deadlines.length,
        overdue: deadlines.filter((deadline) => deadline.urgency === "overdue")
          .length,
        urgent: deadlines.filter((deadline) => deadline.urgency === "urgent")
          .length,
        soon: deadlines.filter((deadline) => deadline.urgency === "soon")
          .length,
      },
      groups: {
        overdue: deadlines.filter((deadline) => deadline.urgency === "overdue"),
        urgent: deadlines.filter((deadline) => deadline.urgency === "urgent"),
        soon: deadlines.filter((deadline) => deadline.urgency === "soon"),
        later: deadlines.filter((deadline) => deadline.urgency === "later"),
      },
      items: deadlines,
    };
  }

  async getStatusPanel(userId: string, authUserId?: string) {
    const dbUserId = toDatabaseUserId(userId);
    const [bookmarks, applications, goals, notifications] = await Promise.all([
      this.fetchBookmarkRows(dbUserId),
      this.fetchApplicationRows(dbUserId),
      this.fetchGoalRows(dbUserId),
      this.fetchNotificationCounts(dbUserId, authUserId),
    ]);

    const opportunities = await this.fetchOpportunityMap([
      ...bookmarks.map((bookmark) => this.asString(bookmark.opportunity_id)),
      ...applications.map((application) =>
        this.asString(application.opportunity_id),
      ),
    ]);

    const deadlines = [
      ...bookmarks.map((bookmark) =>
        this.toOpportunityDeadline("bookmark", bookmark, opportunities),
      ),
      ...applications.map((application) =>
        this.toOpportunityDeadline("application", application, opportunities),
      ),
      ...goals.map((goal) => this.toGoalDeadline(goal)),
    ].filter((deadline): deadline is NonNullable<typeof deadline> =>
      Boolean(deadline),
    );

    deadlines.sort((left, right) => left.daysUntil - right.daysUntil);

    return {
      generatedAt: new Date().toISOString(),
      notifications,
      opportunities: {
        savedCount: bookmarks.length,
        applicationCount: applications.length,
        submittedApplications: applications.filter(
          (application) => application.status === "submitted",
        ).length,
        draftApplications: applications.filter(
          (application) => application.status === "draft",
        ).length,
      },
      goals: {
        totalCount: goals.length,
        activeCount: goals.filter((goal) => goal.status !== "completed").length,
        completedCount: goals.filter((goal) => goal.status === "completed")
          .length,
      },
      deadlines: {
        summary: {
          total: deadlines.length,
          overdue: deadlines.filter(
            (deadline) => deadline.urgency === "overdue",
          ).length,
          urgent: deadlines.filter((deadline) => deadline.urgency === "urgent")
            .length,
          soon: deadlines.filter((deadline) => deadline.urgency === "soon")
            .length,
        },
        next: deadlines.slice(0, 5),
      },
    };
  }

  private get client() {
    if (!this.supabase) {
      throw new ServiceUnavailableException(
        "Supabase service role is not configured",
      );
    }

    return this.supabase;
  }

  private async fetchBookmarkRows(userId: string): Promise<TableRow[]> {
    const { data, error } = await this.client
      .from("opportunity_bookmarks")
      .select("*")
      .eq("user_id", userId)
      .order("saved_at", { ascending: false });

    this.throwIfSupabaseError(error, "Could not load saved opportunities");
    return (data ?? []) as TableRow[];
  }

  private async fetchApplicationRows(userId: string): Promise<TableRow[]> {
    const { data, error } = await this.client
      .from("opportunity_applications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    this.throwIfSupabaseError(error, "Could not load applications");
    return (data ?? []) as TableRow[];
  }

  private async fetchGoalRows(userId: string): Promise<TableRow[]> {
    const { data, error } = await this.client
      .from("goals")
      .select("*")
      .eq("user_id", userId);

    this.throwIfSupabaseError(error, "Could not load goals for deadlines");
    return (data ?? []) as TableRow[];
  }

  private async fetchNotificationCounts(dbUserId: string, authUserId?: string) {
    const userNotificationIds = [
      ...new Set(
        [authUserId, dbUserId].filter((id): id is string => Boolean(id)),
      ),
    ];
    const [
      backendTotal,
      backendUnread,
      userNotificationTotals,
      userNotificationUnread,
    ] = await Promise.all([
      this.countNotifications("notifications", dbUserId),
      this.countNotifications("notifications", dbUserId, true),
      Promise.all(
        userNotificationIds.map((id) =>
          this.countNotifications("user_notifications", id),
        ),
      ),
      Promise.all(
        userNotificationIds.map((id) =>
          this.countNotifications("user_notifications", id, true),
        ),
      ),
    ]);

    return {
      totalCount:
        backendTotal +
        userNotificationTotals.reduce((total, count) => total + count, 0),
      unreadCount:
        backendUnread +
        userNotificationUnread.reduce((total, count) => total + count, 0),
    };
  }

  private async countNotifications(
    table: "notifications" | "user_notifications",
    userId: string,
    unreadOnly = false,
  ) {
    let query = this.client
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (unreadOnly) {
      query = query.is("read_at", null);
    }

    const { count, error } = await query;
    if (!error) return count ?? 0;

    const warningKey = `${table}:${error.message}`;
    if (!this.notificationCountWarnings.has(warningKey)) {
      this.notificationCountWarnings.add(warningKey);
      this.logger.warn(`Could not count ${table}: ${error.message}`);
    }

    return 0;
  }

  private async fetchOpportunityMap(ids: string[]) {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) return new Map<string, TableRow>();

    const { data, error } = await this.client
      .from("opportunities")
      .select(OPPORTUNITY_FIELDS)
      .in("id", uniqueIds);

    if (error) {
      this.logger.warn(`Could not hydrate opportunities: ${error.message}`);
      return new Map<string, TableRow>();
    }

    return new Map(
      ((data ?? []) as unknown as TableRow[]).map((opportunity) => [
        this.asString(opportunity.id),
        opportunity,
      ]),
    );
  }

  private async hydrateApplications(applications: TableRow[]) {
    const opportunities = await this.fetchOpportunityMap(
      applications.map((application) =>
        this.asString(application.opportunity_id),
      ),
    );

    return applications.map((application) =>
      this.toApplicationResponse(application, opportunities),
    );
  }

  private toBookmarkResponse(
    bookmark: TableRow,
    opportunities: Map<string, TableRow>,
  ) {
    const opportunityId = this.asString(bookmark.opportunity_id);
    const opportunity = opportunities.get(opportunityId);

    return {
      id: `${this.asString(bookmark.user_id)}:${opportunityId}`,
      user_id: bookmark.user_id,
      opportunity_id: opportunityId,
      saved_at: bookmark.saved_at ?? bookmark.created_at ?? null,
      created_at: bookmark.saved_at ?? bookmark.created_at ?? null,
      priority: bookmark.priority ?? null,
      notes: bookmark.notes ?? null,
      opportunity_title: this.asString(opportunity?.title) || "Opportunity",
      opportunity_category: this.asString(opportunity?.category) || "General",
      opportunity_deadline:
        opportunity?.deadline ?? opportunity?.close_date ?? null,
      opportunity_location:
        this.asString(opportunity?.location) ||
        this.asString(opportunity?.organization) ||
        "Worldwide",
      match_percentage: this.toNumber(
        opportunity?.match_score ?? opportunity?.quality_score,
      ),
      opportunity,
    };
  }

  private toApplicationResponse(
    application: TableRow,
    opportunities: Map<string, TableRow>,
  ) {
    const opportunityId = this.asString(application.opportunity_id);
    const opportunity = opportunities.get(opportunityId);

    return {
      ...application,
      opportunity_id: opportunityId,
      opportunity_title: this.asString(opportunity?.title) || "Opportunity",
      opportunity_category: this.asString(opportunity?.category) || "General",
      opportunity_deadline:
        opportunity?.deadline ?? opportunity?.close_date ?? null,
      opportunity_location:
        this.asString(opportunity?.location) ||
        this.asString(opportunity?.organization) ||
        "Worldwide",
      opportunity,
    };
  }

  private toOpportunityDeadline(
    type: "bookmark" | "application",
    row: TableRow,
    opportunities: Map<string, TableRow>,
  ) {
    const opportunityId = this.asString(row.opportunity_id);
    const opportunity = opportunities.get(opportunityId);
    const deadline = opportunity?.deadline ?? opportunity?.close_date;
    if (!deadline) return null;

    const daysUntil = this.daysUntil(deadline);
    return {
      id: `${type}:${opportunityId}`,
      type,
      title: this.asString(opportunity?.title) || "Opportunity",
      category: this.asString(opportunity?.category) || "General",
      deadline,
      daysUntil,
      urgency: this.deadlineUrgency(daysUntil),
      sourceId: opportunityId,
      status: type === "application" ? row.status : undefined,
    };
  }

  private toGoalDeadline(goal: TableRow) {
    const deadline = goal.target_date ?? goal.deadline;
    if (!deadline) return null;

    const daysUntil = this.daysUntil(deadline);
    return {
      id: `goal:${this.asString(goal.id)}`,
      type: "goal" as const,
      title: this.asString(goal.title) || "Goal",
      category: this.asString(goal.category) || "Goal",
      deadline,
      daysUntil,
      urgency: this.deadlineUrgency(daysUntil),
      sourceId: this.asString(goal.id),
      status: goal.status,
    };
  }

  private daysUntil(value: unknown) {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return Number.MAX_SAFE_INTEGER;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
  }

  private deadlineUrgency(daysUntil: number) {
    if (daysUntil < 0) return "overdue";
    if (daysUntil <= 7) return "urgent";
    if (daysUntil <= 30) return "soon";
    return "later";
  }

  private assertUuid(value: string, label: string) {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException(`${label} must be a UUID`);
    }
  }

  private throwIfSupabaseError(
    error: { message?: string } | null,
    fallback: string,
  ) {
    if (!error) return;
    throw new BadRequestException(error.message || fallback);
  }

  private asString(value: unknown) {
    return typeof value === "string" ? value : "";
  }

  private toNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
