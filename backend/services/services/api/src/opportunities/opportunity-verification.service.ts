import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { opportunityVerificationRuns } from "../db/schema";
import {
  parseDeadlineDetailed,
  extractDeadlineText,
  pageSaysClosed,
  DeadlineConfidence,
} from "./deadline.util";
import {
  classifyHttpStatus,
  isInconclusive,
  decideHealthOutcome,
} from "./verification-classify";
import { AiService } from "../ai";

// Reuse the scraper's relay convention so both crawler and verifier defeat the
// same Cloudflare/anti-bot blocks. r.jina.ai returns the rendered page as text.
const VERIFIER_FETCH_RELAY_URL =
  process.env.SCRAPER_FETCH_RELAY_URL ?? "https://r.jina.ai/{url}";

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
  /**
   * Explicit broken-link counter to persist. When set, it overrides the
   * status-derived CASE logic so a WAF block never accumulates toward the
   * pending_review demotion threshold. Only genuine dead pages (404/410) count.
   */
  newBrokenLinkCount?: number;
};

@Injectable()
export class OpportunityVerificationService {
  private readonly logger = new Logger(OpportunityVerificationService.name);

  constructor(private readonly aiService: AiService) {}

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

    if (!dryRun) await this.persistOutcome(outcome);
    return outcome;
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
    };
    if (!url) return { ...base, nextCheckAt: null };

    const page = await this.fetchPageText(url);
    base.httpStatus = page.httpStatus;

    const cls = classifyHttpStatus(page.httpStatus);

    // Inconclusive fetch (WAF block, 5xx, or network failure) — even after the
    // relay attempt inside fetchPageText. We have NO evidence the opportunity
    // closed, so we must not close it: keep the current status and retry in 12h.
    // This is the fix for legit annual programs behind Cloudflare being killed.
    if (isInconclusive(cls)) {
      return {
        ...base,
        status: "stale",
        opportunityStatus: candidate.status || "active",
        error: page.error,
        nextCheckAt: this.hoursFromNow(12),
      };
    }
    if (cls === "dead") {
      return { ...base, status: "broken_link", error: page.error };
    }
    if (!page.text || pageSaysClosed(page.text)) {
      return base;
    }

    // Regex first (free, deterministic): a future date on the live page means
    // the stored one was stale/misparsed — reopen with the corrected date.
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

    // Regex found nothing usable on a live page. Ask the LLM before closing —
    // this recovers annual programs that state the next cycle only in prose.
    const aiRefreshed = await this.extractDeadlineWithAi(candidate, page.text);
    if (aiRefreshed?.date && aiRefreshed.date >= this.isoToday()) {
      return {
        ...base,
        status: "verified",
        opportunityStatus: "active",
        newCloseDate: aiRefreshed.date,
        newDeadlineConfidence: aiRefreshed.confidence,
        nextCheckAt: this.hoursFromNow(24),
      };
    }
    if (aiRefreshed?.confidence === "rolling") {
      // Rolling/ongoing program — it never expired; the stored date was wrong.
      return {
        ...base,
        status: "verified",
        opportunityStatus: "active",
        newCloseDate: null,
        newDeadlineConfidence: "rolling",
        nextCheckAt: this.hoursFromNow(24 * 7),
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

  private isoToday() {
    return new Date().toISOString().split("T")[0];
  }

  private relayEnabled(): boolean {
    return (
      process.env.OPPORTUNITY_VERIFICATION_RELAY !== "false" &&
      Boolean(VERIFIER_FETCH_RELAY_URL)
    );
  }

  private buildRelayUrl(url: string): string {
    const encoded = encodeURIComponent(url);
    return VERIFIER_FETCH_RELAY_URL.includes("{url}")
      ? VERIFIER_FETCH_RELAY_URL.replace("{url}", encoded)
      : `${VERIFIER_FETCH_RELAY_URL}${encoded}`;
  }

  /**
   * Fetch page text, escalating to the r.jina.ai relay when the origin blocks
   * us (403/429/5xx/network). This is what lets the verifier see the same live
   * pages the scraper already reaches, instead of mistaking a WAF block for a
   * dead opportunity.
   */
  private async fetchPageText(url: string): Promise<{
    httpStatus: number | null;
    text: string | null;
    error: string | null;
  }> {
    const direct = await this.rawFetchText(url);
    if (
      this.relayEnabled() &&
      isInconclusive(classifyHttpStatus(direct.httpStatus))
    ) {
      const relayed = await this.rawFetchText(this.buildRelayUrl(url));
      if (relayed.text && classifyHttpStatus(relayed.httpStatus) === "ok") {
        return relayed;
      }
    }
    return direct;
  }

  private async rawFetchText(url: string): Promise<{
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
    const cls = classifyHttpStatus(check.httpStatus);
    const decision = decideHealthOutcome({
      cls,
      currentStatus: candidate.status,
      currentBrokenCount: candidate.broken_link_count,
    });

    // A healthy page uses the deadline-aware recheck cadence; everything else
    // uses the decision's retry window.
    const nextCheckAt =
      decision.verificationStatus === "verified"
        ? this.nextHealthyCheck(candidate)
        : this.hoursFromNow(decision.recheckHours);

    return {
      opportunityId: candidate.id,
      title: candidate.title,
      url,
      status: decision.verificationStatus,
      opportunityStatus: decision.opportunityStatus,
      httpStatus: check.httpStatus,
      error: decision.verificationStatus === "verified" ? null : check.error,
      nextCheckAt,
      newBrokenLinkCount: decision.brokenLinkCount,
    };
  }

  private async persistOutcome(outcome: VerificationOutcome) {
    const hasDeadlineUpdate = outcome.newCloseDate !== undefined;
    await db.execute(sql`
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
          -- When the decision layer computed an explicit counter, trust it: a
          -- WAF block must NOT accumulate toward the pending_review demotion,
          -- only a genuinely dead page (404/410) does.
          when ${outcome.newBrokenLinkCount ?? null}::int is not null
            then ${outcome.newBrokenLinkCount ?? null}::int
          when ${outcome.status} = 'verified' then 0
          when ${outcome.status} in ('broken_link', 'stale', 'needs_review')
            then coalesce(broken_link_count, 0) + 1
          else coalesce(broken_link_count, 0)
        end,
        updated_at = now()
      where id = ${outcome.opportunityId}::uuid
    `);
  }

  private async checkUrl(url: string): Promise<{
    httpStatus: number | null;
    ok: boolean;
    error: string | null;
  }> {
    // HEAD first (cheap). Many origins reject HEAD or gate it behind a WAF, so
    // any block escalates to GET, then to the relay — the same order the
    // scraper uses — before we ever conclude a link is unreachable.
    let status = await this.headOrGetStatus(url);

    if (isInconclusive(classifyHttpStatus(status)) && this.relayEnabled()) {
      const relayed = await this.rawFetchText(this.buildRelayUrl(url));
      if (classifyHttpStatus(relayed.httpStatus) === "ok" && relayed.text) {
        status = relayed.httpStatus;
      }
    }

    return {
      httpStatus: status,
      ok: classifyHttpStatus(status) === "ok",
      error:
        classifyHttpStatus(status) === "ok"
          ? null
          : `HTTP ${status ?? "error"}`,
    };
  }

  private async headOrGetStatus(url: string): Promise<number | null> {
    try {
      const head = await this.fetchWithTimeout(url, "HEAD", 12000);
      // A blocked HEAD (403/405/429/…) is worth a GET: some origins only reject
      // the HEAD method, not the resource.
      if (isInconclusive(classifyHttpStatus(head.status))) {
        try {
          const get = await this.fetchWithTimeout(url, "GET", 12000);
          return get.status;
        } catch {
          return head.status;
        }
      }
      return head.status;
    } catch {
      return null;
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
