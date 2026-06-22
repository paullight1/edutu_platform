import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { opportunityVerificationRuns } from "../db/schema";

export interface VerificationRunOptions {
  limit?: number;
  maxAgeHours?: number;
  concurrency?: number;
  dryRun?: boolean;
  runType?: string;
  createdBy?: string;
}

type CandidateRow = {
  id: string;
  title: string | null;
  status: string | null;
  apply_url: string | null;
  application_url: string | null;
  link: string | null;
  source_url: string | null;
  deadline: string | Date | null;
  close_date: string | Date | null;
  verification_attempts: number | null;
  broken_link_count: number | null;
};

type VerificationOutcome = {
  opportunityId: string;
  title: string | null;
  url: string | null;
  status: "verified" | "stale" | "expired" | "broken_link" | "needs_review";
  opportunityStatus: string;
  httpStatus: number | null;
  error: string | null;
  nextCheckAt: Date | null;
};

@Injectable()
export class OpportunityVerificationService {
  private readonly logger = new Logger(OpportunityVerificationService.name);

  @Cron(CronExpression.EVERY_HOUR)
  async runScheduledVerification() {
    if (process.env.OPPORTUNITY_VERIFICATION_ENABLED !== "true") return;

    const limit = Number(
      process.env.OPPORTUNITY_VERIFICATION_BATCH_SIZE || 250,
    );
    const concurrency = Number(
      process.env.OPPORTUNITY_VERIFICATION_CONCURRENCY || 5,
    );

    try {
      await this.runBatch({
        limit,
        concurrency,
        maxAgeHours: 24,
        runType: "scheduled",
      });
    } catch (error) {
      this.logger.error(
        `Scheduled opportunity verification failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  async getStats() {
    const result = await db.execute(sql`
      select
        count(*)::int as total,
        count(*) filter (where status = 'active')::int as active,
        count(*) filter (where verification_status = 'verified')::int as verified,
        count(*) filter (where verification_status = 'unverified')::int as unverified,
        count(*) filter (where verification_status = 'stale')::int as stale,
        count(*) filter (where verification_status = 'broken_link')::int as broken_link,
        count(*) filter (where verification_status = 'expired')::int as expired,
        count(*) filter (
          where status = 'active'
            and (
              verification_next_check_at is null
              or verification_next_check_at <= now()
              or last_verified_at is null
            )
        )::int as due_now,
        count(*) filter (
          where status = 'active'
            and last_verified_at >= now() - interval '7 days'
        )::int as verified_last_7_days,
        max(last_verified_at) as newest_verification_at,
        max(updated_at) as catalog_updated_at
      from public.opportunities
      where duplicate_of is null
    `);

    return this.firstRow(result);
  }

  async runBatch(options: VerificationRunOptions = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 1000);
    const concurrency = Math.min(
      Math.max(Number(options.concurrency) || 5, 1),
      20,
    );
    const maxAgeHours = Math.min(
      Math.max(Number(options.maxAgeHours) || 24, 1),
      24 * 30,
    );

    const [run] = await db
      .insert(opportunityVerificationRuns)
      .values({
        runType: options.runType ?? "manual",
        requestedLimit: limit,
        createdBy: options.createdBy,
      })
      .returning()
      .execute();

    const candidates = await this.getCandidates(limit, maxAgeHours);
    const outcomes = await this.mapConcurrent(
      candidates,
      concurrency,
      async (candidate) =>
        this.verifyCandidate(candidate, Boolean(options.dryRun)),
    );
    const summary = this.summarize(outcomes);
    const status = summary.errorCount > 0 ? "partial" : "completed";

    await db
      .update(opportunityVerificationRuns)
      .set({
        status,
        checkedCount: outcomes.length,
        verifiedCount: summary.verifiedCount,
        staleCount: summary.staleCount,
        expiredCount: summary.expiredCount,
        brokenCount: summary.brokenCount,
        errorCount: summary.errorCount,
        errors: outcomes
          .filter((outcome) => outcome.error)
          .slice(0, 100)
          .map((outcome) => ({
            opportunityId: outcome.opportunityId,
            title: outcome.title,
            error: outcome.error,
          })),
        completedAt: new Date(),
      })
      .where(sql`${opportunityVerificationRuns.id} = ${run.id}`)
      .execute();

    return {
      runId: run.id,
      status,
      requestedLimit: limit,
      checkedCount: outcomes.length,
      dryRun: Boolean(options.dryRun),
      ...summary,
      outcomes: outcomes.slice(0, 50),
    };
  }

  async verifyOne(id: string, dryRun = false) {
    const result = await db.execute(sql`
      select
        opportunity.id,
        opportunity.title,
        opportunity.status,
        opportunity.apply_url,
        opportunity.application_url,
        opportunity.source_url,
        opportunity.deadline,
        opportunity.close_date,
        opportunity.verification_attempts,
        opportunity.broken_link_count
      from public.opportunities
      where id = ${id}::uuid
      limit 1
    `);
    const candidate = this.firstRow<CandidateRow>(result);
    if (!candidate?.id) return null;

    return this.verifyCandidate(candidate, dryRun);
  }

  private async getCandidates(limit: number, maxAgeHours: number) {
    const result = await db.execute(sql`
      select
        id,
        title,
        status,
        apply_url,
        application_url,
        source_url,
        deadline,
        close_date,
        verification_attempts,
        broken_link_count
      from public.opportunities opportunity
      left join (
        select opportunity_id, count(*)::int as engagement_count
        from public.api_partner_events
        where created_at >= now() - interval '7 days'
          and opportunity_id is not null
        group by opportunity_id
      ) engagement on engagement.opportunity_id = opportunity.id
      where opportunity.duplicate_of is null
        and opportunity.status in ('active', 'pending', 'pending_review')
        and (
          opportunity.verification_next_check_at is null
          or opportunity.verification_next_check_at <= now()
          or opportunity.last_verified_at is null
          or opportunity.last_verified_at < now() - (${maxAgeHours}::text || ' hours')::interval
        )
      order by
        case when opportunity.status = 'active' then 0 else 1 end,
        coalesce(engagement.engagement_count, 0) desc,
        case when opportunity.verification_status = 'broken_link' then 0 else 1 end,
        coalesce(opportunity.last_verified_at, 'epoch'::timestamptz) asc,
        opportunity.updated_at desc,
        opportunity.id
      limit ${limit}
    `);

    return this.rows<CandidateRow>(result);
  }

  private async verifyCandidate(candidate: CandidateRow, dryRun: boolean) {
    const expiredAt = this.expiryDate(candidate);
    const now = new Date();

    if (expiredAt && expiredAt.getTime() < now.getTime()) {
      const outcome: VerificationOutcome = {
        opportunityId: candidate.id,
        title: candidate.title,
        url: this.preferredUrl(candidate),
        status: "expired",
        opportunityStatus: "expired",
        httpStatus: null,
        error: null,
        nextCheckAt: null,
      };
      if (!dryRun) await this.persistOutcome(outcome);
      return outcome;
    }

    const url = this.preferredUrl(candidate);
    if (!url) {
      const outcome: VerificationOutcome = {
        opportunityId: candidate.id,
        title: candidate.title,
        url: null,
        status: "needs_review",
        opportunityStatus: "pending_review",
        httpStatus: null,
        error: "No application or source URL available",
        nextCheckAt: this.hoursFromNow(24),
      };
      if (!dryRun) await this.persistOutcome(outcome);
      return outcome;
    }

    const check = await this.checkUrl(url);
    const outcome = this.outcomeFromCheck(candidate, url, check);
    if (!dryRun) await this.persistOutcome(outcome);
    return outcome;
  }

  private outcomeFromCheck(
    candidate: CandidateRow,
    url: string,
    check: { httpStatus: number | null; ok: boolean; error: string | null },
  ): VerificationOutcome {
    if (check.ok) {
      return {
        opportunityId: candidate.id,
        title: candidate.title,
        url,
        status: "verified",
        opportunityStatus: "active",
        httpStatus: check.httpStatus,
        error: null,
        nextCheckAt: this.nextHealthyCheck(candidate),
      };
    }

    const hardBroken =
      check.httpStatus === 404 ||
      check.httpStatus === 410 ||
      Number(candidate.broken_link_count ?? 0) >= 1;

    return {
      opportunityId: candidate.id,
      title: candidate.title,
      url,
      status: hardBroken ? "broken_link" : "stale",
      opportunityStatus: hardBroken
        ? "pending_review"
        : candidate.status || "active",
      httpStatus: check.httpStatus,
      error: check.error,
      nextCheckAt: this.hoursFromNow(hardBroken ? 24 * 7 : 12),
    };
  }

  private async persistOutcome(outcome: VerificationOutcome) {
    await db.execute(sql`
      update public.opportunities
      set
        status = ${outcome.opportunityStatus},
        validation_status = case
          when ${outcome.status} = 'verified' then 'valid'
          when ${outcome.status} = 'expired' then 'expired'
          when ${outcome.status} = 'broken_link' then 'needs_review'
          else validation_status
        end,
        verification_status = ${outcome.status},
        verification_attempts = coalesce(verification_attempts, 0) + 1,
        verification_error = ${outcome.error},
        verification_next_check_at = ${outcome.nextCheckAt},
        last_verified_at = now(),
        last_http_status = ${outcome.httpStatus},
        broken_link_count = case
          when ${outcome.status} = 'verified' then 0
          when ${outcome.status} in ('broken_link', 'stale', 'needs_review')
            then coalesce(broken_link_count, 0) + 1
          else coalesce(broken_link_count, 0)
        end,
        updated_at = now()
      where id = ${outcome.opportunityId}::uuid
    `);
  }

  private async checkUrl(url: string) {
    try {
      const head = await this.fetchWithTimeout(url, "HEAD", 12000);
      if (head.status === 405 || head.status === 403) {
        const get = await this.fetchWithTimeout(url, "GET", 12000);
        return {
          httpStatus: get.status,
          ok: get.status >= 200 && get.status < 400,
          error: get.status >= 400 ? `HTTP ${get.status}` : null,
        };
      }

      return {
        httpStatus: head.status,
        ok: head.status >= 200 && head.status < 400,
        error: head.status >= 400 ? `HTTP ${head.status}` : null,
      };
    } catch (error) {
      return {
        httpStatus: null,
        ok: false,
        error: error instanceof Error ? error.message : "URL check failed",
      };
    }
  }

  private async fetchWithTimeout(
    url: string,
    method: "HEAD" | "GET",
    timeoutMs: number,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": "EdutuOpportunityVerifier/1.0",
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private preferredUrl(candidate: CandidateRow) {
    const raw =
      candidate.apply_url ||
      candidate.application_url ||
      candidate.link ||
      candidate.source_url;
    if (!raw) return null;

    try {
      const url = new URL(raw);
      if (!["http:", "https:"].includes(url.protocol)) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  private expiryDate(candidate: CandidateRow) {
    const value = candidate.deadline || candidate.close_date;
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private nextHealthyCheck(candidate: CandidateRow) {
    const expiry = this.expiryDate(candidate);
    if (!expiry) return this.hoursFromNow(24 * 7);

    const msUntilExpiry = expiry.getTime() - Date.now();
    if (msUntilExpiry <= 1000 * 60 * 60 * 24 * 7) {
      return this.hoursFromNow(12);
    }
    if (msUntilExpiry <= 1000 * 60 * 60 * 24 * 30) {
      return this.hoursFromNow(24);
    }
    return this.hoursFromNow(24 * 7);
  }

  private hoursFromNow(hours: number) {
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  private summarize(outcomes: VerificationOutcome[]) {
    return {
      verifiedCount: outcomes.filter((outcome) => outcome.status === "verified")
        .length,
      staleCount: outcomes.filter((outcome) => outcome.status === "stale")
        .length,
      expiredCount: outcomes.filter((outcome) => outcome.status === "expired")
        .length,
      brokenCount: outcomes.filter(
        (outcome) => outcome.status === "broken_link",
      ).length,
      errorCount: outcomes.filter((outcome) => Boolean(outcome.error)).length,
    };
  }

  private async mapConcurrent<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = [];
    let index = 0;

    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (index < items.length) {
          const current = index;
          index += 1;
          try {
            results[current] = await mapper(items[current]);
          } catch (error) {
            this.logger.warn(
              `Verification worker failed: ${
                error instanceof Error ? error.message : "unknown error"
              }`,
            );
          }
        }
      },
    );

    await Promise.all(workers);
    return results.filter(Boolean);
  }

  private rows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    return (result as { rows?: T[] }).rows ?? [];
  }

  private firstRow<T = Record<string, unknown>>(result: unknown): T {
    return this.rows<T>(result)[0] ?? ({} as T);
  }
}
