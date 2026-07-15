import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from "@nestjs/common";
import { GoalsService } from "../goals/goals.service";
import { db } from "../db";
import {
  roadmaps,
  roadmapEnrollments,
  roadmapComments,
  roadmapCommentReports,
  userBlocks,
  userRoadmapIntents,
  roadmapFeedback,
  profiles,
} from "../db/schema";
import {
  eq,
  and,
  or,
  ilike,
  desc,
  gte,
  sql,
  getTableColumns,
} from "drizzle-orm";
import {
  CreateRoadmapDto,
  UpdateRoadmapDto,
  RoadmapIntentDto,
  RoadmapFeedbackDto,
  AIAssistDto,
  OpportunityPlanDto,
  AdoptRoadmapDto,
  RoadmapCommentDto,
  ReportCommentDto,
  BlockUserDto,
} from "./dto/roadmap.dto";
import { AiService } from "../ai";
import { isObjectionable } from "../common/moderation";
import { matchProfileUserId, toDatabaseUserId } from "../common/user-id";
import { CacheService } from "../common/cache/cache.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { BroadcastNotificationDto } from "../notifications/dto/notification.dto";

const ROADMAPS_CACHE_PREFIX = "roadmaps:";

type RoadmapStep = {
  id: string;
  title: string;
  description: string;
  duration?: string;
  resources?: string[];
  relativeDueDays?: number;
  phase?: string;
  taskType?: string;
  calendarSyncEnabled?: boolean;
};

type AdoptedPlanStep = RoadmapStep & {
  id: string;
  sourceStepId?: string;
  order?: number;
  dueAt?: string | null;
  completed?: boolean;
};

const featuredFirstOrder = desc(
  sql`case when ${roadmaps.isFeatured} = true then 1 else 0 end`,
);

@Injectable()
export class RoadmapsService {
  private readonly logger = new Logger(RoadmapsService.name);

