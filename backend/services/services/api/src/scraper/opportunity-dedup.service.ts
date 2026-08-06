import { Injectable, Logger } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Duplicate detection + domain trust gate for scraped opportunities.
 *
 * Non-breaking by design: this service only ANNOTATES records in the persist
 * batch (sets `duplicate_of`, caps `status` at 'pending_review', writes
 * `metadata.dedup` / `metadata.trust_gate` notes). It never deletes rows or
 * prevents inserts, and every check fails open on DB errors.
 */

// ─── Pure helpers (exported for unit tests) ──────────────────────────────────

/** Lowercase, strip punctuation/years/edition noise, split to word tokens. */
export function normalizeTitleTokens(title: string): string[] {
  return (title || "")
    .toLowerCase()
    .replace(/\b20\d{2}(\s*[/–-]\s*(?:20)?\d{2})?\b/g, " ") // years / "2025/26"
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * Dice coefficient over token sets: 2·|A∩B| / (|A|+|B|). Returns 0..1.
 * Cheap, dependency-free, order-insensitive.
 */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeTitleTokens(a));
  const tb = new Set(normalizeTitleTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return (2 * overlap) / (ta.size + tb.size);
}

export function normalizeOrganization(org: string | null | undefined): string {
  return (org || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** True when both dates parse and are within `days` of each other, or both are absent. */
export function deadlinesCompatible(
  a: string | null | undefined,
  b: string | null | undefined,
  days = 3,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(ta - tb) <= days * 24 * 60 * 60 * 1000;
}

/** Multi-part public suffixes we care about for African/edu domains. */
const MULTI_PART_TLDS = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.ng",
  "org.ng",
  "edu.ng",
  "gov.ng",
  "co.za",
  "org.za",
  "ac.za",
  "gov.za",
  "co.ke",
  "or.ke",
  "ac.ke",
  "go.ke",
  "com.gh",
  "org.gh",
  "edu.gh",
  "gov.gh",
  "com.au",
  "org.au",
  "edu.au",
  "co.in",
  "org.in",
  "ac.in",
  "com.br",
  "org.br",
]);

/** Extract the registrable domain (eTLD+1) from a URL. Null when unparsable. */
export function registrableDomain(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.length === 2 ? host : null;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

/**
 * Domain-trust decision (pure). A domain is "established" when the DB already
 * holds >= `threshold` active opportunities on it. Unestablished domains are
 * capped at 'pending_review'; nothing is ever promoted or dropped.
 */
export function decideDomainTrust(
  currentStatus: string,
  domain: string | null,
  activeCountForDomain: number,
  gateEnabled: boolean,
  threshold = 3,
): { status: string; capped: boolean } {
  if (!gateEnabled || currentStatus !== "active") {
    return { status: currentStatus, capped: false };
  }
  if (!domain) {
    // No parsable apply domain on an about-to-publish row: hold for review.
    return { status: "pending_review", capped: true };
  }
  if (activeCountForDomain >= threshold) {
    return { status: currentStatus, capped: false };
  }
  return { status: "pending_review", capped: true };
}

export function isDomainTrustGateEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = (env.SCRAPER_DOMAIN_TRUST_GATE ?? "").trim().toLowerCase();
  // Default ON; only explicit opt-out disables it.
  return !["false", "0", "off", "no", "disabled"].includes(raw);
}

export function isScamGateEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = (env.SCRAPER_SCAM_GATE ?? "").trim().toLowerCase();
  // Default ON; only explicit opt-out disables it.
  return !["false", "0", "off", "no", "disabled"].includes(raw);
}

/**
 * Safely pull the LLM-written scam signals off a record's metadata. Tolerates
 * missing metadata, a missing/malformed `red_flags` (non-array), and non-string
 * or blank entries — always returns a clean, trimmed list; never throws.
 */
export function extractRedFlags(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = (metadata as Record<string, unknown>).red_flags;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    .map((f) => f.trim());
}

/** Two or more scam signals holds the listing (caps 'active' → review). */
export const SCAM_GATE_CAP_THRESHOLD = 2;

