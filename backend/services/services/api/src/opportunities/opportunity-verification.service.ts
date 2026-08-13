import { Injectable, Logger, Optional } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { sql } from "drizzle-orm";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as http from "node:http";
import * as https from "node:https";
import { db } from "../db";
import { opportunityVerificationRuns } from "../db/schema";
import type { OpportunityDbTransaction } from "./opportunities.service";
import { CacheService } from "../common/cache/cache.service";
import { AuditService } from "../common/audit/audit.service";
import {
  parseDeadlineDetailed,
  extractDeadlineText,
  pageSaysClosed,
  DeadlineConfidence,
} from "./deadline.util";
import { AiService } from "../ai";

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
  metadata: Record<string, unknown> | null;
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
  /**
   * When set, persistOutcome also writes this to close_date/deadline (null
   * clears a disproven date) and records newDeadlineConfidence in metadata.
   */
  newCloseDate?: string | null;
  newDeadlineConfidence?: DeadlineConfidence;
  submissionId?: string | null;
  submissionReviewVersion?: number | null;
};

const MAX_OUTBOUND_REDIRECTS = 5;
const MAX_SUBMISSION_VERIFICATION_ATTEMPTS = 3;
const SUBMISSION_VERIFICATION_RETRY_DELAYS_MS = [60_000, 300_000];
const SUBMISSION_VERIFICATION_LEASE_SECONDS = 120;
const SUBMISSION_VERIFICATION_HARD_TIMEOUT_MS = 90_000;
const SUBMISSION_VERIFICATION_BATCH_SIZE = 25;

function ipv4Number(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }
  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return null;
  return (
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
  );
}

function isUnsafeIpv4(value: string): boolean {
  const number = ipv4Number(value);
  return number === null ? true : isUnsafeIpv4Number(number);
}

