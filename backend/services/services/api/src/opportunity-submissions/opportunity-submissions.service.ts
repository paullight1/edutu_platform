import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { opportunitySubmissions } from "../db/schema";
import { toDatabaseUserId } from "../common/user-id";
import { NotificationsService } from "../notifications/notifications.service";
import { OpportunitiesService } from "../opportunities/opportunities.service";
import {
  MonetizationService,
  type CreditCharge,
} from "../monetization/monetization.service";
import { SettingsService } from "../settings/settings.service";
import {
  DEFAULT_ADMIN_SETTINGS,
  type UserContentSettings,
} from "../settings/settings.dto";
import type {
  SubmitOpportunityDto,
  RespondSubmissionDto,
  ReviewSubmissionDto,
} from "./dto/opportunity-submission.dto";

type ThreadEntry = { role: "admin" | "user"; message: string; at: string };

@Injectable()
export class OpportunitySubmissionsService {
  private readonly logger = new Logger(OpportunitySubmissionsService.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly opportunitiesService: OpportunitiesService,
    private readonly settingsService: SettingsService,
    private readonly monetizationService: MonetizationService,
  ) {}

  // ─── User side ──────────────────────────────────────────────────────────

  async submit(userId: string, dto: SubmitOpportunityDto) {
    const dbUserId = toDatabaseUserId(userId);
    const policy = await this.getUserContentPolicy();

    // Admin-controlled posting fee: check-and-debit atomically BEFORE the
    // insert (throws 402 { error: "insufficient_credits", required, balance }
    // when the balance can't cover it), refund if the insert then fails.
    let charge: CreditCharge | null = null;
    if (policy.paidSubmissions && policy.submissionCostCredits > 0) {
      charge = await this.monetizationService.chargeCredits(
        userId,
        policy.submissionCostCredits,
        "opportunity_submission_fee",
        `Opportunity submission fee (${policy.submissionCostCredits} credits)`,
      );
    }

    let row: typeof opportunitySubmissions.$inferSelect;
    try {
      // Status is always forced to `pending` server-side — the client cannot
      // submit straight to `approved` regardless of the approval knob.
      [row] = await db
        .insert(opportunitySubmissions)
        .values({
          userId: dbUserId,
          title: dto.title,
          organization: dto.organization,
          category: dto.category,
          type: dto.type,
          summary: dto.summary,
          description: dto.description,
          location: dto.location,
          isRemote: dto.isRemote ?? false,
          eligibility: dto.eligibility,
          benefits: dto.benefits,
          deadline: dto.deadline ? new Date(dto.deadline) : null,
          applyUrl: dto.applyUrl,
          sourceUrl: dto.sourceUrl,
          imageUrl: dto.imageUrl,
          extra: dto.extra ?? {},
          status: "pending",
          thread: [],
        })
        .returning();
    } catch (error) {
      if (charge) await this.monetizationService.refundCredits(charge);
      throw error;
    }

    // Admin approval switched off → publish immediately. Best-effort: if the
    // catalog insert fails the submission simply stays in the review queue
    // (never refunded — the submission itself succeeded).
    if (!policy.requireApproval) {
      row = (await this.autoPublish(row)) ?? row;
    }

    return this.serialize(row);
  }

  private async getUserContentPolicy(): Promise<UserContentSettings> {
    try {
      const { settings } = await this.settingsService.getSettings();
      return settings.userContent ?? DEFAULT_ADMIN_SETTINGS.userContent;
    } catch {
      // Fail SAFE: default policy reviews everything and charges nothing.
      return DEFAULT_ADMIN_SETTINGS.userContent;
    }
  }