  constructor(
    private readonly aiService: AiService,
    @Optional() private readonly goalsService?: GoalsService,
    @Optional() private readonly cache?: CacheService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  private async invalidateRoadmapCache(): Promise<void> {
    await this.cache?.delByPrefix(ROADMAPS_CACHE_PREFIX);
  }

  async findAll(params?: {
    status?: string;
    category?: string;
    difficulty?: string;
    search?: string;
    featured?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const {
      status = "published",
      category,
      difficulty,
      search,
      featured,
      limit = 20,
      offset = 0,
    } = params || {};

    const cappedLimit = Math.min(limit, 100);
    const key = `${ROADMAPS_CACHE_PREFIX}list:${status}:${category || ""}:${difficulty || ""}:${featured ? 1 : 0}:${search || ""}:${cappedLimit}:${offset}`;

    const run = async () => {
      const conditions = [eq(roadmaps.status, status)];
      if (category) conditions.push(eq(roadmaps.category, category));
      if (difficulty) conditions.push(eq(roadmaps.difficulty, difficulty));
      if (featured) conditions.push(eq(roadmaps.isFeatured, true));
      if (search) conditions.push(ilike(roadmaps.title, `%${search}%`));

      const items = await db
        .select()
        .from(roadmaps)
        .where(and(...conditions))
        .orderBy(
          featuredFirstOrder,
          desc(roadmaps.ratingAvg),
          desc(roadmaps.enrollmentCount),
          desc(roadmaps.createdAt),
        )
        .limit(cappedLimit)
        .offset(offset);

      return items.map((item) => this.serializeRoadmap(item));
    };

    return this.cache ? this.cache.wrap(key, 180, run) : run();
  }

  async findTemplates(params?: {
    category?: string;
    difficulty?: string;
    search?: string;
    featured?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const templates = await this.findAll({
      ...params,
      status: "published",
    });

    return templates.filter(
      (template) => Array.isArray(template.steps) && template.steps.length > 0,
    );
  }

  async findOne(id: string) {
    const [item] = await db.select().from(roadmaps).where(eq(roadmaps.id, id));

    if (!item) throw new NotFoundException("Roadmap not found");
    return this.serializeRoadmap(item);
  }

  async findPublishedById(id: string) {
    const run = async () => {
      const [item] = await db
        .select()
        .from(roadmaps)
        .where(and(eq(roadmaps.id, id), eq(roadmaps.status, "published")));

      if (!item) throw new NotFoundException("Roadmap not found");
      return this.serializeRoadmap(item);
    };
    return this.cache
      ? this.cache.wrap(`${ROADMAPS_CACHE_PREFIX}pub:${id}`, 300, run)
      : run();
  }

  async findBySlug(slug: string) {
    const run = async () => {
      const [item] = await db
        .select()
        .from(roadmaps)
        .where(and(eq(roadmaps.slug, slug), eq(roadmaps.status, "published")));

      if (!item) throw new NotFoundException("Roadmap not found");
      return this.serializeRoadmap(item);
    };
    return this.cache
      ? this.cache.wrap(`${ROADMAPS_CACHE_PREFIX}slug:${slug}`, 300, run)
      : run();
  }

  async create(
    dto: CreateRoadmapDto,
    userId: string,
    creatorName = "Edutu Admin",
    options: { status?: "draft" | "published" | "archived" | "personal" } = {},
  ) {
    const dbUserId = toDatabaseUserId(userId);
    const steps = dto.steps.map((step) => ({
      ...step,
      id: step.id || crypto.randomUUID(),
      resources: step.resources || [],
    }));

    const resources = (dto.resources || []).map((res) => ({
      ...res,
      id: res.id || crypto.randomUUID(),
      url: res.url || "",
    }));

    let aiIntentTags: string[] = [];
    let aiGeneratedSummary: string | null = null;

    try {
      const aiResult = await this.generateIntentTags(dto);
      aiIntentTags = aiResult.tags;
      aiGeneratedSummary = aiResult.summary;
    } catch (e) {
      this.logger.warn(
        "AI intent generation failed, continuing without it",
        e instanceof Error ? e.message : String(e),
      );
    }

    const [item] = await db
      .insert(roadmaps)
      .values({
        title: dto.title,
        slug:
          dto.slug ||
          `${dto.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 50)}-${crypto.randomUUID().slice(0, 6)}`,
        description: dto.description,
        category: dto.category,
        difficulty: dto.difficulty,
        estimatedDuration: dto.estimatedDuration || null,
        targetAudience: dto.targetAudience || null,
        prerequisites: dto.prerequisites || null,
        outcomes: dto.outcomes || null,
        coverImage: dto.coverImage || null,
        opportunityId: dto.opportunityId || null,
        creatorProof: dto.creatorProof || null,
        deadlineStrategy: dto.deadlineStrategy || null,
        communityId: dto.communityId || null,
        version: dto.version || 1,
        calendarSyncEnabled: dto.calendarSyncEnabled || false,
        status: options.status || "draft",
        publishedAt: options.status === "published" ? new Date() : null,
        createdBy: dbUserId,
        creatorName,
        isFeatured: dto.isFeatured,
        steps: steps,
        resources: resources,
        relatedOpportunities: dto.relatedOpportunities,
        aiIntentTags,
        aiGeneratedSummary,
      })
      .returning();

    await this.invalidateRoadmapCache();
    return this.serializeRoadmap(item);
  }

  async createByCreator(
    dto: CreateRoadmapDto,
    userId: string,
    creatorName = "Edutu Creator",
  ) {
    const dbUserId = toDatabaseUserId(userId);
    const [profile] = await db
      .select()
      .from(profiles)
      .where(matchProfileUserId(profiles.userId, dbUserId));

    const isApprovedCreator = profile?.creatorStatus === "approved";
    const isAdmin = profile?.role === "admin" || profile?.role === "moderator";

    if (!isApprovedCreator && !isAdmin) {
      throw new ForbiddenException(
        "Only approved creators can submit roadmaps.",
      );
    }

    return this.create(
      {
        ...dto,
        isFeatured: false,
      },
      dbUserId,
      creatorName || profile?.fullName || "Edutu Creator",
      { status: "published" },
    );
  }

  // ─── PERSONAL ("My Roadmaps") — any signed-in user ──────────────────────
  // Personal roadmaps live in the same `roadmaps` table but with
  // status='personal', so the public catalog (findAll / findPublishedById,
  // which both filter status='published') never surfaces them. Only the
  // owner sees them, via findMine below.

  async createPersonal(
    dto: CreateRoadmapDto,
    userId: string,
    creatorName = "You",
  ) {
    return this.create({ ...dto, isFeatured: false }, userId, creatorName, {
      status: "personal",
    });
  }

  async findMine(userId: string) {
    const dbUserId = toDatabaseUserId(userId);
    const items = await db
      .select()
      .from(roadmaps)
      .where(eq(roadmaps.createdBy, dbUserId))
      .orderBy(desc(roadmaps.updatedAt), desc(roadmaps.createdAt));

    return items.map((item) => this.serializeRoadmap(item));
  }

  private async requireOwnedRoadmap(userId: string, id: string) {
    const dbUserId = toDatabaseUserId(userId);
    const [existing] = await db
      .select()
      .from(roadmaps)
      .where(eq(roadmaps.id, id));

    if (!existing) throw new NotFoundException("Roadmap not found");
    if (existing.createdBy !== dbUserId) {
      throw new ForbiddenException("You can only manage your own roadmaps.");
    }
    return existing;
  }

  async updateMine(userId: string, id: string, dto: UpdateRoadmapDto) {
    await this.requireOwnedRoadmap(userId, id);
    // Editing from "My Roadmaps" never changes catalog visibility — strip any
    // status the client sent so a personal roadmap can't be self-published.
    const { status: _ignored, ...safeDto } = dto;
    return this.update(id, safeDto);
  }

  async removeMine(userId: string, id: string) {
    await this.requireOwnedRoadmap(userId, id);
    await db.delete(roadmaps).where(eq(roadmaps.id, id));
    await this.invalidateRoadmapCache();
    return { success: true, id };
  }

  // Catalog visibility is the one status transition owners may make, and only
  // through here — publishing stays gated on approved-creator/admin while
  // unpublishing is always allowed to the owner.
  async setMineVisibility(userId: string, id: string, publish: boolean) {
    await this.requireOwnedRoadmap(userId, id);

    if (publish) {
      const dbUserId = toDatabaseUserId(userId);
      const [profile] = await db
        .select()
        .from(profiles)
        .where(matchProfileUserId(profiles.userId, dbUserId));

      const isApprovedCreator = profile?.creatorStatus === "approved";
      const isAdmin =
        profile?.role === "admin" || profile?.role === "moderator";
      if (!isApprovedCreator && !isAdmin) {
        throw new ForbiddenException(
          "Only approved creators can publish roadmaps.",
        );
      }
    }

    const [item] = await db
      .update(roadmaps)
      .set({
        status: publish ? "published" : "personal",
        publishedAt: publish ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(roadmaps.id, id))
      .returning();

    await this.invalidateRoadmapCache();
    return this.serializeRoadmap(item);
  }

  async update(id: string, dto: UpdateRoadmapDto) {
    const existing = await this.findOne(id);

    const updateData: Record<string, unknown> = {
      ...dto,
      updatedAt: new Date(),
    };

    if (dto.status === "published" && existing.status !== "published") {
      updateData.publishedAt = new Date();
    }

    if (dto.steps) {
      updateData.steps = dto.steps.map((step) => ({
        ...step,
        id: step.id || crypto.randomUUID(),
        resources: step.resources || [],
      }));
    }

    if (dto.resources) {
      updateData.resources = dto.resources.map((res) => ({
        ...res,
        id: res.id || crypto.randomUUID(),
        url: res.url || "",
      }));
    }

    delete updateData.status;
    if (dto.status) {
      updateData.status = dto.status;
    }

    const [updated] = await db
      .update(roadmaps)
      .set(updateData)
      .where(eq(roadmaps.id, id))
      .returning();

    await this.invalidateRoadmapCache();
    return this.serializeRoadmap(updated);
  }

  async getComments(roadmapId: string, limit = 50) {
    const items = await db
      .select()
      .from(roadmapComments)
      .where(eq(roadmapComments.roadmapId, roadmapId))
      .orderBy(desc(roadmapComments.createdAt))
      .limit(Math.min(limit, 100));

    return items.map((item) => this.serializeComment(item));
  }

  async addComment(
    userId: string,
    roadmapId: string,
    dto: RoadmapCommentDto,
    fallbackName?: string,
  ) {
    await this.findPublishedById(roadmapId);

    // Guideline 1.2: keep objectionable content out of public comments. Reject
    // on write rather than storing hidden — the comment table has no status
    // column and rejecting keeps the read path simple.
    if (isObjectionable(dto.body)) {
      throw new BadRequestException(
        "Your comment contains language that isn't allowed. Please rephrase and try again.",
      );
    }

    const dbUserId = toDatabaseUserId(userId);
    const [profile] = await db
      .select()
      .from(profiles)
      .where(matchProfileUserId(profiles.userId, dbUserId));

    const authorName =
      profile?.fullName?.trim() || fallbackName?.trim() || "Edutu learner";

    const [created] = await db
      .insert(roadmapComments)
      .values({
        roadmapId,
        userId: dbUserId,
        authorName,
        body: dto.body,
        rating: dto.rating ?? null,
      })
      .returning();

    return this.serializeComment(created);
  }

  private serializeComment(comment: any) {
    if (!comment) return comment;
    return {
      id: comment.id,
      roadmap_id: comment.roadmapId,
      // Opaque derived id, exposed so the client can report/block the author
      // and hide blocked authors locally. Not the raw auth subject.
      author_id: comment.userId,
      author_name: comment.authorName,
      body: comment.body,
      rating: comment.rating,
      created_at: comment.createdAt,
    };
  }

  // ─── UGC moderation (Apple Guideline 1.2) ───────────────────────────────
  // Report an abusive comment. Reports are persisted "open" for admin review.
  async reportComment(
    userId: string,
    roadmapId: string,
    commentId: string,
    dto: ReportCommentDto,
  ) {
    const [comment] = await db
      .select()
      .from(roadmapComments)
      .where(
        and(
          eq(roadmapComments.id, commentId),
          eq(roadmapComments.roadmapId, roadmapId),
        ),
      );

    if (!comment) throw new NotFoundException("Comment not found");

    await db.insert(roadmapCommentReports).values({
      commentId,
      roadmapId,
      reporterUserId: toDatabaseUserId(userId),
      reason: dto.reason ?? "other",
    });

    return { success: true };
  }

  // Block another user so the blocker no longer sees their comments. The block
  // is persisted server-side (source of truth); the client also filters
  // locally for instant effect.
  async blockUser(userId: string, dto: BlockUserDto) {
    const blockerUserId = toDatabaseUserId(userId);
    if (blockerUserId === dto.blockedUserId) {
      throw new BadRequestException("You cannot block yourself.");
    }

    await db
      .insert(userBlocks)
      .values({ blockerUserId, blockedUserId: dto.blockedUserId })
      .onConflictDoNothing({
        target: [userBlocks.blockerUserId, userBlocks.blockedUserId],
      });

    return { success: true, blockedUserId: dto.blockedUserId };
  }

  async getBlockedUserIds(userId: string): Promise<string[]> {
    const rows = await db
      .select({ blockedUserId: userBlocks.blockedUserId })
      .from(userBlocks)
      .where(eq(userBlocks.blockerUserId, toDatabaseUserId(userId)));

    return rows.map((row) => row.blockedUserId);
  }

  async remove(id: string) {
    await this.findOne(id);
    await db.delete(roadmaps).where(eq(roadmaps.id, id));
    await this.invalidateRoadmapCache();
    return { success: true, id };
  }

  async enroll(userId: string, roadmapId: string) {
    await this.findPublishedById(roadmapId);

    // roadmap_enrollments.user_id is a uuid column, so the raw Clerk id has to
    // be mapped through the same deterministic hash used everywhere else in
    // this service — otherwise Postgres rejects the insert and the client sees
    // a bare "Enrollment failed".
    const dbUserId = toDatabaseUserId(userId);

    // Upsert and bump the counter in one transaction. `xmax = 0` is true only
    // when THIS statement inserted the row (not on the conflict-update path),
    // so the enrollment_count increment happens exactly once even when two
    // first-time enrolls race — no separate SELECT, no lost/double count.
    const enrollment = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(roadmapEnrollments)
        .values({
          userId: dbUserId,
          roadmapId,
          status: "enrolled",
          progress: 0,
          currentStep: 0,
          completedSteps: [],
        })
        .onConflictDoUpdate({
          target: [roadmapEnrollments.userId, roadmapEnrollments.roadmapId],
          set: {
            status: "enrolled",
            enrolledAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning({
          ...getTableColumns(roadmapEnrollments),
          inserted: sql<boolean>`(xmax = 0)`,
        });

      const { inserted, ...enrollment } = row;
      if (inserted) {
        await tx
          .update(roadmaps)
          .set({ enrollmentCount: sql`${roadmaps.enrollmentCount} + 1` })
          .where(eq(roadmaps.id, roadmapId));
      }
      return enrollment;
    });

    return this.serializeEnrollment(enrollment);
  }

  // Published roadmaps are adoptable by anyone; a personal roadmap is
  // adoptable only by its owner (so users can turn their own plan into goals).
  private async findAdoptableRoadmap(userId: string, roadmapId: string) {
    const [item] = await db
      .select()
      .from(roadmaps)
      .where(eq(roadmaps.id, roadmapId));

    if (
      !item ||
      (item.status !== "published" &&
        item.createdBy !== toDatabaseUserId(userId))
    ) {
      throw new NotFoundException("Roadmap not found");
    }
    return this.serializeRoadmap(item);
  }

  async adopt(userId: string, roadmapId: string, dto: AdoptRoadmapDto) {
    const roadmap = await this.findAdoptableRoadmap(userId, roadmapId);
    // Enrollment rows are keyed by the uuid form of the user id (see enroll()).
    const dbUserId = toDatabaseUserId(userId);
    const targetOpportunityId =
      dto.targetOpportunityId ||
      dto.opportunityId ||
      roadmap.opportunityId ||
      null;
    const targetDeadline = this.parseTargetDeadline(dto.targetDeadline);
    const calendarSyncEnabled =
      dto.calendarSyncEnabled ?? roadmap.calendarSyncEnabled ?? false;
    const adoptedPlan = this.buildAdoptedPlan(
      roadmap,
      targetOpportunityId,
      targetDeadline,
      calendarSyncEnabled,
    );

    // On the conflict path the SET clause preserves the row's existing
    // progress/currentStep/completedSteps (it only touches the adopt fields),
    // and on the insert path there is no prior row — so the values() below use
    // fresh defaults. `xmax = 0` gates the counter bump to true first inserts.
    const { enrollment, inserted } = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(roadmapEnrollments)
        .values({
          userId: dbUserId,
          roadmapId,
          status: "enrolled",
          progress: 0,
          currentStep: 0,
          completedSteps: [],
          targetOpportunityId,
          targetDeadline,
          calendarSyncEnabled,
          adoptedPlan,
          enrolledAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [roadmapEnrollments.userId, roadmapEnrollments.roadmapId],
          set: {
            status: "enrolled",
            targetOpportunityId,
            targetDeadline,
            calendarSyncEnabled,
            adoptedPlan,
            updatedAt: new Date(),
          },
        })
        .returning({
          ...getTableColumns(roadmapEnrollments),
          inserted: sql<boolean>`(xmax = 0)`,
        });

      const { inserted, ...enrollment } = row;
      if (inserted) {
        await tx
          .update(roadmaps)
          .set({ enrollmentCount: sql`${roadmaps.enrollmentCount} + 1` })
          .where(eq(roadmaps.id, roadmapId));
      }
      return { enrollment, inserted };
    });

    // On first enrollment, turn the dated plan into trackable goals. Each goal
    // flows through the goals reminder pipeline, so the user gets delivered
    // reminders (push + in-app) for every milestone — the loop that makes
    // adoption "work".
    let goalsCreated = 0;
    if (inserted) {
      goalsCreated = await this.createAdoptionGoals(
        userId,
        roadmap,
        adoptedPlan,
      );
    }

    // Per-step reminders arrive via the goals pipeline above, but the
    // 30/14/7/3/1-day countdown to the *target deadline* was previously only
    // computed for the API response and never delivered. Enqueue it — with
    // the next incomplete step in the body, so each ping is an action.
    await this.scheduleDeadlineReminders(userId, enrollment, roadmap);

    return { ...this.serializeEnrollment(enrollment, roadmap), goalsCreated };
  }

  private async scheduleDeadlineReminders(
    userId: string,
    enrollment: any,
    roadmap: any,
  ) {
    if (!this.notificationsService) return;

    const schedule = this.buildReminderSchedule(enrollment, roadmap).filter(
      (item) => item.type === "opportunity_deadline",
    );
    const steps = (
      (enrollment.adoptedPlan?.steps || []) as AdoptedPlanStep[]
    ).filter((step) => !step.completed);
    const nextStep = steps.length ? steps[0].title : null;

    const notifications: BroadcastNotificationDto[] = schedule
      .filter((item) => typeof item.scheduledFor === "string")
      .map((item) => ({
        title: item.title,
        body: nextStep
          ? `Next small move: ${nextStep}. Fifteen focused minutes today keeps you ahead.`
          : item.body,
        kind: "deadline-reminder" as const,
        severity:
          "daysBefore" in item && Number(item.daysBefore) <= 3
            ? "warning"
            : "info",
        scheduledFor: item.scheduledFor as string,
        dedupeKey: item.id,
        metadata: {
          roadmapId: enrollment.roadmapId,
          enrollmentId: enrollment.id,
          targetOpportunityId: enrollment.targetOpportunityId ?? null,
          nextAction: nextStep,
        },
      }));

    try {
      await this.notificationsService.replaceScheduledUserNotifications(
        userId,
        `roadmap-deadline:${enrollment.id}`,
        notifications,
      );
    } catch (error) {
      this.logger.warn(
        `Could not schedule roadmap deadline reminders for enrollment ${enrollment.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async createAdoptionGoals(
    userId: string,
    roadmap: any,
    adoptedPlan: {
      steps?: Array<{
        id?: string;
        title?: string;
        description?: string;
        dueAt?: string | null;
      }>;
    },
  ): Promise<number> {
    if (!this.goalsService) return 0;

    const steps = Array.isArray(adoptedPlan?.steps) ? adoptedPlan.steps : [];
    let created = 0;

    for (const step of steps) {
      if (!step?.title) continue;

      const due = step.dueAt ? new Date(step.dueAt) : null;
      const targetDate =
        due && !Number.isNaN(due.getTime()) ? due.toISOString() : undefined;

      try {
        await this.goalsService.create(userId, {
          title: step.title,
          description: step.description || undefined,
          category: roadmap.category || undefined,
          targetDate,
          source: "imported",
          templateId: roadmap.id,
          priority: "medium",
        });
        created += 1;
      } catch (e) {
        this.logger.warn(
          `Failed to create adoption goal for step ${step.id ?? "?"}`,
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    return created;
  }

  async getUserEnrollments(userId: string) {
    const rows = await db
      .select({
        enrollment: roadmapEnrollments,
        roadmap: roadmaps,
      })
      .from(roadmapEnrollments)
      .innerJoin(roadmaps, eq(roadmapEnrollments.roadmapId, roadmaps.id))
      .where(eq(roadmapEnrollments.userId, toDatabaseUserId(userId)))
      .orderBy(desc(roadmapEnrollments.enrolledAt));

    return rows.map((row) => ({
      enrollment: this.serializeEnrollment(row.enrollment, row.roadmap),
      roadmap: this.serializeRoadmap(row.roadmap),
    }));
  }

  async getEnrollmentCalendar(userId: string, enrollmentId: string) {
    const [row] = await db
      .select({
        enrollment: roadmapEnrollments,
        roadmap: roadmaps,
      })
      .from(roadmapEnrollments)
      .innerJoin(roadmaps, eq(roadmapEnrollments.roadmapId, roadmaps.id))
      .where(
        and(
          eq(roadmapEnrollments.id, enrollmentId),
          eq(roadmapEnrollments.userId, toDatabaseUserId(userId)),
        ),
      );

    if (!row) throw new NotFoundException("Enrollment not found");

    const calendar = this.buildCalendarExport(row.enrollment, row.roadmap);
    return {
      enrollmentId: row.enrollment.id,
      roadmapId: row.roadmap.id,
      filename: calendar.filename,
      contentType: "text/calendar",
      events: calendar.events,
      ics: calendar.ics,
    };
  }

  async updateProgress(
    userId: string,
    roadmapId: string,
    stepId: string,
    completed: boolean,
  ) {
    const roadmap = await this.findPublishedById(roadmapId);
    const steps = roadmap.steps as Array<{ id: string }>;
    const stepIndex = steps.findIndex((s) => s.id === stepId);

    // Read-modify-write on the completedSteps array under a row lock, so two
    // concurrent step toggles serialize instead of clobbering each other
    // (last-write-wins would silently drop a completed step).
    const updated = await db.transaction(async (tx) => {
      const [enrollment] = await tx
        .select()
        .from(roadmapEnrollments)
        .where(
          and(
            eq(roadmapEnrollments.userId, toDatabaseUserId(userId)),
            eq(roadmapEnrollments.roadmapId, roadmapId),
          ),
        )
        .for("update");

      if (!enrollment) throw new NotFoundException("Enrollment not found");

      let completedSteps = (enrollment.completedSteps as string[]) || [];

      if (completed) {
        if (!completedSteps.includes(stepId)) {
          completedSteps.push(stepId);
        }
      } else {
        completedSteps = completedSteps.filter((id) => id !== stepId);
      }

      const progress =
        steps.length > 0
          ? Math.round((completedSteps.length / steps.length) * 100)
          : 0;

      const [row] = await tx
        .update(roadmapEnrollments)
        .set({
          progress,
          currentStep: stepIndex,
          completedSteps,
          completedAt: progress === 100 ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(roadmapEnrollments.id, enrollment.id))
        .returning();

      return row;
    });

    return this.serializeEnrollment(updated);
  }

  async saveIntent(userId: string, dto: RoadmapIntentDto) {
    // user_roadmap_intents.user_id is uuid — key it consistently with reads.
    const [intent] = await db
      .insert(userRoadmapIntents)
      .values({
        userId: toDatabaseUserId(userId),
        ...dto,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userRoadmapIntents.userId,
        set: {
          ...dto,
          updatedAt: new Date(),
        },
      })
      .returning();

    return intent;
  }

  async getIntent(userId: string) {
    const [intent] = await db
      .select()
      .from(userRoadmapIntents)
      .where(eq(userRoadmapIntents.userId, toDatabaseUserId(userId)));

    return intent || null;
  }

  async getRecommendedRoadmaps(userId: string, limit = 10) {
    const intent = await this.getIntent(userId);
    const cappedLimit = Math.min(limit, 50);

    const conditions = [eq(roadmaps.status, "published")];

    if (intent?.targetCategory) {
      conditions.push(eq(roadmaps.category, intent.targetCategory));
    }

    const items = await db
      .select()
      .from(roadmaps)
      .where(and(...conditions))
      .orderBy(
        featuredFirstOrder,
        desc(roadmaps.ratingAvg),
        desc(roadmaps.enrollmentCount),
        desc(roadmaps.createdAt),
      )
      .limit(cappedLimit);

    if (intent) {
      try {
        const scored = await this.scoreRoadmapIntentMatch(items, intent);
        return scored
          .slice(0, cappedLimit)
          .map((item) => this.serializeRoadmap(item));
      } catch (e) {
        this.logger.warn("AI scoring failed, returning unsorted results");
      }
    }

    return items.map((item) => this.serializeRoadmap(item));
  }

  async submitFeedback(userId: string, dto: RoadmapFeedbackDto) {
    // Insert the feedback and roll the rating aggregate forward atomically, so
    // a failure can't leave feedback recorded with a stale rating (or vice
    // versa).
    return db.transaction(async (tx) => {
      const [feedback] = await tx
        .insert(roadmapFeedback)
        .values({
          // roadmap_feedback.user_id is uuid — key it the same way enrollments do.
          userId: toDatabaseUserId(userId),
          roadmapId: dto.roadmapId,
          satisfactionScore: dto.satisfactionScore,
          metExpectations: dto.metExpectations,
          whatWorked: dto.whatWorked,
          whatImproved: dto.whatImproved,
          wouldRecommend: dto.wouldRecommend,
        })
        .returning();

      await this.updateRoadmapRating(dto.roadmapId, dto.satisfactionScore, tx);

      return feedback;
    });
  }

  async getStats() {
    const result = await db.execute(sql`
      select
        (select count(*) from roadmaps) as total_roadmaps,
        (select count(*) from roadmaps where status = 'published') as published_roadmaps,
        (select count(*) from roadmaps where status = 'draft') as draft_roadmaps,
        (select count(*) from roadmap_enrollments) as total_enrollments,
        (select avg(satisfaction_score) from roadmap_feedback) as avg_satisfaction
    `);

    return (
      result[0] || {
        total_roadmaps: 0,
        published_roadmaps: 0,
        draft_roadmaps: 0,
        total_enrollments: 0,
        avg_satisfaction: 0,
      }
    );
  }

  async getFeedbackSummary(roadmapId: string) {
    const results = await db.execute(sql`
      select
        count(*) as total_feedback,
        avg(satisfaction_score) as avg_score,
        count(*) filter (where met_expectations = true) as met_expectations_count,
        count(*) filter (where would_recommend = true) as would_recommend_count
      from roadmap_feedback
      where roadmap_id = ${roadmapId}
    `);

    return (
      results[0] || {
        total_feedback: 0,
        avg_score: 0,
        met_expectations_count: 0,
        would_recommend_count: 0,
      }
    );
  }

  async generateAIMatchQuestions(
    topic: string,
    category?: string,
    userId?: string,
  ): Promise<{
    questions: Array<{
      id: string;
      question: string;
      type: "text" | "select" | "multiselect";
      options?: string[];
    }>;
    roadmapSuggestion: {
      title: string;
      description: string;
      steps: Array<{ title: string; description: string; duration: string }>;
    };
  }> {
    const prompt = `You are an educational roadmap designer. A user wants to create or find a roadmap about "${topic}"${category ? ` in the ${category} category` : ""}.

Return ONLY valid JSON with this exact structure:
{
  "questions": [
    { "id": "q1", "question": "What is your current experience level?", "type": "select", "options": ["Beginner", "Intermediate", "Advanced"] },
    { "id": "q2", "question": "How much time can you commit per week?", "type": "select", "options": ["Less than 5 hours", "5-10 hours", "10-20 hours", "20+ hours"] },
    { "id": "q3", "question": "What specific skills or outcomes do you want?", "type": "text" }
  ],
  "roadmapSuggestion": {
    "title": "Suggested Roadmap Title",
    "description": "A compelling 2-3 sentence description of what this roadmap offers",
    "steps": [
      { "title": "Step 1", "description": "What the user will learn/do", "duration": "Week 1-2" }
    ]
  }
}

Generate 3-5 questions that help understand the user's intent and needs.
Then suggest a roadmap with 4-8 steps tailored to "${topic}".
`;

    try {
      const parsed = await this.aiService.generateJson<any>({
        feature: "roadmaps.questions",
        userId,
        prompt,
        responseMimeType: "application/json",
        temperature: 0.3,
        metadata: { topic, category, userId },
      });

      if (!parsed) return this.getDefaultMatchQuestions(topic);

      return {
        questions: parsed.questions || [],
        roadmapSuggestion: parsed.roadmapSuggestion || {
          title: topic,
          description: "",
          steps: [],
        },
      };
    } catch (e) {
      this.logger.warn(
        "AI question generation failed",
        e instanceof Error ? e.message : String(e),
      );
      return this.getDefaultMatchQuestions(topic);
    }
  }

  // The default preparation milestones — kept id-aligned with the mobile roadmap
  // scaffold so the client can merge AI enrichment back onto its dated plan.
  private readonly defaultPlanMilestones: Array<{ id: string; title: string }> =
    [
      { id: "milestone-1", title: "Confirm fit and requirements" },
      { id: "milestone-2", title: "Collect proof and references" },
      { id: "milestone-3", title: "Draft SOP and essays" },
      { id: "milestone-4", title: "Feedback and final polish" },
      { id: "milestone-5", title: "Submit before deadline" },
    ];

  async generateOpportunityPlan(
    dto: OpportunityPlanDto,
    userId?: string,
  ): Promise<{
    summary: string;
    winningStrategy: string;
    milestones: Array<{ id: string; title: string; description: string }>;
    checklist: string[];
    supportActions: string[];
    requirementActions: Array<{ requirement: string; action: string }>;
    profileGaps: Array<{ gap: string; action: string }>;
    bestPractices: string[];
    generatedBy: "ai" | "fallback";
  }> {
    // Ground the plan in the verified opportunity row whenever the client
    // names one — client-sent fields are only a fallback. A plan built on
    // stale or wrong opportunity data misleads the user with confidence.
    if (dto.opportunityId) {
      dto = await this.groundPlanDto(dto);
    }
    // The DTO allows id-only requests; if grounding could not resolve a
    // title, keep the prompt coherent rather than failing the whole plan.
    if (!dto.title) {
      dto = { ...dto, title: "this opportunity" };
    }

    const scaffold =
      dto.milestones && dto.milestones.length > 0
        ? dto.milestones
        : this.defaultPlanMilestones;

    const constraints = [
      dto.currentLevel ? `Current level: ${dto.currentLevel}.` : "",
      dto.hoursPerWeek
        ? `Available time: about ${dto.hoursPerWeek} hours per week.`
        : "",
      dto.deadline ? `Application deadline: ${dto.deadline}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const profile = dto.profile;
    const profileLines = profile
      ? [
          profile.country ? `Country: ${profile.country}.` : "",
          profile.pursuit ? `Field of study/pursuit: ${profile.pursuit}.` : "",
          profile.gradeLevel ? `Education level: ${profile.gradeLevel}.` : "",
          profile.schoolName ? `Institution: ${profile.schoolName}.` : "",
          typeof profile.isGraduate === "boolean"
            ? `Graduate: ${profile.isGraduate ? "yes" : "no"}.`
            : "",
          profile.interests?.length
            ? `Interests: ${profile.interests.slice(0, 10).join(", ")}.`
            : "",
          profile.ambitions?.length
            ? `Ambitions: ${profile.ambitions.slice(0, 10).join(", ")}.`
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      : "";

    const requirementLines = dto.requirements?.length
      ? `\nListed requirements:\n${dto.requirements
          .slice(0, 15)
          .map((r, i) => `${i + 1}. ${r.slice(0, 300)}`)
          .join("\n")}`
      : "";

    const prompt = `You are Edutu's opportunity coach for ambitious young Africans. Build a concrete, personalized preparation plan that maximizes this applicant's chance of WINNING this specific opportunity.

Opportunity: "${dto.title}"${dto.organization ? ` by ${dto.organization}` : ""}${dto.category ? ` (category: ${dto.category})` : ""}.
${dto.description ? `Details: ${dto.description.slice(0, 800)}` : ""}
${constraints}
${profileLines ? `\nApplicant profile: ${profileLines}` : ""}${requirementLines}

Rewrite each of these milestones with specific, actionable guidance for THIS opportunity${profileLines ? " and THIS applicant" : ""}. Keep the same id and order:
${scaffold.map((m, i) => `${i + 1}. [${m.id}] ${m.title}`).join("\n")}

Return ONLY valid JSON with this exact structure:
{
  "summary": "2-3 sentence motivating overview specific to this opportunity${profileLines ? " and applicant" : ""}",
  "winningStrategy": "3-4 sentences on how to genuinely stand out for this specific opportunity",
  "milestones": [ { "id": "<same id>", "title": "<refined title>", "description": "<specific, concrete guidance in 1-2 sentences>" } ],
  "checklist": ["specific document or task", "..."],
  "supportActions": ["concrete support step", "..."],
  "requirementActions": [ { "requirement": "<requirement, verbatim or condensed>", "action": "<exactly how this applicant satisfies or evidences it>" } ],
  "profileGaps": [ { "gap": "<what is missing or weak in the applicant's profile for this opportunity>", "action": "<concrete step to close the gap before the deadline>" } ],
  "bestPractices": ["what past winners of this kind of opportunity did, one concrete tactic per item"]
}
Provide 6-10 checklist items, 3-5 support actions, one requirementActions entry per listed requirement (max 15), 2-4 profileGaps (empty array if the profile is unknown), and 3-6 bestPractices.
Ground every claim in the details given above. Never invent requirements, eligibility rules, dates, or amounts that are not stated — when something is unknown, say to verify it on the official page instead of guessing.`;

    try {
      const parsed = await this.aiService.generateJson<any>({
        feature: "roadmaps.opportunity_plan",
        userId,
        prompt,
        responseMimeType: "application/json",
        temperature: 0.4,
        metadata: { title: dto.title, category: dto.category, userId },
      });

      const normalized = this.normalizeOpportunityPlan(parsed, scaffold);
      if (normalized) return { ...normalized, generatedBy: "ai" };
    } catch (e) {
      this.logger.warn(
        "AI opportunity plan generation failed",
        e instanceof Error ? e.message : String(e),
      );
    }

    return {
      ...this.fallbackOpportunityPlan(dto, scaffold),
      generatedBy: "fallback",
    };
  }

  /** Replace client-sent opportunity fields with the verified DB row's. */
  private async groundPlanDto(
    dto: OpportunityPlanDto,
  ): Promise<OpportunityPlanDto> {
    try {
      const result = await db.execute(sql`
        select
          title,
          organization,
          category,
          description,
          coalesce(close_date, deadline) as deadline,
          metadata->'requirements' as requirements
        from public.opportunities
        where id = ${dto.opportunityId}::uuid
        limit 1
      `);
      const rows = Array.isArray(result)
        ? (result as any[])
        : ((result as { rows?: any[] }).rows ?? []);
      const row = rows[0];
      if (!row?.title) return dto;

      const requirements = Array.isArray(row.requirements)
        ? row.requirements.filter((r: unknown) => typeof r === "string")
        : undefined;

      return {
        ...dto,
        title: row.title,
        organization: row.organization ?? dto.organization,
        category: row.category ?? dto.category,
        description: row.description
          ? String(row.description).slice(0, 4000)
          : dto.description,
        deadline: row.deadline
          ? new Date(row.deadline).toISOString().split("T")[0]
          : dto.deadline,
        requirements: requirements?.length ? requirements : dto.requirements,
      };
    } catch (error) {
      this.logger.warn(
        `Could not ground opportunity plan on ${dto.opportunityId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return dto;
    }
  }

  private normalizeOpportunityPlan(
    parsed: any,
    scaffold: Array<{ id: string; title: string }>,
  ): {
    summary: string;
    winningStrategy: string;
    milestones: Array<{ id: string; title: string; description: string }>;
    checklist: string[];
    supportActions: string[];
    requirementActions: Array<{ requirement: string; action: string }>;
    profileGaps: Array<{ gap: string; action: string }>;
    bestPractices: string[];
  } | null {
    if (!parsed || typeof parsed !== "object") return null;

    const aiMilestones: any[] = Array.isArray(parsed.milestones)
      ? parsed.milestones
      : [];
    if (aiMilestones.length === 0) return null;

    const byId = new Map<string, any>();
    aiMilestones.forEach((m) => {
      if (m && typeof m.id === "string") byId.set(m.id, m);
    });

    // Align AI output to the scaffold by id (falling back to positional order),
    // so a partial or reordered AI response can never drop a milestone.
    const milestones = scaffold.map((base, index) => {
      const match = byId.get(base.id) || aiMilestones[index] || {};
      const description =
        typeof match.description === "string" && match.description.trim()
          ? match.description.trim()
          : "";
      if (!description) return null;
      return {
        id: base.id,
        title:
          typeof match.title === "string" && match.title.trim()
            ? match.title.trim()
            : base.title,
        description,
      };
    });

    if (milestones.some((m) => m === null)) return null;

    const toStringList = (value: any): string[] =>
      Array.isArray(value)
        ? value
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean)
        : [];

    const summary =
      typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const winningStrategy =
      typeof parsed.winningStrategy === "string"
        ? parsed.winningStrategy.trim()
        : "";
    if (!summary || !winningStrategy) return null;

    // Pair-shaped extras ({requirement,action} / {gap,action}) are optional —
    // an older or partial AI response must never invalidate the whole plan.
    const toPairList = (
      value: any,
      keyA: string,
      keyB: string,
    ): Array<Record<string, string>> =>
      Array.isArray(value)
        ? value
            .map((item) => {
              const a =
                item && typeof item[keyA] === "string" ? item[keyA].trim() : "";
              const b =
                item && typeof item[keyB] === "string" ? item[keyB].trim() : "";
              return a && b ? { [keyA]: a, [keyB]: b } : null;
            })
            .filter((item): item is Record<string, string> => item !== null)
        : [];

    return {
      summary,
      winningStrategy,
      milestones: milestones as Array<{
        id: string;
        title: string;
        description: string;
      }>,
      checklist: toStringList(parsed.checklist),
      supportActions: toStringList(parsed.supportActions),
      requirementActions: toPairList(
        parsed.requirementActions,
        "requirement",
        "action",
      ) as Array<{ requirement: string; action: string }>,
      profileGaps: toPairList(parsed.profileGaps, "gap", "action") as Array<{
        gap: string;
        action: string;
      }>,
      bestPractices: toStringList(parsed.bestPractices).slice(0, 8),
    };
  }

  private fallbackOpportunityPlan(
    dto: OpportunityPlanDto,
    scaffold: Array<{ id: string; title: string }>,
  ): {
    summary: string;
    winningStrategy: string;
    milestones: Array<{ id: string; title: string; description: string }>;
    checklist: string[];
    supportActions: string[];
    requirementActions: Array<{ requirement: string; action: string }>;
    profileGaps: Array<{ gap: string; action: string }>;
    bestPractices: string[];
  } {
    const org = dto.organization || "the organization";
    const isScholarship = /scholar|fellow|grant/i.test(
      `${dto.category || ""} ${dto.title}`,
    );

    const requirementActions = (dto.requirements || [])
      .slice(0, 15)
      .map((requirement) => ({
        requirement,
        action: `Gather or produce the evidence that proves you meet this, and file it in your application folder.`,
      }));

    const profileGaps: Array<{ gap: string; action: string }> = [];
    if (dto.profile) {
      if (!dto.profile.pursuit) {
        profileGaps.push({
          gap: "Your field of study is missing from your profile.",
          action:
            "Add your field of study so applications can speak to your academic direction.",
        });
      }
      if (!dto.profile.ambitions?.length) {
        profileGaps.push({
          gap: "No stated career ambitions on your profile.",
          action:
            "Write 2-3 sentences on your long-term goal — selectors reward clear direction.",
        });
      }
    }

    const bestPractices = isScholarship
      ? [
          "Winners submit 3-5 days early — portals crash near deadlines.",
          "Tie every essay paragraph to one proof point (award, project, result).",
          "Brief your referees with your CV and the program's criteria before they write.",
          "Mirror the program's own language when describing your impact.",
        ]
      : [
          "Tailor your CV to the listed requirements — one line of proof per requirement.",
          "Research the organization's recent work and reference it in your motivation.",
          "Submit early and confirm receipt; follow up politely if no confirmation.",
          "Prepare a 60-second story of your best result for interviews.",
        ];

    const guidance: Record<string, string> = {
      "milestone-1": `Confirm the deadline, eligibility, required documents, and what ${org} rewards in strong applicants for ${dto.title}.`,
      "milestone-2": `Gather transcripts, certificates, ID, and an updated CV, and request recommendation letters early.`,
      "milestone-3": `Write a focused story covering impact, leadership, and why ${dto.title} is the right next step for you.`,
      "milestone-4": `Get mentor feedback, tighten weak claims, proofread, and confirm every portal requirement.`,
      "milestone-5": `Submit ahead of the deadline${dto.deadline ? ` (${dto.deadline})` : ""} and save confirmations and reference numbers.`,
    };

    return {
      summary: `A step-by-step plan to prepare a competitive application for ${dto.title}${dto.organization ? ` at ${dto.organization}` : ""}. Turn each milestone into concrete assets — documents, essays, and reviews — and submit with time to spare.`,
      winningStrategy: `Aim to submit a few days before the deadline. Use every task to produce one asset that proves ${isScholarship ? "academic strength, leadership, service, and long-term impact" : "fit, proof of skill, and motivation"}. Get a mentor to review your CV and statement before the final week.`,
      milestones: scaffold.map((m) => ({
        id: m.id,
        title: m.title,
        description:
          guidance[m.id] ||
          `Complete "${m.title}" for ${dto.title} and update your progress.`,
      })),
      checklist: [
        "Official academic transcripts",
        "Updated CV/Resume",
        "Proof of identity (passport/national ID)",
        "Academic certificates and awards",
        isScholarship
          ? "Recommendation letters (2-3)"
          : "Professional references",
        "Compelling personal statement / essays",
        "Completed online application form",
        "Final review before submission",
      ],
      supportActions: [
        `Search for a recent applicant or alumni community for ${org}.`,
        "Find one mentor to review your CV and statement before the final week.",
        "Keep one evidence folder for transcripts, certificates, ID, and letters.",
        "Book two feedback checkpoints: after the first draft and before submission.",
      ],
      requirementActions,
      profileGaps,
      bestPractices,
    };
  }

  private getDefaultMatchQuestions(topic: string): {
    questions: Array<{
      id: string;
      question: string;
      type: "text" | "select" | "multiselect";
      options?: string[];
    }>;
    roadmapSuggestion: {
      title: string;
      description: string;
      steps: Array<{ title: string; description: string; duration: string }>;
    };
  } {
    return {
      questions: [
        {
          id: "q1",
          question: "What is your current experience level?",
          type: "select" as const,
          options: ["Beginner", "Intermediate", "Advanced"],
        },
        {
          id: "q2",
          question: "How much time can you commit per week?",
          type: "select" as const,
          options: [
            "Less than 5 hours",
            "5-10 hours",
            "10-20 hours",
            "20+ hours",
          ],
        },
        {
          id: "q3",
          question: "What specific skills or outcomes do you want?",
          type: "text" as const,
        },
      ],
      roadmapSuggestion: {
        title: `${topic} Roadmap`,
        description: `A structured guide to help you master ${topic}`,
        steps: [
          {
            title: "Foundation",
            description: "Learn the basics",
            duration: "Week 1-2",
          },
          {
            title: "Core Skills",
            description: "Build essential skills",
            duration: "Week 3-4",
          },
          {
            title: "Advanced Topics",
            description: "Deep dive into complex areas",
            duration: "Week 5-6",
          },
          {
            title: "Practice & Apply",
            description: "Put your knowledge to work",
            duration: "Week 7-8",
          },
        ],
      },
    };
  }

  private async generateIntentTags(
    dto: CreateRoadmapDto,
  ): Promise<{ tags: string[]; summary: string }> {
    const prompt = `Analyze this educational roadmap and return ONLY valid JSON:
{
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "summary": "A 2-3 sentence summary of what this roadmap helps users achieve"
}

Roadmap:
Title: ${dto.title}
Description: ${dto.description}
Category: ${dto.category}
Target Audience: ${dto.targetAudience || "Not specified"}
Prerequisites: ${dto.prerequisites || "None"}
Outcomes: ${dto.outcomes || "Not specified"}
Steps: ${dto.steps.map((s) => `- ${s.title}: ${s.description}`).join("\n")}
`;

    try {
      const parsed = await this.aiService.generateJson<any>({
        feature: "roadmaps.intent_tags",
        prompt,
        responseMimeType: "application/json",
        temperature: 0.2,
        metadata: { title: dto.title, category: dto.category },
      });

      if (!parsed) return { tags: [dto.category], summary: dto.description };

      return {
        tags: parsed.tags || [dto.category],
        summary: parsed.summary || dto.description,
      };
    } catch {
      return { tags: [dto.category], summary: dto.description };
    }
  }

  private async scoreRoadmapIntentMatch(roadmapsList: Array<any>, intent: any) {
    if (roadmapsList.length === 0) return roadmapsList;

    const prompt = `Score these roadmaps for how well they match this user's intent.
Return ONLY valid JSON: { "scores": [{"id": "roadmap-id", "score": 0-100, "reason": "one sentence"}] }

User Intent:
Goals: ${JSON.stringify(intent.goals || [])}
Level: ${intent.currentLevel || "Not specified"}
Category: ${intent.targetCategory || "Any"}
Time: ${intent.timeCommitment || "Not specified"}

Roadmaps:
${roadmapsList.map((r) => `- ID: ${r.id}, Title: ${r.title}, Category: ${r.category}, Difficulty: ${r.difficulty}, Tags: ${JSON.stringify(r.aiIntentTags || [])}`).join("\n")}
`;

    try {
      const parsed = await this.aiService.generateJson<any>({
        feature: "roadmaps.match",
        prompt,
        responseMimeType: "application/json",
        temperature: 0.1,
        metadata: { roadmapCount: roadmapsList.length },
      });

      if (!parsed) return roadmapsList;

      const scores = new Map((parsed.scores || []).map((s: any) => [s.id, s]));

      return roadmapsList
        .map((r) => {
          const match = scores.get(r.id) as
            | { score?: number; reason?: string }
            | undefined;
          return {
            ...r,
            matchScore: match?.score || 50,
            matchReason: match?.reason || "",
          };
        })
        .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    } catch {
      return roadmapsList;
    }
  }

  private parseTargetDeadline(targetDeadline?: string): Date | null {
    if (!targetDeadline) return null;

    const parsed = new Date(targetDeadline);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("targetDeadline must be a valid date");
    }

    return parsed;
  }

  private buildAdoptedPlan(
    roadmap: any,
    targetOpportunityId: string | null,
    targetDeadline: Date | null,
    calendarSyncEnabled: boolean,
  ) {
    const steps = ((roadmap.steps || []) as RoadmapStep[]).map(
      (step, index) => {
        const dueAt = this.resolveStepDueAt(
          step.relativeDueDays,
          targetDeadline,
        );

        return {
          id: crypto.randomUUID(),
          sourceStepId: step.id,
          order: index,
          title: step.title,
          description: step.description,
          duration: step.duration,
          resources: step.resources || [],
          phase: step.phase || null,
          taskType: step.taskType || null,
          relativeDueDays: step.relativeDueDays ?? null,
          dueAt: dueAt ? dueAt.toISOString() : null,
          calendarSyncEnabled: step.calendarSyncEnabled ?? calendarSyncEnabled,
          completed: false,
        };
      },
    );

    return {
      roadmapId: roadmap.id,
      targetOpportunityId,
      generatedAt: new Date().toISOString(),
      deadlineStrategy: roadmap.deadlineStrategy || null,
      targetDeadline: targetDeadline ? targetDeadline.toISOString() : null,
      calendarSyncEnabled,
      steps,
    };
  }

  private resolveStepDueAt(
    relativeDueDays?: number,
    targetDeadline?: Date | null,
  ): Date | null {
    if (relativeDueDays === undefined || relativeDueDays === null) return null;
    if (!targetDeadline && relativeDueDays < 0) return null;

    const base = targetDeadline ? new Date(targetDeadline) : new Date();
    base.setDate(base.getDate() + relativeDueDays);
    return base;
  }

  private serializeRoadmap(roadmap: any) {
    if (!roadmap) return roadmap;

    return {
      ...roadmap,
      estimated_duration: roadmap.estimatedDuration,
      target_audience: roadmap.targetAudience,
      cover_image: roadmap.coverImage,
      opportunity_id: roadmap.opportunityId,
      creator_proof: roadmap.creatorProof,
      deadline_strategy: roadmap.deadlineStrategy,
      community_id: roadmap.communityId,
      calendar_sync_enabled: roadmap.calendarSyncEnabled,
      created_by: roadmap.createdBy,
      creator_name: roadmap.creatorName,
      author_role: roadmap.authorRole,
      author_avatar: roadmap.authorAvatar,
      is_featured: roadmap.isFeatured,
      enrollment_count: roadmap.enrollmentCount,
      rating_avg: roadmap.ratingAvg,
      rating_count: roadmap.ratingCount,
      related_opportunities: roadmap.relatedOpportunities,
      ai_intent_tags: roadmap.aiIntentTags,
      ai_generated_summary: roadmap.aiGeneratedSummary,
      satisfaction_score: roadmap.satisfactionScore,
      created_at: roadmap.createdAt,
      updated_at: roadmap.updatedAt,
      published_at: roadmap.publishedAt,
    };
  }

  private buildReminderSchedule(enrollment: any, roadmap?: any) {
    const adoptedPlan = enrollment.adoptedPlan || {};
    const steps = ((adoptedPlan.steps || []) as AdoptedPlanStep[])
      .filter((step) => step.dueAt)
      .map((step) => ({
        id: `roadmap-step-${step.id}`,
        type: "roadmap_step_due",
        title: step.title,
        body: `Roadmap step due: ${step.title}`,
        scheduledFor: step.dueAt,
        roadmapId: enrollment.roadmapId,
        enrollmentId: enrollment.id,
        stepId: step.id,
      }));

    const targetDeadline =
      enrollment.targetDeadline || adoptedPlan.targetDeadline;
    const deadlineReminders = targetDeadline
      ? [30, 14, 7, 3, 1]
          .map((daysBefore) => {
            const scheduledFor = new Date(targetDeadline);
            scheduledFor.setDate(scheduledFor.getDate() - daysBefore);
            return {
              id: `roadmap-deadline-${enrollment.id}-${daysBefore}`,
              type: "opportunity_deadline",
              title: `${daysBefore} day${daysBefore === 1 ? "" : "s"} until deadline`,
              body: `${roadmap?.title || "Your roadmap"} target deadline is approaching.`,
              scheduledFor: scheduledFor.toISOString(),
              roadmapId: enrollment.roadmapId,
              enrollmentId: enrollment.id,
              daysBefore,
            };
          })
          .filter((item) => new Date(item.scheduledFor).getTime() > Date.now())
      : [];

    return [...steps, ...deadlineReminders].sort(
      (a, b) =>
        new Date(a.scheduledFor || 0).getTime() -
        new Date(b.scheduledFor || 0).getTime(),
    );
  }

  private buildCommunityAction(roadmap?: any) {
    if (!roadmap?.communityId) return null;

    return {
      type: "join_community",
      communityId: roadmap.communityId,
      label: "Join roadmap community",
      route: `/app/community?communityId=${encodeURIComponent(roadmap.communityId)}`,
      message:
        "Continue with learners following this roadmap and ask for peer support.",
    };
  }

  private buildCalendarExport(enrollment: any, roadmap?: any) {
    const adoptedPlan = enrollment.adoptedPlan || {};
    const steps = ((adoptedPlan.steps || []) as AdoptedPlanStep[]).filter(
      (step) => step.dueAt,
    );
    const targetDeadline =
      enrollment.targetDeadline || adoptedPlan.targetDeadline;
    const events = [
      ...steps.map((step) => ({
        id: step.id,
        title: step.title,
        description: step.description || "",
        startsAt: step.dueAt ?? null,
        type: "roadmap_step",
      })),
      ...(targetDeadline
        ? [
            {
              id: `deadline-${enrollment.id}`,
              title: `${roadmap?.title || "Roadmap"} target deadline`,
              description:
                adoptedPlan.deadlineStrategy || roadmap?.deadlineStrategy || "",
              startsAt: new Date(targetDeadline).toISOString(),
              type: "target_deadline",
            },
          ]
        : []),
    ].filter((event) => event.startsAt);

    const filename = `${this.slugify(roadmap?.title || "edutu-roadmap")}-${enrollment.id}.ics`;
    const ics = this.buildIcs(filename, events);

    return { filename, events, ics };
  }

  private buildIcs(
    calendarName: string,
    events: Array<{
      id: string;
      title: string;
      description?: string;
      startsAt: string | null;
      type: string;
    }>,
  ) {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Edutu//Roadmap Calendar//EN",
      `X-WR-CALNAME:${this.escapeIcs(calendarName.replace(/\.ics$/i, ""))}`,
    ];

    for (const event of events) {
      if (!event.startsAt) continue;
      const startsAt = new Date(event.startsAt);
      if (Number.isNaN(startsAt.getTime())) continue;
      const endsAt = new Date(startsAt);
      endsAt.setHours(endsAt.getHours() + 1);

      lines.push(
        "BEGIN:VEVENT",
        `UID:${this.escapeIcs(`${event.id}@edutu-roadmaps`)}`,
        `DTSTAMP:${this.toIcsDate(new Date())}`,
        `DTSTART:${this.toIcsDate(startsAt)}`,
        `DTEND:${this.toIcsDate(endsAt)}`,
        `SUMMARY:${this.escapeIcs(event.title)}`,
        `DESCRIPTION:${this.escapeIcs(event.description || event.type)}`,
        "END:VEVENT",
      );
    }

    lines.push("END:VCALENDAR");
    return `${lines.join("\r\n")}\r\n`;
  }

  private toIcsDate(date: Date) {
    return date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  }

  private escapeIcs(value: string) {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  private slugify(value: string) {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "edutu-roadmap"
    );
  }

  private serializeEnrollment(enrollment: any, roadmap?: any) {
    if (!enrollment) return enrollment;
    const calendar = this.buildCalendarExport(enrollment, roadmap);
    const reminderSchedule = this.buildReminderSchedule(enrollment, roadmap);
    const communityAction = this.buildCommunityAction(roadmap);

    return {
      ...enrollment,
      user_id: enrollment.userId,
      roadmap_id: enrollment.roadmapId,
      current_step: enrollment.currentStep,
      completed_steps: enrollment.completedSteps,
      target_opportunity_id: enrollment.targetOpportunityId,
      target_deadline: enrollment.targetDeadline,
      calendar_sync_enabled: enrollment.calendarSyncEnabled,
      adopted_plan: enrollment.adoptedPlan,
      enrolled_at: enrollment.enrolledAt,
      completed_at: enrollment.completedAt,
      updated_at: enrollment.updatedAt,
      calendar: {
        enabled: Boolean(enrollment.calendarSyncEnabled),
        eventCount: calendar.events.length,
        filename: calendar.filename,
        exportUrl: `/roadmaps/enrollments/${enrollment.id}/calendar`,
      },
      reminderSchedule,
      reminder_schedule: reminderSchedule,
      communityAction,
      community_action: communityAction,
    };
  }

  private async updateRoadmapRating(
    roadmapId: string,
    score: number,
    executor: Pick<typeof db, "update"> = db,
  ) {
    await executor
      .update(roadmaps)
      .set({
        ratingAvg: sql`((${roadmaps.ratingAvg} * ${roadmaps.ratingCount}) + ${score}) / (${roadmaps.ratingCount} + 1)`,
        ratingCount: sql`${roadmaps.ratingCount} + 1`,
        satisfactionScore: sql`((${roadmaps.satisfactionScore} * ${roadmaps.ratingCount}) + ${score}) / (${roadmaps.ratingCount} + 1)`,
      })
      .where(eq(roadmaps.id, roadmapId));
  }
}
