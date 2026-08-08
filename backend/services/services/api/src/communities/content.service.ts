import { BadRequestException, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { toDatabaseUserId } from "../common/user-id";

export type CommunityProfileResource = {
  id: string;
  title: string;
  type: string | null;
  provider: string | null;
  url: string | null;
};

export type CommunityProfileContentItem = {
  id: string;
  title: string;
  category: string;
  resources: CommunityProfileResource[];
  likes: number;
  createdAt: string;
};

type RawContentRow = {
  source: "post" | "story";
  row_data: unknown;
  created_at: string | Date;
  id: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeResourceUrl(value: unknown): string | null {
  const text = asText(value);
  if (!text || text.length > 2048) return null;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function normalizeResources(value: unknown): CommunityProfileResource[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((entry, index) => {
    const row = asRecord(entry);
    const title = asText(row.title) ?? asText(row.name);
    if (!title) return [];
    return [
      {
        id: asText(row.id) ?? `resource-${index}`,
        title,
        type: asText(row.type),
        provider: asText(row.provider),
        url: safeResourceUrl(row.url),
      },
    ];
  });
}

/** Exported for contract tests; the query owns identity, this owns shape. */
export function mapCommunityProfileContentRow(
  result: RawContentRow,
): CommunityProfileContentItem {
  const row = asRecord(result.row_data);
  const metadata = asRecord(row.metadata);
  const resources = normalizeResources(row.resources ?? metadata.resources);
  const createdAt =
    result.created_at instanceof Date
      ? result.created_at.toISOString()
      : new Date(result.created_at).toISOString();
  return {
    id: String(result.id),
    title: asText(row.title) ?? "Untitled post",
    category:
      asText(row.category) ?? asText(metadata.category) ?? "Community",
    resources,
    likes:
      typeof row.likes === "number"
        ? row.likes
        : typeof row.likes_count === "number"
          ? row.likes_count
          : 0,
    createdAt,
  };
}

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows?: T[] }).rows ?? [];
  }
  return [];
}

@Injectable()
export class CommunityContentService {
  async listMine(
    authId: string,
    options: { before?: Date; beforeId?: string; limit?: number },
  ) {
    const databaseId = toDatabaseUserId(authId);
    const limit = Math.min(Math.max(options.limit ?? 30, 1), 50);
    if ((options.before && !options.beforeId) || (!options.before && options.beforeId)) {
      throw new BadRequestException("That page of community content isn't valid.");
    }
    const before = options.before?.toISOString() ?? null;
    const beforeId = options.beforeId ?? null;
    const result = await db.execute(sql`
      with owned_content as (
        select 'post'::text as source,
               to_jsonb(p) as row_data,
               p.created_at as created_at,
               p.id as id
          from community_posts p
         where p.user_id::text = ${authId}
            or p.user_id::text = ${databaseId}
        union all
        select 'story'::text as source,
               to_jsonb(s) as row_data,
               s.created_at as created_at,
               s.id as id
          from community_stories s
         where coalesce(
                 to_jsonb(s)->>'user_id',
                 to_jsonb(s)->>'creator_id',
                 to_jsonb(s)->'creator'->>'user_id'
               ) in (${authId}, ${databaseId})
      )
      select source, row_data, created_at, id
        from owned_content
       where ${before}::timestamptz is null
          or (created_at, id) < (${before}::timestamptz, ${beforeId}::uuid)
       order by created_at desc, id desc
       limit ${limit + 1}
    `);
    const rows = extractRows<RawContentRow>(result);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(mapCommunityProfileContentRow),
      nextCursor:
        hasMore && last
          ? {
              before:
                last.created_at instanceof Date
                  ? last.created_at.toISOString()
                  : new Date(last.created_at).toISOString(),
              beforeId: String(last.id),
            }
          : null,
    };
  }
}
