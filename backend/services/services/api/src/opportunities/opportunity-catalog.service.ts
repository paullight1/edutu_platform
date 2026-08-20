import { BadRequestException, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db } from "../db";
import type { OpportunityCatalogQueryDto } from "./dto/catalog-query.dto";
import { publicOpportunitySql } from "./opportunity-visibility";
import { withOpportunityUrlAliases } from "./opportunity-static-snapshot";

type CatalogSort = "newest" | "deadline";

type CatalogCursor = {
  v: 1;
  sort: CatalogSort;
  value: string | null;
  id: string;
};

export type OpportunityCatalogPage = {
  items: Record<string, unknown>[];
  nextCursor: string | null;
  hasMore: boolean;
};

export function encodeCatalogCursor(cursor: CatalogCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCatalogCursor(
  value: string | undefined,
  expectedSort: CatalogSort,
): CatalogCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<CatalogCursor>;
    const validCursorValue =
      expectedSort === "deadline"
        ? parsed.value === null || typeof parsed.value === "string"
        : typeof parsed.value === "string" && parsed.value.length > 0;
    if (
      parsed.v !== 1 ||
      parsed.sort !== expectedSort ||
      !validCursorValue ||
      typeof parsed.id !== "string" ||
      parsed.id.length === 0
    ) {
      throw new Error("shape");
    }
    return parsed as CatalogCursor;
  } catch {
    throw new BadRequestException("Invalid opportunity catalogue cursor");
  }
}

function escapeLike(term: string): string {
  return term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

@Injectable()
export class OpportunityCatalogService {
  async list(query: OpportunityCatalogQueryDto): Promise<OpportunityCatalogPage> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 60);
    const sort = query.sort ?? "newest";
    const cursor = decodeCatalogCursor(query.cursor, sort);
    const today = new Date().toISOString().slice(0, 10);
    const searchPattern = query.q ? `%${escapeLike(query.q)}%` : null;
    const locationPattern = query.location
      ? `%${escapeLike(query.location)}%`
      : null;
    const deadlineAfter = query.deadlineAfter
      ? query.deadlineAfter.toISOString().slice(0, 10)
      : null;
    const deadlineBefore = query.deadlineBefore
      ? query.deadlineBefore.toISOString().slice(0, 10)
      : null;

    const cursorPredicate = cursor
      ? sort === "deadline"
        ? cursor.value === null
          ? sql`and o.close_date is null and o.id > ${cursor.id}::uuid`
          : sql`and (
              o.close_date > ${cursor.value}::date
              or o.close_date is null
              or (o.close_date = ${cursor.value}::date and o.id > ${cursor.id}::uuid)
            )`
        : sql`and (
            o.created_at < ${cursor.value}::timestamptz
            or (o.created_at = ${cursor.value}::timestamptz and o.id < ${cursor.id}::uuid)
          )`
      : sql``;

    const order =
      sort === "deadline"
        ? sql`o.close_date asc nulls last, o.id asc`
        : sql`o.created_at desc, o.id desc`;

    const result = await db.execute(sql`
      select o.*
      from opportunities o
      where ${publicOpportunitySql("o")}
        and (o.close_date is null or o.close_date >= ${today}::date)
        ${query.category ? sql`and o.category = ${query.category}` : sql``}
        ${query.funding ? sql`and o.funding_type = ${query.funding}` : sql``}
        ${locationPattern ? sql`and o.location ilike ${locationPattern} escape '\\'` : sql``}
        ${deadlineAfter ? sql`and o.close_date >= ${deadlineAfter}::date` : sql``}
        ${deadlineBefore ? sql`and o.close_date <= ${deadlineBefore}::date` : sql``}
        ${
          searchPattern
            ? sql`and (
                o.title ilike ${searchPattern} escape '\\'
                or o.organization ilike ${searchPattern} escape '\\'
                or o.summary ilike ${searchPattern} escape '\\'
                or o.category ilike ${searchPattern} escape '\\'
              )`
            : sql``
        }
        ${cursorPredicate}
      order by ${order}
      limit ${limit + 1}
    `);

    const rows = (
      Array.isArray(result)
        ? result
        : ((result as { rows?: Record<string, unknown>[] }).rows ?? [])
    ) as Record<string, any>[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows.at(-1);

    let nextCursor: string | null = null;
    if (hasMore && last) {
      const cursorValue =
        sort === "deadline"
          ? last.close_date === null || last.close_date === undefined
            ? null
            : String(last.close_date)
          : new Date(last.created_at).toISOString();
      nextCursor = encodeCatalogCursor({
        v: 1,
        sort,
        value: cursorValue,
        id: String(last.id),
      });
    }

    return {
      items: pageRows.map((row) =>
        withOpportunityUrlAliases(row as Record<string, any>),
      ),
      nextCursor,
      hasMore,
    };
  }
}