  // Publish a submission straight to the live catalog (requireApproval off).
  private async autoPublish(
    row: typeof opportunitySubmissions.$inferSelect,
  ): Promise<typeof opportunitySubmissions.$inferSelect | null> {
    try {
      const opportunityId = await this.createOpportunityFromSubmission(
        row,
        "active",
      );
      const [updated] = await db
        .update(opportunitySubmissions)
        .set({
          status: "approved",
          approvedOpportunityId: opportunityId,
          updatedAt: new Date(),
        })
        .where(eq(opportunitySubmissions.id, row.id))
        .returning();
      return updated ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Auto-publish failed for submission ${row.id}; left in review queue: ${message}`,
      );
      return null;
    }
  }

  async listMine(userId: string) {
    const dbUserId = toDatabaseUserId(userId);
    const rows = await db
      .select()
      .from(opportunitySubmissions)
      .where(eq(opportunitySubmissions.userId, dbUserId))
      .orderBy(desc(opportunitySubmissions.submittedAt));
    return rows.map((r) => this.serialize(r));
  }

  async getMine(userId: string, id: string) {
    const dbUserId = toDatabaseUserId(userId);
    const [row] = await db
      .select()
      .from(opportunitySubmissions)
      .where(
        and(
          eq(opportunitySubmissions.id, id),
          eq(opportunitySubmissions.userId, dbUserId),
        ),
      );
    if (!row) throw new NotFoundException("Submission not found");
    return this.serialize(row);
  }

  // User replies to a "needs more info" query. Moves it back to `pending` so it
  // re-enters the review queue, appends to the thread, and optionally patches
  // the submitted fields.
  async respond(userId: string, id: string, dto: RespondSubmissionDto) {
    const dbUserId = toDatabaseUserId(userId);
    const [row] = await db
      .select()
      .from(opportunitySubmissions)
      .where(
        and(
          eq(opportunitySubmissions.id, id),
          eq(opportunitySubmissions.userId, dbUserId),
        ),
      );
    if (!row) throw new NotFoundException("Submission not found");
    if (row.status !== "needs_info") {
      throw new BadRequestException(
        "This submission is not awaiting your response.",
      );
    }

    const thread = this.appendThread(row.thread, "user", dto.message);
    const patch = dto.patch ?? {};

    const [updated] = await db
      .update(opportunitySubmissions)
      .set({
        status: "pending",
        userResponse: dto.message,
        thread,
        // Apply any field corrections the user included.
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.organization !== undefined
          ? { organization: patch.organization }
          : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
        ...(patch.location !== undefined ? { location: patch.location } : {}),
        ...(patch.isRemote !== undefined ? { isRemote: patch.isRemote } : {}),
        ...(patch.eligibility !== undefined
          ? { eligibility: patch.eligibility }
          : {}),
        ...(patch.benefits !== undefined ? { benefits: patch.benefits } : {}),
        ...(patch.deadline !== undefined
          ? { deadline: patch.deadline ? new Date(patch.deadline) : null }
          : {}),
        ...(patch.applyUrl !== undefined ? { applyUrl: patch.applyUrl } : {}),
        ...(patch.sourceUrl !== undefined
          ? { sourceUrl: patch.sourceUrl }
          : {}),
        ...(patch.imageUrl !== undefined ? { imageUrl: patch.imageUrl } : {}),
        updatedAt: new Date(),
      })
      .where(eq(opportunitySubmissions.id, id))
      .returning();

    return this.serialize(updated);
  }

  // ─── Admin side ─────────────────────────────────────────────────────────

  async listForAdmin(status?: string) {
    const base = db.select().from(opportunitySubmissions).$dynamic();
    const query = status
      ? base.where(eq(opportunitySubmissions.status, status))
      : base;
    const rows = await query.orderBy(desc(opportunitySubmissions.submittedAt));
    return rows.map((r) => this.serialize(r));
  }

  async getForAdmin(id: string) {
    const [row] = await db
      .select()
      .from(opportunitySubmissions)
      .where(eq(opportunitySubmissions.id, id));
    if (!row) throw new NotFoundException("Submission not found");
    return this.serialize(row);
  }

  // Admin approves / rejects / queries a submission. On approval a real
  // opportunity is created (status pending_review so it still flows through the
  // normal verification pipeline) and linked back. Every decision notifies the
  // submitter (in-app + push).
  async review(id: string, adminId: string, dto: ReviewSubmissionDto) {
    const [row] = await db
      .select()
      .from(opportunitySubmissions)
      .where(eq(opportunitySubmissions.id, id));
    if (!row) throw new NotFoundException("Submission not found");

    if (dto.decision === "needs_info" && !dto.adminNote?.trim()) {
      throw new BadRequestException(
        "A note is required when requesting more information.",
      );
    }

    let approvedOpportunityId: string | null =
      row.approvedOpportunityId ?? null;

    if (dto.decision === "approved") {
      approvedOpportunityId = await this.createOpportunityFromSubmission(row);
    }

    const thread = dto.adminNote?.trim()
      ? this.appendThread(row.thread, "admin", dto.adminNote.trim())
      : ((row.thread as ThreadEntry[] | null) ?? []);

    const [updated] = await db
      .update(opportunitySubmissions)
      .set({
        status: dto.decision,
        adminNote: dto.adminNote ?? row.adminNote ?? null,
        reviewedBy: toDatabaseUserId(adminId),
        reviewedAt: new Date(),
        approvedOpportunityId,
        thread,
        updatedAt: new Date(),
      })
      .where(eq(opportunitySubmissions.id, id))
      .returning();

    await this.notifySubmitter(adminId, row, dto);

    this.logger.log(
      `Opportunity submission ${id} → ${dto.decision} by admin ${adminId}`,
    );

    return this.serialize(updated);
  }

  private async createOpportunityFromSubmission(
    row: {
      title: string;
      summary: string | null;
      description: string | null;
      category: string | null;
      organization: string | null;
      location: string | null;
      type: string | null;
      eligibility: string | null;
      isRemote: boolean | null;
      deadline: Date | null;
      applyUrl: string | null;
      sourceUrl: string | null;
      imageUrl: string | null;
    },
    // Admin approvals keep the normal verification pipeline (pending_review);
    // auto-publish (requireApproval off) goes straight to `active`.
    status: "pending_review" | "active" = "pending_review",
  ): Promise<string | null> {
    try {
      const created = await this.opportunitiesService.create({
        title: row.title,
        summary: row.summary ?? undefined,
        description: row.description ?? undefined,
        category: row.category ?? undefined,
        organization: row.organization ?? undefined,
        location: row.location ?? undefined,
        type: row.type ?? undefined,
        eligibility: row.eligibility ?? undefined,
        isRemote: row.isRemote ?? undefined,
        deadline: row.deadline ? row.deadline.toISOString() : undefined,
        applyUrl: row.applyUrl ?? undefined,
        sourceUrl: row.sourceUrl ?? undefined,
        imageUrl: row.imageUrl ?? undefined,
        // Admin approvals go through the normal review/verification pipeline
        // (pending_review); auto-publish passes `active`.
        status,
      } as any);
      return (created as { id?: string })?.id ?? null;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `Failed to create opportunity from submission: ${message}`,
      );
      throw new BadRequestException(
        "Could not create the opportunity from this submission.",
      );
    }
  }

  private async notifySubmitter(
    adminId: string,
    row: { id: string; userId: string; title: string },
    dto: ReviewSubmissionDto,
  ) {
    const copy = {
      approved: {
        title: "Opportunity approved 🎉",
        body: `Your submission "${row.title}" was approved and is now being published.`,
        severity: "success" as const,
      },
      rejected: {
        title: "Opportunity submission update",
        body:
          dto.adminNote?.trim() ||
          `Your submission "${row.title}" was not accepted this time.`,
        severity: "warning" as const,
      },
      needs_info: {
        title: "More info needed on your submission",
        body:
          dto.adminNote?.trim() ||
          `We need a bit more detail on "${row.title}" before we can review it.`,
        severity: "info" as const,
      },
    }[dto.decision];

    try {
      await this.notificationsService.broadcast(adminId, {
        title: copy.title,
        body: copy.body,
        kind: "admin-broadcast",
        severity: copy.severity,
        audience: "specific",
        targetUserIds: [row.userId],
        channels: { inApp: true, push: true, email: false },
        metadata: {
          submissionId: row.id,
          submissionStatus: dto.decision,
          url: `/opportunities/submissions`,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Submission notification failed: ${message}`);
    }
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private appendThread(
    existing: unknown,
    role: "admin" | "user",
    message: string,
  ): ThreadEntry[] {
    const base = Array.isArray(existing) ? (existing as ThreadEntry[]) : [];
    return [...base, { role, message, at: new Date().toISOString() }];
  }

  private serialize(row: any) {
    if (!row) return row;
    return {
      id: row.id,
      user_id: row.userId,
      title: row.title,
      organization: row.organization,
      category: row.category,
      type: row.type,
      summary: row.summary,
      description: row.description,
      location: row.location,
      is_remote: row.isRemote,
      eligibility: row.eligibility,
      benefits: row.benefits,
      deadline: row.deadline,
      apply_url: row.applyUrl,
      source_url: row.sourceUrl,
      image_url: row.imageUrl,
      extra: row.extra,
      status: row.status,
      admin_note: row.adminNote,
      user_response: row.userResponse,
      thread: row.thread ?? [],
      reviewed_by: row.reviewedBy,
      reviewed_at: row.reviewedAt,
      approved_opportunity_id: row.approvedOpportunityId,
      submitted_at: row.submittedAt,
      updated_at: row.updatedAt,
    };
  }
}
