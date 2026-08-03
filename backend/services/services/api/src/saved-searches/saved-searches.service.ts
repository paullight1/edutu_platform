import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { toDatabaseUserId } from "../common/user-id";
import { db } from "../db";
import {
  opportunities,
  savedSearchMatches,
  savedSearches,
  type SavedSearch,
} from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";
import type {
  CreateSavedSearchDto,
  UpdateSavedSearchDto,
} from "./dto/saved-search.dto";

const MAX_SAVED_SEARCHES_PER_USER = 20;
const PREVIEW_LIMIT = 20;

// Digest tunables. Saved searches can be very broad, so a single scrape run can
// match dozens of rows for one user — the only safe delivery shape is one
// batched push, hard-capped per user.
const DIGEST_MAX_USERS_PER_RUN = Number(
  process.env.SAVED_SEARCH_DIGEST_MAX_USERS || 500,
);
const DIGEST_MIN_INTERVAL_HOURS = Number(
  process.env.SAVED_SEARCH_DIGEST_INTERVAL_HOURS || 6,
);

function digestEnabled() {
  return process.env.SAVED_SEARCH_DIGEST_ENABLED !== "false";
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Opportunity rows reach us from three ingest paths with different casing
 * (Supabase snake_case rows, Drizzle camelCase rows, findOne alias rows), so
 * matching reads both spellings.
 */
type LooseRow = Record<string, unknown>;

function field(row: LooseRow, snake: string, camel: string): unknown {
  return row[snake] !== undefined && row[snake] !== null
    ? row[snake]
    : row[camel];
}

function textField(row: LooseRow, snake: string, camel: string): string {
  const value = field(row, snake, camel);
  return typeof value === "string" ? value : "";
}

/** One pending (saved search, opportunity) hit awaiting its digest push. */
interface PendingMatchRow {
  user_id: string;
  search_id: string;
  search_name: string;
  opportunity_id: string;
  title: string | null;
  deadline: string | null;
  notified_at: string;
}

/** All of one user's pending hits, collapsed into a single push. */
interface UserDigest {
  userId: string;
  /** Distinct opportunities, newest hit first. */
  matches: PendingMatchRow[];
  /** Distinct saved-search names that contributed, newest hit first. */
  searchNames: string[];
  /** Max notified_at across the included hits — the dedupe-key discriminator. */
  latestMatchAt: string;
}

/** Singular/plural- and case-insensitive category comparison. */
function normalizeCategory(value: string): string {
  return value.trim().toLowerCase().replace(/s$/, "");
}

@Injectable()
export class SavedSearchesService {
  private readonly logger = new Logger(SavedSearchesService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  async list(userId: string) {
    const dbUserId = this.requireUserId(userId);
    return db
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.userId, dbUserId))
      .orderBy(desc(savedSearches.createdAt));
  }

  async create(userId: string, dto: CreateSavedSearchDto) {
    const dbUserId = this.requireUserId(userId);

    const [existing] = await db
      .select({ count: count() })
      .from(savedSearches)
      .where(eq(savedSearches.userId, dbUserId));
    if ((existing?.count ?? 0) >= MAX_SAVED_SEARCHES_PER_USER) {
      throw new BadRequestException(
        `You can keep up to ${MAX_SAVED_SEARCHES_PER_USER} saved searches — delete one first`,
      );
    }

    const [row] = await db
      .insert(savedSearches)
      .values({
        userId: dbUserId,
        name: dto.name,
        query: dto.query?.trim() || null,
        category: dto.category?.trim() || null,
        fundingType: dto.fundingType?.trim() || null,
        targetRegion: dto.targetRegion?.trim() || null,
        remoteOnly: dto.remoteOnly ?? null,
        notifyEnabled: dto.notifyEnabled ?? true,
      })
      .returning();
    return row;
  }

  async update(userId: string, id: string, dto: UpdateSavedSearchDto) {
    this.assertUuid(id);
    const dbUserId = this.requireUserId(userId);

    const set: Partial<typeof savedSearches.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.name !== undefined) set.name = dto.name;
    if (dto.notifyEnabled !== undefined) set.notifyEnabled = dto.notifyEnabled;
    if (dto.query !== undefined) set.query = dto.query.trim() || null;
    if (dto.category !== undefined) set.category = dto.category.trim() || null;
    if (dto.fundingType !== undefined)
      set.fundingType = dto.fundingType.trim() || null;
    if (dto.targetRegion !== undefined)
      set.targetRegion = dto.targetRegion.trim() || null;
    if (dto.remoteOnly !== undefined) set.remoteOnly = dto.remoteOnly;

    const [row] = await db
      .update(savedSearches)
      .set(set)
      .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, dbUserId)))
      .returning();
    if (!row) throw new NotFoundException("Saved search not found");
    return row;
  }

  async remove(userId: string, id: string) {
    this.assertUuid(id);
    const dbUserId = this.requireUserId(userId);
    const [row] = await db
      .delete(savedSearches)
      .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, dbUserId)))
      .returning({ id: savedSearches.id });
    if (!row) throw new NotFoundException("Saved search not found");
    await db
      .delete(savedSearchMatches)
      .where(eq(savedSearchMatches.savedSearchId, id));
    return { success: true };
  }

  /** Run a saved search against the live catalog (used as the alert preview). */
  async preview(userId: string, id: string) {
    this.assertUuid(id);
    const dbUserId = this.requireUserId(userId);
    const [search] = await db
      .select()
      .from(savedSearches)
      .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, dbUserId)))
      .limit(1);
    if (!search) throw new NotFoundException("Saved search not found");

    const conditions = [eq(opportunities.status, "active")];

    if (search.query?.trim()) {
      const haystack = sql`concat_ws(' ', ${opportunities.title}, ${opportunities.summary}, ${opportunities.description}, ${opportunities.organization}, ${opportunities.category}, ${opportunities.canonicalCategory})`;
      for (const token of this.tokenize(search.query)) {
        conditions.push(sql`${haystack} ilike ${`%${token}%`}`);
      }
    }
    if (search.category?.trim()) {
      const pattern = `%${normalizeCategory(search.category)}%`;
      conditions.push(
        sql`(${opportunities.canonicalCategory} ilike ${pattern} or ${opportunities.category} ilike ${pattern} or ${opportunities.type} ilike ${pattern})`,
      );
    }
    if (search.fundingType?.trim()) {
      conditions.push(
        sql`${opportunities.fundingType} ilike ${`%${search.fundingType.trim()}%`}`,
      );
    }
    if (search.targetRegion?.trim()) {
      const pattern = `%${search.targetRegion.trim()}%`;
      conditions.push(
        sql`(${opportunities.targetRegion} ilike ${pattern} or ${opportunities.location} ilike ${pattern})`,
      );
    }
    if (search.remoteOnly) {
      conditions.push(eq(opportunities.isRemote, true));
    }

    const rows = await db
      .select({
        id: opportunities.id,
        title: opportunities.title,
        summary: opportunities.summary,
        organization: opportunities.organization,
        category: opportunities.category,
        canonicalCategory: opportunities.canonicalCategory,
        deadline: opportunities.deadline,
        imageUrl: opportunities.imageUrl,
        createdAt: opportunities.createdAt,
      })
      .from(opportunities)
      .where(and(...conditions))
      .orderBy(
        sql`${opportunities.deadline} asc nulls last`,
        desc(opportunities.createdAt),
      )
      .limit(PREVIEW_LIMIT);

    return { search, matches: rows };
  }

  // -------------------------------------------------------------------------
  // Match recording: called fire-and-forget from opportunity ingest/approval.
  // Never throws — a failed record must never break an ingest.
  //
  // This path deliberately sends NOTHING. Ingest calls it once per row, so
  // pushing here meant a 60-item scrape run produced 60 separate pushes for a
  // user with a broad saved search. Delivery is now owned entirely by the
  // half-hourly digest cron below, which batches every pending hit into one
  // push and enforces a hard per-user interval.
  // -------------------------------------------------------------------------

  async notifyNewOpportunities(rows: LooseRow[]): Promise<void> {
    try {
      const active = (rows || []).filter((row) => {
        const status = String(field(row, "status", "status") ?? "active");
        return status === "active" && field(row, "id", "id");
      });
      if (!active.length) return;

      const searches = await db
        .select()
        .from(savedSearches)
        .where(eq(savedSearches.notifyEnabled, true));
      if (!searches.length) return;

      for (const search of searches) {
        const matched = active.filter((row) => this.matchesSearch(search, row));
        if (!matched.length) continue;

        // onConflictDoNothing + RETURNING keeps this idempotent: re-ingesting
        // or re-approving the same row never re-queues it for a digest.
        const inserted = await db
          .insert(savedSearchMatches)
          .values(
            matched.map((row) => ({
              savedSearchId: search.id,
              opportunityId: String(field(row, "id", "id")),
              userId: search.userId,
            })),
          )
          .onConflictDoNothing()
          .returning({ opportunityId: savedSearchMatches.opportunityId });

        if (!inserted.length) continue;

        await db
          .update(savedSearches)
          .set({
            matchCount: sql`${savedSearches.matchCount} + ${inserted.length}`,
            lastMatchedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(savedSearches.id, search.id));
      }
    } catch (error) {
      this.logger.warn(
        `Saved-search match recording skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Digest delivery: one push per user, at most once every 6 hours.
  // -------------------------------------------------------------------------

  @Cron("*/30 * * * *")
  async runSavedSearchDigestCron() {
    if (!digestEnabled()) return;
    try {
      const result = await this.runSavedSearchDigest();
      if (result.notified > 0) {
        this.logger.log(`Saved-search digests: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      this.logger.error(
        `Saved-search digest run failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async runSavedSearchDigest(): Promise<{
    users: number;
    matches: number;
    notified: number;
  }> {
    const rows = await this.getPendingDigestRows();
    if (!rows.length) return { users: 0, matches: 0, notified: 0 };

    const digests = this.groupPendingMatches(rows);
    let notified = 0;

    for (const digest of digests) {
      try {
        await this.sendDigest(digest);
        notified += 1;
      } catch (error) {
        this.logger.warn(
          `Saved-search digest failed for ${digest.userId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { users: digests.length, matches: rows.length, notified };
  }

  /**
   * Pending hits for users who are due a digest.
   *
   * "Pending" = recorded after the last digest we sent for that saved search.
   * The throttle is evaluated across ALL of the user's searches (not just the
   * ones with pending hits), so a push for one alert silences every other alert
   * for the full interval — the hard "one saved-search push per user per 6h"
   * rule. `opportunity_alerts` defaults to true when the user never saved
   * preferences; the master push switch and quiet hours are applied later, by
   * notificationsService.broadcast().
   */
  private async getPendingDigestRows(): Promise<PendingMatchRow[]> {
    const result = await db.execute(sql`
      with due_users as (
        select s.user_id
        from saved_searches s
        join saved_search_matches m on m.saved_search_id = s.id
        left join notification_preferences p on p.user_id = s.user_id
        where s.notify_enabled
          and coalesce(p.opportunity_alerts, true)
          and m.notified_at > coalesce(s.last_notified_at, to_timestamp(0))
          and not exists (
            select 1 from saved_searches t
            where t.user_id = s.user_id
              and t.last_notified_at >
                  now() - (${DIGEST_MIN_INTERVAL_HOURS} * interval '1 hour')
          )
        group by s.user_id
        order by max(m.notified_at) desc
        limit ${DIGEST_MAX_USERS_PER_RUN}
      )
      select s.user_id        as user_id,
             s.id             as search_id,
             s.name           as search_name,
             m.opportunity_id as opportunity_id,
             o.title          as title,
             o.deadline       as deadline,
             m.notified_at    as notified_at
      from saved_search_matches m
      join saved_searches s on s.id = m.saved_search_id
      join due_users d on d.user_id = s.user_id
      join opportunities o on o.id = m.opportunity_id
      where s.notify_enabled
        and o.status = 'active'
        and m.notified_at > coalesce(s.last_notified_at, to_timestamp(0))
      order by m.notified_at desc
      limit 5000
    `);

    return (
      (result as unknown as { rows?: PendingMatchRow[] }).rows ?? []
    ).filter((row) => row?.user_id && row?.opportunity_id);
  }

  /** Collapses raw hits into one digest per user (pure — unit tested). */
  private groupPendingMatches(rows: PendingMatchRow[]): UserDigest[] {
    const byUser = new Map<string, UserDigest>();

    for (const row of rows) {
      let digest = byUser.get(row.user_id);
      if (!digest) {
        digest = {
          userId: row.user_id,
          matches: [],
          searchNames: [],
          latestMatchAt: row.notified_at,
        };
        byUser.set(row.user_id, digest);
      }

      // One opportunity can satisfy several of a user's searches — count it once.
      if (
        !digest.matches.some((m) => m.opportunity_id === row.opportunity_id)
      ) {
        digest.matches.push(row);
      }
      if (row.search_name && !digest.searchNames.includes(row.search_name)) {
        digest.searchNames.push(row.search_name);
      }
      if (
        row.notified_at &&
        String(row.notified_at) > String(digest.latestMatchAt)
      ) {
        digest.latestMatchAt = row.notified_at;
      }
    }

    return Array.from(byUser.values()).filter(
      (digest) => digest.matches.length > 0,
    );
  }

  /** Push copy for a digest (pure — unit tested). */
  private composeDigestCopy(digest: UserDigest): {
    title: string;
    body: string;
    url: string;
  } {
    const first = digest.matches[0];
    const firstTitle = (first.title || "").trim() || "A new opportunity";
    const total = digest.matches.length;
    const alerts = digest.searchNames.length;
    const alertName = digest.searchNames[0] ?? "your alert";

    if (total === 1) {
      return {
        title: `🎯 New match: ${this.truncate(firstTitle, 60)}`,
        body: `Matches your alert “${alertName}”.${this.deadlineNote({
          deadline: first.deadline,
        })}`,
        url: `/opportunities/${first.opportunity_id}`,
      };
    }

    if (alerts <= 1) {
      return {
        title: `✨ ${total} new matches for “${this.truncate(alertName, 40)}”`,
        body: `${this.truncate(firstTitle, 50)} and ${total - 1} more match your alert.`,
        url: "/saved-searches",
      };
    }

    return {
      title: `✨ ${total} new matches across ${alerts} alerts`,
      body: `${this.truncate(firstTitle, 50)} and ${total - 1} more matched your saved searches.`,
      url: "/saved-searches",
    };
  }

  private async sendDigest(digest: UserDigest): Promise<void> {
    const copy = this.composeDigestCopy(digest);
    const single = digest.matches.length === 1;

    await this.notificationsService.broadcast(digest.userId, {
      audience: "specific",
      targetUserIds: [digest.userId],
      kind: "opportunity-alert",
      severity: "info",
      title: copy.title,
      body: copy.body,
      // Must change every digest: broadcast() suppresses the push when the
      // in-app insert conflicts on (user_id, dedupe_key). The newest hit's
      // timestamp is the discriminator — successive digests always cover a
      // strictly newer hit, so no two digests can collide.
      dedupeKey: `saved-search-digest:${digest.userId}:${digest.latestMatchAt}`,
      channels: { inApp: true, push: true, email: false },
      metadata: {
        url: copy.url,
        ...(single ? { opportunityId: digest.matches[0].opportunity_id } : {}),
        matchCount: digest.matches.length,
        savedSearchCount: digest.searchNames.length,
        androidChannelId: "opportunities",
        source: "saved-search-digest",
      },
    });

    // Stamp EVERY search this user owns, not only the ones that contributed:
    // the 6-hour throttle is per user, and this is what enforces it.
    await db.execute(sql`
      update saved_searches
      set last_notified_at = now(),
          updated_at = now()
      where user_id = ${digest.userId}
    `);
  }

  private deadlineNote(row: LooseRow): string {
    const raw = field(row, "deadline", "deadline");
    if (!raw) return "";
    const date = new Date(raw as string);
    if (Number.isNaN(date.getTime())) return "";
    const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
    if (days < 0) return "";
    if (days === 0) return " Deadline is today!";
    if (days <= 14) return ` Deadline in ${days} day${days === 1 ? "" : "s"}.`;
    return ` Deadline ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.`;
  }

  // -------------------------------------------------------------------------
  // Matching
  // -------------------------------------------------------------------------

  private matchesSearch(search: SavedSearch, row: LooseRow): boolean {
    if (search.query?.trim()) {
      const tags = field(row, "tags", "tags");
      const haystack = [
        textField(row, "title", "title"),
        textField(row, "summary", "summary"),
        textField(row, "description", "description"),
        textField(row, "organization", "organization"),
        textField(row, "category", "category"),
        textField(row, "canonical_category", "canonicalCategory"),
        Array.isArray(tags) ? tags.join(" ") : "",
      ]
        .join(" ")
        .toLowerCase();
      const tokens = this.tokenize(search.query);
      if (!tokens.every((token) => haystack.includes(token))) return false;
    }

    if (search.category?.trim()) {
      const wanted = normalizeCategory(search.category);
      const candidates = [
        textField(row, "canonical_category", "canonicalCategory"),
        textField(row, "category", "category"),
        textField(row, "type", "type"),
      ]
        .filter(Boolean)
        .map(normalizeCategory);
      if (
        !candidates.some(
          (candidate) =>
            candidate.includes(wanted) || wanted.includes(candidate),
        )
      ) {
        return false;
      }
    }

    if (search.fundingType?.trim()) {
      const funding = textField(
        row,
        "funding_type",
        "fundingType",
      ).toLowerCase();
      if (!funding.includes(search.fundingType.trim().toLowerCase())) {
        return false;
      }
    }

    if (search.targetRegion?.trim()) {
      const wanted = search.targetRegion.trim().toLowerCase();
      const region = [
        textField(row, "target_region", "targetRegion"),
        textField(row, "location", "location"),
      ]
        .join(" ")
        .toLowerCase();
      if (!region.includes(wanted)) return false;
    }

    if (search.remoteOnly) {
      const remote = field(row, "is_remote", "isRemote");
      if (remote === false) return false;
    }

    return true;
  }

  private tokenize(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1)
      .slice(0, 8);
  }

  private truncate(value: string, max: number): string {
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  }

  private requireUserId(userId: string): string {
    const dbUserId = toDatabaseUserId(userId);
    if (!dbUserId) throw new BadRequestException("Invalid user");
    return dbUserId;
  }

  private assertUuid(value: string) {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException("Invalid saved search id");
    }
  }
}
