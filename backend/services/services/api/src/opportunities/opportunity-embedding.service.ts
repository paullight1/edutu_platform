import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { createHash } from "crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { opportunities, userProfileEmbeddings } from "../db/schema";
import { AiService } from "../ai";
import { TtlCache } from "../common/cache/ttl-cache";

export const EMBEDDING_DIMENSIONS = 768;

// Gemini free-tier RPM safety: batch size * pause keeps backfills well under
// rate limits while staying resumable (embedded_at is the cursor).
const BACKFILL_BATCH_SIZE = 50;
const BACKFILL_BATCH_PAUSE_MS = 500;
const PROFILE_EMBEDDING_CACHE_TTL_MS = 10 * 60 * 1000;

type ProfileLike = Record<string, unknown> | null | undefined;
type PreferencesLike = Record<string, unknown> | null | undefined;

export interface BackfillResult {
  processed: number;
  embedded: number;
  skipped: number;
  failed: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

function parseVector(value: unknown): number[] | null {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Owns everything embedding-shaped for recommendations:
 * - opportunity embeddings (written at ingestion + backfill + hourly cron)
 * - per-user profile embeddings (hash-invalidated, cached)
 *
 * Every method degrades gracefully: when AiService.embed() returns null
 * (no GEMINI_API_KEY, route disabled, provider down) callers get null/false
 * and the recommendation engine falls back to the heuristic ranker.
 */
@Injectable()
export class OpportunityEmbeddingService {
  private readonly logger = new Logger(OpportunityEmbeddingService.name);
  private readonly profileEmbeddingCache = new TtlCache<{
    hash: string;
    embedding: number[];
  }>(PROFILE_EMBEDDING_CACHE_TTL_MS, 500);

  constructor(private readonly aiService: AiService) {}

  /**
   * Deterministic corpus text for one opportunity row. Field order is fixed —
   * changing it invalidates comparability with previously stored vectors.
   */
  buildOpportunityText(row: Record<string, unknown>): string {
    const metadata = (row.metadata as Record<string, unknown>) || {};
    const parts = [
      String(row.title ?? ""),
      String(row.organization ?? ""),
      String(row.canonicalCategory ?? row.canonical_category ?? ""),
      String(row.category ?? ""),
      String(row.type ?? ""),
      toStringArray(row.skills).join(", "),
      toStringArray(row.tags).join(", "),
      String(row.summary ?? ""),
      String(row.eligibilityCriteria ?? row.eligibility_criteria ?? "") ||
        toStringArray(metadata.requirements).join("\n"),
      String(row.targetRegion ?? row.target_region ?? ""),
      String(row.fundingType ?? row.funding_type ?? ""),
      String(row.description ?? "").slice(0, 1500),
    ];

    return parts
      .map((part) => part.trim())
      .filter(Boolean)
      .join("\n");
  }

  /** Deterministic query text for a user profile + explicit preferences. */
  buildProfileText(profile: ProfileLike, preferences: PreferencesLike): string {
    const p = profile || {};
    const prefs = preferences || {};
    const parts = [
      String(p.country ?? ""),
      String(p.major ?? p.fieldOfStudy ?? p.field_of_study ?? ""),
      String(p.degree ?? p.educationLevel ?? p.education_level ?? ""),
      toStringArray(p.skills).length
        ? `Skills: ${toStringArray(p.skills).join(", ")}`
        : "",
      toStringArray(p.interests).length
        ? `Interests: ${toStringArray(p.interests).join(", ")}`
        : "",
      toStringArray(p.interestedCountries ?? p.interested_countries).length
        ? `Interested countries: ${toStringArray(p.interestedCountries ?? p.interested_countries).join(", ")}`
        : "",
      toStringArray(prefs.preferredCategories).length
        ? `Preferred categories: ${toStringArray(prefs.preferredCategories).join(", ")}`
        : "",
      toStringArray(prefs.preferredRegions).length
        ? `Preferred regions: ${toStringArray(prefs.preferredRegions).join(", ")}`
        : "",
      toStringArray(prefs.preferredSkills).length
        ? `Preferred skills: ${toStringArray(prefs.preferredSkills).join(", ")}`
        : "",
      toStringArray(prefs.preferredOpportunityTypes).length
        ? `Preferred types: ${toStringArray(prefs.preferredOpportunityTypes).join(", ")}`
        : "",
      String(prefs.notes ?? ""),
    ];

    return parts
      .map((part) => part.trim())
      .filter(Boolean)
      .join("\n");
  }

  /**
   * Stable hash of the matching-relevant profile inputs. Key order is
   * canonicalized so semantically identical profiles hash identically.
   */
  profileHash(profile: ProfileLike, preferences: PreferencesLike): string {
    // The profile text IS the canonical projection of what matters for
    // matching — hash it directly so text and hash can never drift apart.
    const text = this.buildProfileText(profile, preferences);
    return createHash("sha256").update(text).digest("hex");
  }

  /** Embeds and persists one opportunity. Never throws; false = degraded. */
  async embedOpportunity(opportunityId: string): Promise<boolean> {
    try {
      const [row] = await db
        .select()
        .from(opportunities)
        .where(eq(opportunities.id, opportunityId))
        .limit(1)
        .execute();

      if (!row) return false;

      const text = this.buildOpportunityText(row as Record<string, unknown>);
      if (!text) return false;

      const result = await this.aiService.embed({
        feature: "embeddings.opportunity",
        input: text,
        taskType: "RETRIEVAL_DOCUMENT",
        dimensions: EMBEDDING_DIMENSIONS,
        metadata: { opportunityId },
      });

      const embedding = result?.embeddings?.[0];
      if (!embedding?.length) return false;

      await db.execute(sql`
        update ${opportunities}
        set embedding = ${toVectorLiteral(embedding)}::vector,
            embedding_model = ${result!.model},
            embedded_at = now()
        where id = ${opportunityId}
      `);

      return true;
    } catch (error) {
      this.logger.warn(
        `embedOpportunity(${opportunityId}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /**
   * Cached, hash-invalidated profile embedding. Null when embeddings are
   * unavailable — callers must fall back to heuristic candidate retrieval.
   */
  async getProfileEmbedding(
    userId: string,
    profile: ProfileLike,
    preferences: PreferencesLike,
  ): Promise<number[] | null> {
    try {
      // Chat-learned interests/dislikes enrich the embedding text so what the
      // coach learns moves recommendations everywhere. Hashing the combined
      // text keeps the stored-vector invalidation contract: new memory →
      // new hash → re-embed on next request.
      const memoryText = await this.buildMemoryText(userId);
      const baseText = this.buildProfileText(profile, preferences);
      const text = [baseText, memoryText].filter(Boolean).join("\n");
      if (!text) return null;
      const hash = createHash("sha256").update(text).digest("hex");

      const cached = this.profileEmbeddingCache.get(userId);
      if (cached && cached.hash === hash) return cached.embedding;

      const [stored] = await db
        .select()
        .from(userProfileEmbeddings)
        .where(eq(userProfileEmbeddings.userId, userId))
        .limit(1)
        .execute();

      if (stored && stored.profileHash === hash) {
        const embedding = parseVector(stored.embedding);
        if (embedding?.length) {
          this.profileEmbeddingCache.set(userId, { hash, embedding });
          return embedding;
        }
      }

      const result = await this.aiService.embed({
        feature: "embeddings.profile",
        input: text,
        taskType: "RETRIEVAL_QUERY",
        dimensions: EMBEDDING_DIMENSIONS,
        metadata: { userId },
      });

      const embedding = result?.embeddings?.[0];
      if (!embedding?.length) return null;

      await db
        .insert(userProfileEmbeddings)
        .values({
          userId,
          embedding,
          embeddingModel: result!.model,
          profileHash: hash,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userProfileEmbeddings.userId,
          set: {
            embedding,
            embeddingModel: result!.model,
            profileHash: hash,
            updatedAt: new Date(),
          },
        })
        .execute();

      this.profileEmbeddingCache.set(userId, { hash, embedding });
      return embedding;
    } catch (error) {
      this.logger.warn(
        `getProfileEmbedding(${userId}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Interest/preference/dislike memories the AI coach has learned, formatted
   * for the embedding text. Empty string on any failure — memories must never
   * break profile embeddings.
   */
  private async buildMemoryText(userId: string): Promise<string> {
    try {
      const result = await db.execute(sql`
        select kind, content from user_ai_memories
        where user_id = ${userId}
          and kind in ('interest', 'preference', 'dislike')
          and (expires_at is null or expires_at > now())
        order by last_used_at desc
        limit 15
      `);
      const rows =
        (
          result as unknown as {
            rows?: Array<{ kind: string; content: string }>;
          }
        ).rows ?? [];
      if (!rows.length) return "";
      const liked = rows
        .filter((row) => row.kind !== "dislike")
        .map((row) => row.content);
      const disliked = rows
        .filter((row) => row.kind === "dislike")
        .map((row) => row.content);
      return [
        liked.length ? `Learned interests: ${liked.join("; ")}` : "",
        disliked.length ? `Wants to avoid: ${disliked.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    } catch {
      return "";
    }
  }

  /**
   * Fire-and-forget refresh after profile/preferences writes. The lazy hash
   * check in getProfileEmbedding is the safety net for missed write paths —
   * this hook just warms the new vector so the next feed request is fast.
   */
  refreshProfileEmbedding(userId: string): void {
    this.profileEmbeddingCache.delete(userId);
    void (async () => {
      try {
        // Profiles are keyed by the raw auth subject; dual-key so this warms
        // from the canonical row whether the caller passed a raw or derived id.
        const profileResult = await db.execute(
          sql`select * from profiles where (user_id::text = ${userId} or public.clerk_id_to_uuid(user_id::text) = ${userId}) limit 1`,
        );
        const prefResult = await db.execute(
          sql`select * from user_opportunity_preferences where (user_id::text = ${userId} or public.clerk_id_to_uuid(user_id::text) = ${userId}) limit 1`,
        );
        const profileRow =
          ((profileResult as { rows?: Record<string, unknown>[] }).rows ??
            [])[0] ?? null;
        const prefRow =
          ((prefResult as { rows?: Record<string, unknown>[] }).rows ??
            [])[0] ?? null;
        await this.getProfileEmbedding(userId, profileRow, prefRow);
      } catch (error) {
        this.logger.debug(
          `refreshProfileEmbedding(${userId}) skipped: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    })();
  }

  /** Resumable batch backfill over active rows missing an embedding. */
  async backfillOpportunityEmbeddings(
    options: { limit?: number; reembed?: boolean } = {},
  ): Promise<BackfillResult> {
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 2000);
    const result: BackfillResult = {
      processed: 0,
      embedded: 0,
      skipped: 0,
      failed: 0,
    };

    const filters = options.reembed
      ? [eq(opportunities.status, "active")]
      : [eq(opportunities.status, "active"), isNull(opportunities.embedding)];

    const rows = await db
      .select()
      .from(opportunities)
      .where(and(...filters))
      .orderBy(desc(opportunities.updatedAt))
      .limit(limit)
      .execute();

    for (let i = 0; i < rows.length; i += BACKFILL_BATCH_SIZE) {
      const batch = rows.slice(i, i + BACKFILL_BATCH_SIZE);
      const texts = batch.map((row) =>
        this.buildOpportunityText(row as Record<string, unknown>),
      );

      const embeddable = batch.filter((_, idx) => texts[idx].length > 0);
      const embeddableTexts = texts.filter((text) => text.length > 0);
      result.processed += batch.length;
      result.skipped += batch.length - embeddable.length;

      if (!embeddableTexts.length) continue;

      const embedResult = await this.aiService.embed({
        feature: "embeddings.opportunity",
        input: embeddableTexts,
        taskType: "RETRIEVAL_DOCUMENT",
        dimensions: EMBEDDING_DIMENSIONS,
        metadata: { backfill: true, batchSize: embeddableTexts.length },
      });

      if (!embedResult) {
        // Embeddings unavailable (no key / provider down) — stop early rather
        // than spin through every batch failing.
        result.failed += rows.length - result.processed + batch.length;
        this.logger.warn(
          "Embedding backfill stopped: embeddings unavailable (see AiService warnings)",
        );
        break;
      }

      for (let j = 0; j < embeddable.length; j += 1) {
        const embedding = embedResult.embeddings[j];
        if (!embedding?.length) {
          result.failed += 1;
          continue;
        }
        try {
          await db.execute(sql`
            update ${opportunities}
            set embedding = ${toVectorLiteral(embedding)}::vector,
                embedding_model = ${embedResult.model},
                embedded_at = now()
            where id = ${embeddable[j].id}
          `);
          result.embedded += 1;
        } catch (error) {
          result.failed += 1;
          this.logger.warn(
            `Backfill write failed for ${embeddable[j].id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      if (i + BACKFILL_BATCH_SIZE < rows.length) {
        await sleep(BACKFILL_BATCH_PAUSE_MS);
      }
    }

    this.logger.log(
      `Embedding backfill: processed=${result.processed} embedded=${result.embedded} skipped=${result.skipped} failed=${result.failed}`,
    );
    return result;
  }

  /**
   * Safety net for rows that slipped past the ingestion hooks. No-ops (fast)
   * when everything is embedded or embeddings are unavailable.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleEmbeddingCatchUp(): Promise<void> {
    try {
      await this.backfillOpportunityEmbeddings({ limit: 100 });
    } catch (error) {
      this.logger.warn(
        `Hourly embedding catch-up failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