function isUnsafeIpv4Number(number: number): boolean {
  const first = number >>> 24;
  const second = (number >>> 16) & 0xff;
  const third = (number >>> 8) & 0xff;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && (second === 51 || second === 52)) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function parseIpv6Hextets(value: string): number[] | null {
  const normalized = value.replace(/%[0-9a-z_.-]+$/i, "");
  if (!normalized || normalized.includes("%")) return null;

  let expanded = normalized;
  const dottedIndex = expanded.lastIndexOf(":");
  if (expanded.includes(".")) {
    if (dottedIndex < 0) return null;
    const ipv4 = ipv4Number(expanded.slice(dottedIndex + 1));
    if (ipv4 === null) return null;
    expanded = `${expanded.slice(0, dottedIndex + 1)}${(
      (ipv4 >>> 16) &
      0xffff
    ).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const compression = expanded.indexOf("::");
  if (compression !== -1 && compression !== expanded.lastIndexOf("::")) {
    return null;
  }

  const parsePart = (part: string) => {
    if (!part) return [];
    const values = part.split(":");
    if (values.some((item) => !/^[0-9a-f]{1,4}$/i.test(item))) return null;
    return values.map((item) => parseInt(item, 16));
  };

  if (compression >= 0) {
    const left = parsePart(expanded.slice(0, compression));
    const right = parsePart(expanded.slice(compression + 2));
    if (!left || !right || left.length + right.length >= 8) return null;
    return [
      ...left,
      ...Array(8 - left.length - right.length).fill(0),
      ...right,
    ];
  }

  const parts = parsePart(expanded);
  return parts?.length === 8 ? parts : null;
}

function ipv4NumberFromIpv6(value: string): number | null {
  const hextets = parseIpv6Hextets(value);
  if (!hextets) return null;
  const firstFiveZero = hextets.slice(0, 5).every((part) => part === 0);
  const compatible = hextets.slice(0, 6).every((part) => part === 0);
  const mapped = firstFiveZero && hextets[5] === 0xffff;
  if (!mapped && !compatible) return null;
  return ((hextets[6] << 16) | hextets[7]) >>> 0;
}

function isUnsafeIp(value: string): boolean {
  const normalized = value.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(normalized) === 4) return isUnsafeIpv4(normalized);
  if (isIP(normalized) !== 6) return true;

  const mappedIpv4 = ipv4NumberFromIpv6(normalized);
  if (mappedIpv4 !== null) return isUnsafeIpv4Number(mappedIpv4);

  const hextets = parseIpv6Hextets(normalized);
  if (!hextets) return true;
  const first = hextets[0];
  return (
    first === 0 ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00
  );
}

function isUnsafeHostname(hostname: string): boolean {
  const normalized = hostname.replace(/\.$/, "").toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized === "metadata.google.com" ||
    normalized === "metadata.google.internal" ||
    normalized === "instance-data" ||
    normalized === "instance-data.ec2.internal" ||
    /^0x[0-9a-f]+$/i.test(normalized) ||
    /^\d+$/.test(normalized)
  );
}

type SafeResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text(): Promise<string>;
};

@Injectable()
export class OpportunityVerificationService {
  private readonly logger = new Logger(OpportunityVerificationService.name);

  constructor(
    private readonly aiService: AiService,
    @Optional() private readonly cache?: CacheService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async enqueueSubmissionVerification(
    tx: OpportunityDbTransaction,
    input: {
      submissionId: string;
      opportunityId: string;
      reviewVersion: number;
    },
  ) {
    const result = await tx.execute(sql`
      insert into public.opportunity_verification_operations
        (submission_id, opportunity_id, review_version, status, next_attempt_at)
      values
        (${input.submissionId}::uuid, ${input.opportunityId}::uuid,
         ${input.reviewVersion}, 'queued', now())
      on conflict (submission_id, review_version)
      do update set updated_at = now()
      returning id, status, attempt_count, next_attempt_at
    `);
    return this.firstRow<{
      id: string;
      status: string;
      attempt_count: number;
      next_attempt_at: Date;
    }>(result);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runDueSubmissionVerificationOperations() {
    // A worker can terminate after claiming an operation and before it can
    // persist either success or failure. Requeue expired leases first so a
    // crashed worker cannot strand an approved submission forever. The normal
    // claim/failure path below still owns the attempt bound and alerting.
    const due = await db.execute(sql`
      with candidates as (
        select id, status, lease_token
        from public.opportunity_verification_operations
        where (
          status = 'running'
          and (
            (lease_expires_at is not null and lease_expires_at <= now())
            or (
              lease_expires_at is null
              and coalesce(updated_at, created_at)
                <= now() - (${SUBMISSION_VERIFICATION_LEASE_SECONDS}::text || ' seconds')::interval
            )
          )
        )
        or (
          status in ('queued', 'retry')
          and next_attempt_at <= now()
        )
        order by
          case when status = 'running' then 0 else 1 end,
          coalesce(lease_expires_at, next_attempt_at, updated_at, created_at),
          created_at,
          id
        limit ${SUBMISSION_VERIFICATION_BATCH_SIZE}
        for update skip locked
      ),
      reclaimed as (
        update public.opportunity_verification_operations operation
        set status = 'retry',
            next_attempt_at = now(),
            lease_token = null,
            lease_expires_at = null,
            last_error = coalesce(
              operation.last_error,
              'Verification worker lease expired before completion'
            ),
            updated_at = now()
        where exists (
          select 1
          from candidates candidate
          where candidate.id = operation.id
            and candidate.status = 'running'
            and operation.lease_token is not distinct from candidate.lease_token
        )
        returning operation.id
      )
      select candidate.id
      from candidates candidate
      left join reclaimed on reclaimed.id = candidate.id
    `);
    const operationIds = this.rows<{ id: string }>(due).map(
      (operation) => operation.id,
    );
    for (const operationId of operationIds) {
      try {
        await this.processSubmissionVerificationOperation(operationId);
      } catch (error) {
        this.logger.error(
          `Verification recovery persistence failed for ${operationId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async processSubmissionVerificationOperation(operationId: string) {
    const claimed = this.firstRow<{
      id: string;
      opportunity_id: string;
      status: string;
      attempt_count: number;
      lease_token: string;
    }>(
      await db.execute(sql`
      update public.opportunity_verification_operations
      set status = 'running',
          attempt_count = attempt_count + 1,
          lease_token = gen_random_uuid(),
          lease_expires_at = now() + (${SUBMISSION_VERIFICATION_LEASE_SECONDS}::text || ' seconds')::interval,
          updated_at = now()
      where id = ${operationId}::uuid
        and status in ('queued', 'retry')
        and next_attempt_at <= now()
      returning id, opportunity_id, status, attempt_count, lease_token
    `),
    );

    if (!claimed.id) {
      const current = this.firstRow<{ status: string }>(
        await db.execute(sql`
        select status from public.opportunity_verification_operations
        where id = ${operationId}::uuid
      `),
      );
      return {
        state:
          current.status === "completed"
            ? "verified_public"
            : current.status === "cancelled"
              ? "withdrawn"
              : "approved_for_verification",
      } as const;
    }

    try {
      const outcome = await this.verifyWithHardTimeout(claimed.opportunity_id);
      if (outcome?.status === "verified") {
        const persisted = await db.execute(sql`
          update public.opportunity_verification_operations
          set status = 'completed',
              completed_at = now(),
              lease_token = null,
              lease_expires_at = null,
              updated_at = now()
          where id = ${operationId}::uuid
            and status = 'running'
            and lease_token = ${claimed.lease_token}::uuid
        `);
        if (!this.didUpdateRow(persisted)) {
          return { state: "approved_for_verification" } as const;
        }
        return { state: "verified_public" } as const;
      }
      if (outcome?.status === "stale") {
        const cancelled = await db.execute(sql`
          update public.opportunity_verification_operations
          set status = 'cancelled', lease_token = null, lease_expires_at = null, updated_at = now()
          where id = ${operationId}::uuid
            and status = 'running'
            and lease_token = ${claimed.lease_token}::uuid
        `);
        if (!this.didUpdateRow(cancelled)) {
          return { state: "approved_for_verification" } as const;
        }
        return { state: "withdrawn" } as const;
      }
      return await this.recordSubmissionVerificationFailure(
        operationId,
        outcome?.error ?? "Verification did not produce a public result",
        claimed.attempt_count,
        claimed.lease_token,
      );
    } catch (error) {
      return await this.recordSubmissionVerificationFailure(
        operationId,
        error instanceof Error ? error.message : String(error),
        claimed.attempt_count,
        claimed.lease_token,
      );
    }
  }

  private async recordSubmissionVerificationFailure(
    operationId: string,
    error: string,
    attemptCount: number,
    leaseToken: string,
  ) {
    const exhausted = attemptCount >= MAX_SUBMISSION_VERIFICATION_ATTEMPTS;
    const delay =
      SUBMISSION_VERIFICATION_RETRY_DELAYS_MS[
        Math.min(
          attemptCount - 1,
          SUBMISSION_VERIFICATION_RETRY_DELAYS_MS.length - 1,
        )
      ] ?? SUBMISSION_VERIFICATION_RETRY_DELAYS_MS.at(-1)!;
    const persisted = await db.execute(sql`
      update public.opportunity_verification_operations
      set status = ${exhausted ? "exhausted" : "retry"},
          last_error = ${error},
          next_attempt_at = ${exhausted ? new Date() : new Date(Date.now() + delay)},
          lease_token = null,
          exhausted_at = ${exhausted ? new Date() : null},
          lease_expires_at = null,
          updated_at = now()
      where id = ${operationId}::uuid
        and status = 'running'
        and lease_token = ${leaseToken}::uuid
    `);
    if (!this.didUpdateRow(persisted)) {
      return { state: "approved_for_verification" } as const;
    }
    if (exhausted) {
      this.logger.error(
        `Opportunity verification exhausted retries for operation ${operationId}: ${error}`,
      );
      await this.auditService?.log(
        "opportunity.verification.exhausted",
        "system",
        "opportunity_verification_operation",
        { operationId, error, attempts: attemptCount, severity: "critical" },
      );
      return { state: "approved_for_verification", exhausted: true } as const;
    }
    return {
      state: "approved_for_verification",
      retryAt: new Date(Date.now() + delay),
    } as const;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runScheduledVerification() {
    // Enabled by default; set OPPORTUNITY_VERIFICATION_ENABLED=false to opt out.
    if (process.env.OPPORTUNITY_VERIFICATION_ENABLED === "false") return;

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

  private async verifyWithHardTimeout(id: string) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.verifyOne(id),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Verification operation timed out")),
            SUBMISSION_VERIFICATION_HARD_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
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
        opportunity.broken_link_count,
        opportunity.metadata
      -- The alias is required: every column above is qualified with it, and
      -- without it Postgres raises "missing FROM-clause entry for table
      -- opportunity" — this endpoint 500'd on every call until now.
      from public.opportunities opportunity
      where id = ${id}::uuid
      limit 1
    `);
    const candidate = this.firstRow<CandidateRow>(result);
    if (!candidate?.id) return null;

    return this.verifyCandidate(candidate, dryRun);
  }

  /**
   * Verify an explicit set of rows (the admin's bulk "Find Deadlines").
   * One request replaces N browser round-trips: the page fetches and LLM
   * fallbacks run here with bounded concurrency instead of sequentially
   * from the client, which made 100-row selections look permanently stuck.
   */
  async verifyMany(ids: string[], dryRun = false) {
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
        opportunity.broken_link_count,
        opportunity.metadata
      from public.opportunities opportunity
      where opportunity.id = any(${ids}::uuid[])
    `);
    const candidates = this.rows<CandidateRow>(result);

    const outcomes = await this.mapConcurrent(candidates, 6, (candidate) =>
      this.verifyCandidate(candidate, dryRun),
    );

    const found = outcomes.filter((outcome) =>
      Boolean(outcome.newCloseDate),
    ).length;
    const rolling = outcomes.filter(
      (outcome) =>
        outcome.newCloseDate === null &&
        outcome.newDeadlineConfidence === "rolling",
    ).length;
    const failed =
      outcomes.filter((outcome) => Boolean(outcome.error)).length +
      (ids.length - candidates.length);

    return {
      requested: ids.length,
      checked: outcomes.length,
      found,
      rolling,
      failed,
      dryRun,
      outcomes: outcomes.map((outcome) => ({
        opportunityId: outcome.opportunityId,
        status: outcome.status,
        newCloseDate: outcome.newCloseDate ?? null,
        error: outcome.error,
      })),
    };
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
        broken_link_count,
        metadata
      from public.opportunities opportunity
      left join (
        select opportunity_id, count(*)::int as engagement_count
        from public.api_partner_events
        where created_at >= now() - interval '7 days'
          and opportunity_id is not null
        group by opportunity_id
      ) engagement on engagement.opportunity_id = opportunity.id
      where opportunity.duplicate_of is null
        and (
          (
            opportunity.status in ('active', 'pending', 'pending_review')
            and (
              opportunity.verification_next_check_at is null
              or opportunity.verification_next_check_at <= now()
              or opportunity.last_verified_at is null
              or opportunity.last_verified_at < now() - (${maxAgeHours}::text || ' hours')::interval
            )
          )
          -- Closed rows get periodic re-checks too: annual programs reopen
          -- and misparsed deadlines wrongly close live opportunities. A
          -- confirmed close schedules the next look ~30 days out.
          or (
            opportunity.status = 'closed'
            and opportunity.verification_next_check_at is not null
            and opportunity.verification_next_check_at <= now()
          )
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
      // Verify before closing: stored deadlines are scraped (and sometimes
      // year-inferred), so a past date alone is not proof the opportunity
      // closed. Re-read the live page — annual programs update it with the
      // next cycle's deadline.
      const outcome = await this.verifyExpiredAgainstSource(candidate);
      if (!dryRun && !(await this.persistOutcome(outcome))) {
        return this.stalePersistenceOutcome(outcome);
      }
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
        ...this.submissionContext(candidate),
      };
      if (!dryRun && !(await this.persistOutcome(outcome))) {
        return this.stalePersistenceOutcome(outcome);
      }
      return outcome;
    }

    const check = await this.checkUrl(url);
    const outcome = this.outcomeFromCheck(candidate, url, check);

    // A row with no deadline and no "rolling" signal is in limbo: it can
    // never expire, so it would stay Active forever. While the link is
    // healthy, keep trying to recover a real deadline from the page.
    if (
      check.ok &&
      !this.expiryDate(candidate) &&
      this.deadlineConfidence(candidate) !== "rolling"
    ) {
      const refreshed = await this.extractDeadlineFromSource(candidate, url);
      if (refreshed) {
        outcome.newCloseDate = refreshed.date;
        outcome.newDeadlineConfidence = refreshed.confidence;
        // Re-check soon once a deadline exists so expiry handling kicks in.
        outcome.nextCheckAt = this.hoursFromNow(72);
      }
    }

    if (!dryRun && !(await this.persistOutcome(outcome))) {
      return this.stalePersistenceOutcome(outcome);
    }
    return outcome;
  }

  private stalePersistenceOutcome(
    outcome: VerificationOutcome,
  ): VerificationOutcome {
    return {
      ...outcome,
      status: "stale",
      opportunityStatus: "pending_review",
      error: "Verification result was superseded by a newer submission review",
      nextCheckAt: null,
    };
  }

  /**
   * The stored deadline has passed. Re-read the live page before closing:
   * - page gone (404/410) → closed
   * - page explicitly says applications closed → closed
   * - page shows a future deadline → refresh the date and keep it active
   * - page alive but still shows the past deadline / no deadline → closed,
   *   with a ~30-day re-check so annual reopenings are picked up
   * - fetch failed transiently → leave status untouched, retry in 12h
   */
  private async verifyExpiredAgainstSource(
    candidate: CandidateRow,
  ): Promise<VerificationOutcome> {
    const url = this.preferredUrl(candidate);
    const base: VerificationOutcome = {
      opportunityId: candidate.id,
      title: candidate.title,
      url,
      status: "expired",
      // Canonical vocabulary: deadline-passed opportunities are "closed"
      opportunityStatus: "closed",
      httpStatus: null,
      error: null,
      nextCheckAt: this.hoursFromNow(24 * 30),
      ...this.submissionContext(candidate),
    };
    if (!url) return { ...base, nextCheckAt: null };

    const page = await this.fetchPageText(url);
    base.httpStatus = page.httpStatus;

    if (page.error && page.httpStatus === null) {
      // Transient network failure — don't close on missing evidence.
      return {
        ...base,
        status: "stale",
        opportunityStatus: candidate.status || "active",
        error: page.error,
        nextCheckAt: this.hoursFromNow(12),
      };
    }
    if (page.httpStatus === 404 || page.httpStatus === 410) {
      return { ...base, status: "broken_link", error: page.error };
    }
    if (!page.text || pageSaysClosed(page.text)) {
      return base;
    }

    const refreshed = this.parsePageDeadline(candidate, page.text);
    if (refreshed?.date && refreshed.date >= this.isoToday()) {
      // The live page shows a future deadline — the stored one was stale or
      // misparsed. Reopen with the corrected date.
      return {
        ...base,
        status: "verified",
        opportunityStatus: "active",
        newCloseDate: refreshed.date,
        newDeadlineConfidence: refreshed.confidence,
        nextCheckAt: this.hoursFromNow(24),
      };
    }

    return base;
  }

  private async extractDeadlineFromSource(
    candidate: CandidateRow,
    url: string,
  ) {
    const page = await this.fetchPageText(url);
    if (!page.text) return null;
    const refreshed = this.parsePageDeadline(candidate, page.text);
    if (refreshed?.date) return refreshed;

    // Regex found nothing usable. That's precisely the cohort stuck on
    // deadline_confidence='unknown', so it's worth an LLM call to read the page
    // the way a human would ("applications close six weeks from publication").
    return await this.extractDeadlineWithAi(candidate, page.text);
  }

  private parsePageDeadline(candidate: CandidateRow, pageText: string) {
    const fragment = extractDeadlineText(pageText);
    if (!fragment) return null;
    const titleYear = candidate.title?.match(/\b(20\d{2})\b/)?.[1];
    return parseDeadlineDetailed(
      fragment,
      titleYear ? Number(titleYear) : null,
    );
  }

  /**
   * LLM fallback for pages the regex can't read. Deliberately narrow: it only
   * runs after extractDeadlineText/parseDeadlineDetailed have failed, so the
   * common case stays free and deterministic.
   */
  private async extractDeadlineWithAi(
    candidate: CandidateRow,
    pageText: string,
  ): Promise<{ date: string | null; confidence: DeadlineConfidence } | null> {
    if (process.env.OPPORTUNITY_DEADLINE_AI === "false") return null;

    // Deadlines live near the top or in an "how to apply" block; sending the
    // whole page burns tokens for no accuracy.
    const excerpt = pageText.slice(0, 12000);
    if (excerpt.trim().length < 80) return null;

    // This path costs money and is otherwise invisible — without a log there's
    // no way to tell "AI said no deadline" from "AI never ran".
    this.logger.log(
      `Regex found no deadline for ${candidate.id}; asking AI (${excerpt.length} chars)`,
    );

    try {
      const result = await this.aiService.generateJson<{
        deadline?: string | null;
        rolling?: boolean | null;
      }>({
        feature: "opportunities.extract",
        prompt: [
          "Extract the application deadline for this opportunity.",
          "",
          "Rules:",
          '- Return {"deadline": "YYYY-MM-DD"} only if the page states or clearly implies a specific closing date.',
          '- Return {"rolling": true, "deadline": null} if applications are explicitly rolling/ongoing/open until filled.',
          '- Return {"deadline": null} if the page does not state a deadline.',
          "- NEVER guess or invent a date. A wrong date is worse than none.",
          "- If only a day and month appear, use the year that makes the date fall after the page's publication.",
          "",
          `Opportunity title: ${candidate.title ?? "(unknown)"}`,
          "",
          "Page text:",
          excerpt,
        ].join("\n"),
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            deadline: { type: ["string", "null"] },
            rolling: { type: ["boolean", "null"] },
          },
        },
        temperature: 0,
        maxOutputTokens: 200,
        metadata: { opportunityId: candidate.id },
      });

      if (result?.rolling) return { date: null, confidence: "rolling" };

      // Run the model's answer back through the same parser as everything else:
      // it keeps the date-column contract in one place, and rejects the model
      // handing back prose instead of a date.
      const parsed = parseDeadlineDetailed(result?.deadline ?? null, null);
      if (!parsed.date) {
        this.logger.log(
          `AI found no deadline for ${candidate.id} (raw: ${JSON.stringify(result)})`,
        );
        return null;
      }

      // The model inferred this from page context rather than reading an
      // explicit label — never claim "explicit" for an LLM-derived date.
      return { date: parsed.date, confidence: "inferred" };
    } catch (error) {
      this.logger.warn(
        `AI deadline extraction failed for ${candidate.id}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return null;
    }
  }

  private deadlineConfidence(candidate: CandidateRow): DeadlineConfidence {
    const value = candidate.metadata?.["deadline_confidence"];
    return value === "explicit" ||
      value === "inferred" ||
      value === "rolling" ||
      value === "unknown"
      ? value
      : "unknown";
  }

  private submissionContext(candidate: CandidateRow) {
    const submissionId = candidate.metadata?.submission_id;
    const rawVersion = candidate.metadata?.submission_review_version;
    const submissionReviewVersion =
      typeof rawVersion === "number"
        ? rawVersion
        : typeof rawVersion === "string" && /^\d+$/.test(rawVersion)
          ? Number(rawVersion)
          : null;
    return {
      submissionId: typeof submissionId === "string" ? submissionId : null,
      submissionReviewVersion,
    };
  }

  private isoToday() {
    return new Date().toISOString().split("T")[0];
  }

  private async fetchPageText(url: string): Promise<{
    httpStatus: number | null;
    text: string | null;
    error: string | null;
  }> {
    try {
      const response = await this.fetchWithTimeout(url, "GET", 15000);
      if (response.status >= 400) {
        return {
          httpStatus: response.status,
          text: null,
          error: `HTTP ${response.status}`,
        };
      }
      const html = (await response.text()).slice(0, 500_000);
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { httpStatus: response.status, text, error: null };
    } catch (error) {
      return {
        httpStatus: null,
        text: null,
        error: error instanceof Error ? error.message : "Page fetch failed",
      };
    }
  }

  private outcomeFromCheck(
    candidate: CandidateRow,
    url: string,
    check: { httpStatus: number | null; ok: boolean; error: string | null },
  ): VerificationOutcome {
    const submissionId = candidate.metadata?.submission_id;
    const submissionReviewStatus = candidate.metadata?.submission_review_status;
    if (submissionId && submissionReviewStatus !== "approved") {
      return {
        opportunityId: candidate.id,
        title: candidate.title,
        url,
        status: "needs_review",
        opportunityStatus: candidate.status || "pending_review",
        httpStatus: check.httpStatus,
        error: "User submission is not approved for publication",
        nextCheckAt: null,
        ...this.submissionContext(candidate),
      };
    }

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
        ...this.submissionContext(candidate),
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
      ...this.submissionContext(candidate),
    };
  }

  private async persistOutcome(outcome: VerificationOutcome): Promise<boolean> {
    const hasDeadlineUpdate = outcome.newCloseDate !== undefined;
    const result = await db.execute(sql`
      update public.opportunities
      set
        status = ${outcome.opportunityStatus},
        close_date = case
          when ${hasDeadlineUpdate} then ${outcome.newCloseDate ?? null}::timestamptz
          else close_date
        end,
        deadline = case
          when ${hasDeadlineUpdate} then ${outcome.newCloseDate ?? null}::timestamptz
          else deadline
        end,
        metadata = case
          when ${hasDeadlineUpdate} then coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'deadline_confidence', ${outcome.newDeadlineConfidence ?? "unknown"}::text,
              'deadline_reverified_at', now()::text
            )
          else metadata
        end,
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
        and (
          ${outcome.submissionId ?? null}::text is null
          or (
            metadata ->> 'submission_id' = ${outcome.submissionId ?? null}
            and metadata ->> 'submission_review_status' = 'approved'
            and coalesce((metadata ->> 'submission_review_version')::int, 0)
              = ${outcome.submissionReviewVersion ?? 0}
          )
        )
    `);
    const affectedRows =
      typeof result === "object" && result !== null
        ? ((result as { rowCount?: number; affectedRows?: number }).rowCount ??
          (result as { affectedRows?: number }).affectedRows)
        : undefined;
    const changed =
      affectedRows === undefined ? true : Number(affectedRows) > 0;
    await this.cache?.delByPrefix("opps:");
    return changed;
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
  ): Promise<SafeResponse> {
    let currentUrl = url;
    for (
      let redirectCount = 0;
      redirectCount <= MAX_OUTBOUND_REDIRECTS;
      redirectCount += 1
    ) {
      const target = await this.safeOutboundTarget(currentUrl);
      const response = await this.requestPinned(target, method, timeoutMs);
      if (response.status < 300 || response.status >= 400) return response;

      const location = response.headers.location;
      if (!location || Array.isArray(location)) {
        throw new Error("Unsafe redirect without a single Location header");
      }
      if (redirectCount === MAX_OUTBOUND_REDIRECTS) {
        throw new Error("Redirect limit exceeded");
      }
      currentUrl = new URL(location, currentUrl).toString();
    }

    throw new Error("Redirect limit exceeded");
  }

  private async safeOutboundTarget(url: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Unsafe outbound URL");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Unsafe outbound URL protocol");
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
    if (isUnsafeHostname(hostname)) {
      throw new Error("Unsafe private or metadata hostname");
    }
    if (isIP(hostname) && isUnsafeIp(hostname)) {
      throw new Error("Unsafe private or link-local IP address");
    }

    if (isIP(hostname)) {
      return { parsed, address: hostname, family: isIP(hostname) };
    }

    let addresses: Array<{ address: string; family: number }>;
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new Error("Could not resolve outbound hostname");
    }
    if (
      addresses.length === 0 ||
      addresses.some((entry) => isUnsafeIp(entry.address))
    ) {
      throw new Error("Outbound hostname resolves to a private or reserved IP");
    }

    return {
      parsed,
      address: addresses[0].address,
      family: addresses[0].family,
    };
  }

  private requestPinned(
    target: {
      parsed: URL;
      address: string;
      family: number;
    },
    method: "HEAD" | "GET",
    timeoutMs: number,
  ): Promise<SafeResponse> {
    const transport = target.parsed.protocol === "https:" ? https : http;
    return new Promise((resolve, reject) => {
      const request = transport.request(
        target.parsed,
        {
          method,
          headers: { "user-agent": "EdutuOpportunityVerifier/1.0" },
          servername: isIP(target.parsed.hostname)
            ? undefined
            : target.parsed.hostname,
          lookup: ((...args: any[]) => {
            const callback = args[args.length - 1] as (
              error: Error | null,
              address: string,
              family: number,
            ) => void;
            callback(null, target.address, target.family);
          }) as any,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) =>
            chunks.push(Buffer.from(chunk)),
          );
          response.on("end", () => {
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers as Record<
                string,
                string | string[] | undefined
              >,
              text: async () => Buffer.concat(chunks).toString("utf8"),
            });
          });
          response.on("error", reject);
        },
      );
      request.setTimeout(timeoutMs, () => {
        request.destroy(new Error("URL check timed out"));
      });
      request.on("error", reject);
      request.end();
    });
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

  private didUpdateRow(result: unknown): boolean {
    if (!result || typeof result !== "object") return true;
    const typed = result as { rowCount?: number; affectedRows?: number };
    const count = typed.rowCount ?? typed.affectedRows;
    return count === undefined ? true : count > 0;
  }
}
