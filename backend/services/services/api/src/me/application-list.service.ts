import { BadRequestException, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { isUuid, toDatabaseUserId, matchUserIdRef } from "../common/user-id";
import type { ApplicationListQuery } from "./dto/application-list.dto";

type Row = Record<string, unknown>;
function rows(result: unknown): Row[] {
  return Array.isArray(result) ? result : (result as { rows: Row[] }).rows;
}

@Injectable()
export class ApplicationListService {
  async opportunityIds(userId: string): Promise<string[]> {
    const result =
      await db.execute(sql`select coalesce(array_agg(opportunity_id), '{}'::uuid[]) as ids
      from public.opportunity_applications a where ${matchUserIdRef("a.user_id::text", toDatabaseUserId(userId))}`);
    return (rows(result)[0]?.ids ?? []) as string[];
  }

  async page(userId: string, query: ApplicationListQuery) {
    const owner = toDatabaseUserId(userId);
    let cursor: { createdAt: string; id: string } | null = null;
    if (query.cursor) {
      try {
        cursor = JSON.parse(Buffer.from(query.cursor, "base64url").toString());
        if (
          !cursor ||
          !isUuid(cursor.id) ||
          !/^\d{4}-\d\d-\d\d[ T]/.test(cursor.createdAt) ||
          !Number.isFinite(Date.parse(cursor.createdAt))
        )
          throw new Error();
      } catch {
        throw new BadRequestException("Invalid application cursor");
      }
    }
    const title = sql`coalesce(o.title, a.metadata->>'opportunity_title', 'Opportunity')`;
    const category = sql`coalesce(o.category, a.metadata->>'opportunity_category', 'General')`;
    const search = "%" + query.q.replace(/[\\%_]/g, "\\$&") + "%";
    const match = sql`${matchUserIdRef("a.user_id::text", owner)}
      and (${query.status ?? null}::text is null or a.status = ${query.status ?? null})
      and (${query.q} = '' or ${title} ilike ${search} or ${category} ilike ${search} or coalesce(a.notes, '') ilike ${search})
      and (${query.confirmationDue === "true"} = false or (a.status = 'draft' and a.created_at <= now() - interval '24 hours'))`;
    const [itemsResult, totalsResult] = await Promise.all([
      db.execute(sql`select a.*, a.created_at::text as cursor_created_at, ${title} as opportunity_title, ${category} as opportunity_category
        from public.opportunity_applications a left join public.opportunities o on o.id = a.opportunity_id
        where ${match}
          and (${cursor?.createdAt ?? null}::timestamptz is null or (a.created_at, a.id) < (${cursor?.createdAt ?? null}::timestamptz, ${cursor?.id ?? null}::uuid))
        order by a.created_at desc, a.id desc limit ${query.limit + 1}`),
      db.execute(sql`select
        (select count(*)::integer from public.opportunity_applications a left join public.opportunities o on o.id = a.opportunity_id where ${match}) as filtered_total,
        coalesce((select jsonb_object_agg(status, n) from (select status, count(*)::integer n from public.opportunity_applications a where ${matchUserIdRef("a.user_id::text", owner)} group by status) counts), '{}'::jsonb) as counts`),
    ]);
    const fetched = rows(itemsResult);
    const items = fetched
      .slice(0, query.limit)
      .map(({ cursor_created_at: _cursor, ...row }) => ({
        ...row,
        created_at:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : row.created_at,
        updated_at:
          row.updated_at instanceof Date
            ? row.updated_at.toISOString()
            : row.updated_at,
        submitted_at:
          row.submitted_at instanceof Date
            ? row.submitted_at.toISOString()
            : row.submitted_at,
      }));
    const last = fetched[Math.min(query.limit, fetched.length) - 1];
    const counts = (rows(totalsResult)[0]?.counts ?? {}) as Record<
      string,
      number
    >;
    return {
      items,
      nextCursor:
        fetched.length > query.limit && last
          ? Buffer.from(
              JSON.stringify({
                createdAt: last.cursor_created_at,
                id: last.id,
              }),
            ).toString("base64url")
          : null,
      filteredTotal: Number(rows(totalsResult)[0]?.filtered_total ?? 0),
      total: Object.values(counts).reduce(
        (sum, value) => sum + Number(value),
        0,
      ),
      counts,
    };
  }
}