/**
 * Scam-gate decision (pure). Mirrors {@link decideDomainTrust}: annotate-only,
 * never promotes.
 *   0 flags / gate off   → untouched.
 *   >=1 flag             → needs review (status preserved).
 *   >=cap threshold      → additionally cap an 'active' row at 'pending_review'
 *                          (an already pending_review/rejected row is left as-is
 *                          — capping never demotes a held row upward).
 */
export function decideScamGate(
  currentStatus: string,
  flagCount: number,
  gateEnabled: boolean,
  capThreshold = SCAM_GATE_CAP_THRESHOLD,
): { status: string; capped: boolean; needsReview: boolean } {
  if (!gateEnabled || flagCount < 1) {
    return { status: currentStatus, capped: false, needsReview: false };
  }
  if (flagCount >= capThreshold && currentStatus === "active") {
    return { status: "pending_review", capped: true, needsReview: true };
  }
  return { status: currentStatus, capped: false, needsReview: true };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const TITLE_SIMILARITY_THRESHOLD = 0.85;
export const DOMAIN_TRUST_MIN_ACTIVE = 3;

interface ExistingRow {
  id: string;
  canonical_url: string | null;
  content_fingerprint: string | null;
  title: string | null;
  organization: string | null;
  close_date: string | null;
}

export interface DedupAnnotationSummary {
  checked: number;
  duplicates: number;
  byFingerprint: number;
  byTitleOrg: number;
}

@Injectable()
export class OpportunityDedupService {
  private readonly logger = new Logger(OpportunityDedupService.name);
  private supabase: SupabaseClient | null = null;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      this.supabase = createClient(url, key);
    } else {
      this.logger.warn(
        "Supabase not configured — dedup and trust gate are no-ops.",
      );
    }
  }

  /**
   * Annotate records in the batch that duplicate an EXISTING row with a
   * different canonical_url. Mutates records in place:
   *   duplicate_of = existing id, status = 'pending_review',
   *   metadata.dedup = { matchedBy, matchedId }.
   * Two cheap tiers, each a single batched query — never per-row queries.
   */
  async annotateDuplicates(
    allRecords: Record<string, any>[],
    skipCanonicalUrls?: Set<string>,
  ): Promise<DedupAnnotationSummary> {
    // Records whose canonical_url already exists in the DB keep their
    // existing status (preserved by the caller) — only gate NEW rows.
    const records = skipCanonicalUrls
      ? allRecords.filter(
          (r) => !skipCanonicalUrls.has(r.canonical_url as string),
        )
      : allRecords;
    const summary: DedupAnnotationSummary = {
      checked: records.length,
      duplicates: 0,
      byFingerprint: 0,
      byTitleOrg: 0,
    };
    if (!this.supabase || records.length === 0) return summary;

    try {
      // Tier 1: exact content_fingerprint match (one IN query for the batch).
      const fingerprints = Array.from(
        new Set(
          records
            .map((r) => r.content_fingerprint as string | null)
            .filter((f): f is string => Boolean(f)),
        ),
      );
      const byFingerprint = new Map<string, ExistingRow>();
      if (fingerprints.length > 0) {
        const { data, error } = await this.supabase
          .from("opportunities")
          .select(
            "id, canonical_url, content_fingerprint, title, organization, close_date",
          )
          .in("content_fingerprint", fingerprints);
        if (error) throw error;
        for (const row of (data as ExistingRow[]) ?? []) {
          if (
            row.content_fingerprint &&
            !byFingerprint.has(row.content_fingerprint)
          ) {
            byFingerprint.set(row.content_fingerprint, row);
          }
        }
      }

      const unresolved: Record<string, any>[] = [];
      for (const rec of records) {
        const fp = rec.content_fingerprint as string | null;
        const match = fp ? byFingerprint.get(fp) : undefined;
        if (
          match &&
          match.canonical_url &&
          match.canonical_url !== rec.canonical_url
        ) {
          this.markDuplicate(rec, match.id, "content_fingerprint");
          summary.byFingerprint++;
        } else {
          unresolved.push(rec);
        }
      }

      // Tier 2: near-identical title + deadline within 3 days.
      //
      // This used to key candidate lookup on `organization`, which made it a
      // no-op for exactly the rows that need it: an absent organiser meant the
      // record was skipped outright (`if (!candidates) continue`). That is now
      // the common case — the scraper stores null rather than guessing an
      // organiser from the title — and it is also how the legacy aggregator
      // cohort (no fingerprint, no organiser) escaped both tiers and left
      // visible duplicate listings.
      //
      // Title is the one field the publish gate guarantees, so candidates are
      // fetched by title instead. The ILIKE is only a net to narrow the batch;
      // the real test remains Dice similarity over year-stripped tokens plus a
      // compatible deadline, so precision is unchanged.
      const titleProbes = new Map<string, string>();
      for (const rec of unresolved) {
        const tokens = normalizeTitleTokens((rec.title as string) ?? "")
          // Commas/parens/quotes break PostgREST .or() syntax.
          .filter((t) => t.length >= 3 && !/[,()*%"\\]/.test(t))
          .slice(0, 3);
        if (tokens.length === 0) continue;
        titleProbes.set(tokens.join("*"), tokens.join("*"));
      }

      if (titleProbes.size > 0) {
        // Values with spaces must be double-quoted inside a PostgREST or();
        // PostgREST uses * as the ILIKE wildcard.
        const orFilter = Array.from(titleProbes.values())
          .map((pattern) => `title.ilike."*${pattern}*"`)
          .join(",");
        const { data, error } = await this.supabase
          .from("opportunities")
          .select(
            "id, canonical_url, content_fingerprint, title, organization, close_date",
          )
          .or(orFilter)
          .limit(1000);
        if (error) throw error;
        const candidates = (data as ExistingRow[]) ?? [];

        for (const rec of unresolved) {
          const match = candidates.find(
            (row) =>
              row.canonical_url &&
              row.canonical_url !== rec.canonical_url &&
              deadlinesCompatible(
                row.close_date,
                rec.close_date as string | null,
              ) &&
              titleSimilarity(row.title ?? "", (rec.title as string) ?? "") >=
                TITLE_SIMILARITY_THRESHOLD,
          );
          if (match) {
            this.markDuplicate(rec, match.id, "title_deadline");
            summary.byTitleOrg++;
          }
        }
      }
    } catch (e: any) {
      // Fail open — a dedup hiccup must never block persisting the run.
      this.logger.warn(`Duplicate detection skipped: ${e.message}`);
    }

    summary.duplicates = summary.byFingerprint + summary.byTitleOrg;
    if (summary.duplicates > 0) {
      this.logger.log(
        `Dedup: flagged ${summary.duplicates}/${summary.checked} record(s) as likely duplicates ` +
          `(${summary.byFingerprint} by fingerprint, ${summary.byTitleOrg} by title+deadline).`,
      );
    }
    return summary;
  }

  private markDuplicate(
    rec: Record<string, any>,
    matchedId: string,
    matchedBy: string,
  ): void {
    rec.duplicate_of = matchedId;
    rec.status = "pending_review"; // never auto-active for likely duplicates
    const metadata = (rec.metadata ?? {}) as Record<string, unknown>;
    metadata.dedup = { matchedBy, matchedId };
    metadata.needs_review = true;
    rec.metadata = metadata;
  }

  /**
   * Trust gate: cap 'active' records on new/unestablished apply-URL domains
   * at 'pending_review'. A domain is established when >= 3 active
   * opportunities already live on it. One batched query per persist.
   * Toggle with SCRAPER_DOMAIN_TRUST_GATE (default ON).
   */
  async applyDomainTrustGate(
    records: Record<string, any>[],
    skipCanonicalUrls?: Set<string>,
  ): Promise<{ capped: number }> {
    if (!isDomainTrustGateEnabled()) return { capped: 0 };
    if (!this.supabase || records.length === 0) return { capped: 0 };

    const wouldPublish = records.filter(
      (r) =>
        r.status === "active" &&
        !skipCanonicalUrls?.has(r.canonical_url as string),
    );
    if (wouldPublish.length === 0) return { capped: 0 };

    const domains = Array.from(
      new Set(
        wouldPublish
          .map((r) =>
            registrableDomain(
              (r.application_url as string) || (r.apply_url as string),
            ),
          )
          .filter((d): d is string => Boolean(d)),
      ),
    );

    const activeCounts = new Map<string, number>();
    try {
      if (domains.length > 0) {
        const orFilter = domains
          .map((d) => `apply_url.ilike.*${d}*,application_url.ilike.*${d}*`)
          .join(",");
        const { data, error } = await this.supabase
          .from("opportunities")
          .select("apply_url, application_url")
          .eq("status", "active")
          .or(orFilter)
          .limit(5000);
        if (error) throw error;
        for (const row of (data as Array<Record<string, string | null>>) ??
          []) {
          const d =
            registrableDomain(row.application_url) ??
            registrableDomain(row.apply_url);
          if (d && domains.includes(d)) {
            activeCounts.set(d, (activeCounts.get(d) ?? 0) + 1);
          }
        }
      }
    } catch (e: any) {
      // Fail open: on a DB blip, do not hold anything back.
      this.logger.warn(`Domain trust gate skipped: ${e.message}`);
      return { capped: 0 };
    }

    let capped = 0;
    for (const rec of wouldPublish) {
      const domain = registrableDomain(
        (rec.application_url as string) || (rec.apply_url as string),
      );
      const decision = decideDomainTrust(
        rec.status as string,
        domain,
        domain ? (activeCounts.get(domain) ?? 0) : 0,
        true,
        DOMAIN_TRUST_MIN_ACTIVE,
      );
      if (decision.capped) {
        rec.status = decision.status;
        const metadata = (rec.metadata ?? {}) as Record<string, unknown>;
        metadata.trust_gate = {
          domain,
          activeOnDomain: domain ? (activeCounts.get(domain) ?? 0) : 0,
          reason: domain ? "unestablished_domain" : "unparsable_apply_domain",
        };
        metadata.needs_review = true;
        rec.metadata = metadata;
        capped++;
      }
    }
    if (capped > 0) {
      this.logger.log(
        `Trust gate: held ${capped} record(s) on new/unestablished domains for review.`,
      );
    }
    return { capped };
  }

  /**
   * Scam gate: hold listings the extractor flagged with scam signals
   * (`metadata.red_flags`: fee-to-apply, guaranteed-win language, etc.) for
   * admin review. Annotate-only and purely in-memory — no DB round-trip:
   *   1 flag   → `metadata.needs_review = true` + `metadata.scam_risk`, status kept.
   *   >=2 flags → additionally cap an 'active' row at 'pending_review'.
   * Existing rows (in `skipCanonicalUrls`) keep their admin-pinned status and
   * are left untouched, exactly like the trust gate. Toggle with
   * SCRAPER_SCAM_GATE (default ON). Fails safe: malformed metadata is ignored.
   */
  applyScamGate(
    records: Record<string, any>[],
    skipCanonicalUrls?: Set<string>,
  ): { flagged: number; capped: number } {
    if (!isScamGateEnabled()) return { flagged: 0, capped: 0 };

    let flagged = 0;
    let capped = 0;
    for (const rec of records) {
      // Re-scrapes: an admin-pinned existing row is off-limits to the gate.
      if (skipCanonicalUrls?.has(rec.canonical_url as string)) continue;

      const flags = extractRedFlags(rec.metadata);
      const decision = decideScamGate(rec.status as string, flags.length, true);
      if (!decision.needsReview) continue;

      // Merge, never clobber: dedup/trust_gate keys written earlier survive.
      const metadata = (rec.metadata ?? {}) as Record<string, unknown>;
      metadata.scam_risk = { flags, count: flags.length };
      metadata.needs_review = true;
      rec.metadata = metadata;
      flagged++;

      if (decision.capped) {
        rec.status = decision.status;
        capped++;
      }
    }

    if (flagged > 0) {
      this.logger.log(
        `Scam gate: flagged ${flagged} record(s) with scam signals for review ` +
          `(${capped} capped to pending_review).`,
      );
    }
    return { flagged, capped };
  }
}
