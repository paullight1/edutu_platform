import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { opportunitySubmissions } from "../db/schema";
import { toDatabaseUserId } from "../common/user-id";
import { NotificationsService } from "../notifications/notifications.service";
import {
  OpportunitiesService,
  type OpportunityDbTransaction,
  type SubmissionCatalogInput,
} from "../opportunities/opportunities.service";
import { OpportunityVerificationService } from "../opportunities/opportunity-verification.service";
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
import { isSafeHttpUrl } from "./dto/opportunity-submission.dto";

type ThreadEntry = { role: "admin" | "user"; message: string; at: string };

@Injectable()
export class OpportunitySubmissionsService {
  private readonly logger = new Logger(OpportunitySubmissionsService.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly opportunitiesService: OpportunitiesService,
    private readonly settingsService: SettingsService,
    private readonly monetizationService: MonetizationService,
    @Optional()
    private readonly opportunityVerificationService?: OpportunityVerificationService,
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

  // Admin approves / rejects / queries a submission. The submission row lock,
  // catalog insert/status change, and approved_opportunity_id link share one
  // transaction. Verification owns the only transition to active/verified.
  async review(id: string, adminId: string, dto: ReviewSubmissionDto) {
    if (dto.decision === "needs_info" && !dto.adminNote?.trim()) {
      throw new BadRequestException(
        "A note is required when requesting more information.",
      );
    }

    const outcome = await db.transaction(async (tx) => {
      const row = await this.selectSubmissionForUpdate(tx, id);
      if (!row) throw new NotFoundException("Submission not found");

      const repeatedDecision = row.status === dto.decision;
      let approvedOpportunityId = row.approvedOpportunityId ?? null;
      let shouldVerify = false;
      let verificationOperationId: string | null = null;

      if (dto.decision === "approved") {
        approvedOpportunityId = approvedOpportunityId
          ? await this.opportunitiesService.prepareSubmissionOpportunityForApproval(
              tx,
              approvedOpportunityId,
              row.id,
              this.toCatalogInput(row),
            )
          : await this.opportunitiesService.createPendingReviewFromSubmission(
              tx,
              this.toCatalogInput(row),
            );
        shouldVerify = true;
        if (
          approvedOpportunityId &&
          this.opportunityVerificationService?.enqueueSubmissionVerification
        ) {
          const reviewVersion =
            await this.opportunitiesService.getSubmissionCatalogReviewVersion(
              tx,
              approvedOpportunityId,
            );
          const operation =
            await this.opportunityVerificationService.enqueueSubmissionVerification(
              tx,
              {
                submissionId: row.id,
                opportunityId: approvedOpportunityId,
                reviewVersion,
              },
            );
          verificationOperationId = operation?.id ?? null;
        }
      } else if (approvedOpportunityId && !repeatedDecision) {
        await this.opportunitiesService.setSubmissionCatalogReviewState(
          tx,
          approvedOpportunityId,
          row.id,
          dto.decision,
        );
      }

      if (repeatedDecision && dto.decision !== "approved") {
        return {
          row,
          shouldVerify: false,
          notify: false,
          verificationOperationId,
          publicationState: "not_published" as const,
        };
      }

      const thread = dto.adminNote?.trim()
        ? this.appendThread(row.thread, "admin", dto.adminNote.trim())
        : ((row.thread as ThreadEntry[] | null) ?? []);
      const [updated] = await tx
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

      if (!updated) throw new Error("Submission review could not be persisted");
      return {
        row: updated,
        shouldVerify,
        notify: !repeatedDecision,
        verificationOperationId,
        publicationState:
          dto.decision === "approved"
            ? ("approved_for_verification" as const)
            : ("not_published" as const),
      };
    });

    await this.opportunitiesService.invalidateCatalogCache();

    let publicationState:
      | "approved_for_verification"
      | "verified_public"
      | "withdrawn"
      | "not_published" = outcome.publicationState;
    if (
      outcome.shouldVerify &&
      outcome.row.approvedOpportunityId &&
      this.opportunityVerificationService
    ) {
      if (
        outcome.verificationOperationId &&
        this.opportunityVerificationService
          .processSubmissionVerificationOperation
      ) {
        const verification =
          await this.opportunityVerificationService.processSubmissionVerificationOperation(
            outcome.verificationOperationId,
          );
        publicationState = verification.state;
      } else {
        // Compatibility fallback for isolated callers that provide the
        // verifier without the durable-operation methods. Production wiring
        // always takes the operation path above.
        const verification =
          await this.opportunityVerificationService.verifyOne(
            outcome.row.approvedOpportunityId,
          );
        if (verification?.status === "verified") {
          publicationState = "verified_public";
        }
      }
    }

    if (outcome.notify) {
      await this.notifySubmitter(adminId, outcome.row, dto);
    }

    this.logger.log(
      `Opportunity submission ${id} → ${dto.decision} by admin ${adminId}`,
    );

    return {
      ...this.serialize(outcome.row),
      publication_state: publicationState,
    };
  }

  private async selectSubmissionForUpdate(
    tx: OpportunityDbTransaction,
    id: string,
  ): Promise<typeof opportunitySubmissions.$inferSelect | null> {
    const result = await tx.execute(sql`
      select * from public.opportunity_submissions
      where id = ${id}::uuid
      for update
    `);
    const raw = (result as { rows?: Record<string, unknown>[] }).rows?.[0];
    if (!raw) return null;
    return {
      ...(raw as any),
      userId: raw.userId ?? raw.user_id,
      isRemote: raw.isRemote ?? raw.is_remote,
      applyUrl: raw.applyUrl ?? raw.apply_url,
      sourceUrl: raw.sourceUrl ?? raw.source_url,
      imageUrl: raw.imageUrl ?? raw.image_url,
      adminNote: raw.adminNote ?? raw.admin_note,
      userResponse: raw.userResponse ?? raw.user_response,
      reviewedBy: raw.reviewedBy ?? raw.reviewed_by,
      reviewedAt: raw.reviewedAt ?? raw.reviewed_at,
      approvedOpportunityId:
        raw.approvedOpportunityId ?? raw.approved_opportunity_id,
      submittedAt: raw.submittedAt ?? raw.submitted_at,
      updatedAt: raw.updatedAt ?? raw.updated_at,
    } as typeof opportunitySubmissions.$inferSelect;
  }

  private toCatalogInput(
    row: typeof opportunitySubmissions.$inferSelect,
  ): SubmissionCatalogInput {
    if (!isSafeHttpUrl(row.applyUrl)) {
      throw new BadRequestException(
        "A valid http(s) apply URL is required before approval.",
      );
    }
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      summary: row.summary,
      description: row.description,
      category: row.category,
      organization: row.organization,
      location: row.location,
      type: row.type,
      eligibility: row.eligibility,
      benefits: row.benefits,
      isRemote: row.isRemote,
      deadline: row.deadline,
      applyUrl: row.applyUrl,
      sourceUrl: row.sourceUrl,
      imageUrl: row.imageUrl,
    };
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
        kind: "application-status",
        severity: copy.severity,
        audience: "specific",
        targetUserIds: [row.userId],
        channels: { inApp: true, push: true, email: false },
        metadata: {
          submissionId: row.id,
          submissionStatus: dto.decision,
          url: `/opportunities/submissions`,
        },
        dedupeKey: `submission-status:${row.id}:${dto.decision}`,
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
