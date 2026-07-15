import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { toDatabaseUserId } from "../common/user-id";
import { db } from "../db";
import {
  notificationPreferences,
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
  // Alerting: called fire-and-forget from opportunity ingest/approval.
  // Never throws — a failed alert must never break an ingest.
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

      // search id -> new (not-previously-notified) matching rows
      const hitsBySearch = new Map<string, LooseRow[]>();
      for (const search of searches) {
        const matched = active.filter((row) => this.matchesSearch(search, row));
        if (!matched.length) continue;

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
        const newIds = new Set(inserted.map((item) => item.opportunityId));
        hitsBySearch.set(
          search.id,
          matched.filter((row) => newIds.has(String(field(row, "id", "id")))),
        );
      }
      if (!hitsBySearch.size) return;

      const matchedSearches = searches.filter((search) =>
        hitsBySearch.has(search.id),
      );
      const userIds = Array.from(
        new Set(matchedSearches.map((search) => search.userId)),
      );
      const prefsRows = await db
        .select()
        .from(notificationPreferences)
        .where(inArray(notificationPreferences.userId, userIds));
      const prefsByUser = new Map(prefsRows.map((row) => [row.userId, row]));

      for (const search of matchedSearches) {
        const prefs = prefsByUser.get(search.userId);
        // opportunityAlerts defaults to true when the user never saved prefs.
        if (prefs && prefs.opportunityAlerts === false) continue;

        const hits = hitsBySearch.get(search.id)!;
        await this.deliverAlert(search, hits, prefs?.pushNotifications ?? true);

        await db
          .update(savedSearches)
          .set({
            matchCount: sql`${savedSearches.matchCount} + ${hits.length}`,
            lastMatchedAt: new Date(),
            lastNotifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(savedSearches.id, search.id));
      }
    } catch (error) {
      this.logger.warn(
        `Saved-search alerting skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async deliverAlert(
    search: SavedSearch,
    hits: LooseRow[],
    pushEnabled: boolean,
  ) {
    const first = hits[0];
    const firstId = String(field(first, "id", "id"));
    const firstTitle =
      textField(first, "title", "title") || "A new opportunity";

    const single = hits.length === 1;
    const title = single
      ? `🎯 New match: ${this.truncate(firstTitle, 60)}`
      : `✨ ${hits.length} new matches for “${search.name}”`;
    const body = single
      ? `Matches your alert “${search.name}”.${this.deadlineNote(first)}`
      : `${this.truncate(firstTitle, 50)} and ${hits.length - 1} more match your alert.`;
    const url = single ? `/opportunities/${firstId}` : "/saved-searches";

    await this.notificationsService.broadcast(search.userId, {
      audience: "specific",
      targetUserIds: [search.userId],
      kind: "opportunity-alert",
      severity: "info",
      title,
      body,
      dedupeKey: `saved-search:${search.id}:${firstId}`,
      channels: { inApp: true, push: pushEnabled, email: false },
      metadata: {
        url,
        savedSearchId: search.id,
        ...(single ? { opportunityId: firstId } : {}),
        matchCount: hits.length,
      },
    });
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
