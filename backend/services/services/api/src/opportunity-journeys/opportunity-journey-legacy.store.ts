import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { toDatabaseUserId } from "../common/user-id";

export interface LegacyOpportunityBookmark {
  id: string;
  opportunityId: string;
  savedAt: Date | string | null;
  priority?: string | null;
  notes?: string | null;
}

export interface LegacyOpportunityApplication {
  id: string;
  opportunityId: string;
  status: string;
  submittedAt: Date | string | null;
  updatedAt: Date | string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface LegacyApplicationWrite {
  opportunityId: string;
  status: string;
  submittedAt?: Date | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface OpportunityJourneyLegacyStore {
  listBookmarks(userId: string): Promise<LegacyOpportunityBookmark[]>;
  listApplications(userId: string): Promise<LegacyOpportunityApplication[]>;
  ensureBookmark(
    userId: string,
    input: { opportunityId: string; priority?: string | null; notes?: string | null },
  ): Promise<void>;
  ensureApplication(
    userId: string,
    input: LegacyApplicationWrite,
  ): Promise<void>;
  listUserIds(input?: {
    limit?: number;
    afterUserId?: string | null;
  }): Promise<string[]>;
}

function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as { rows?: unknown[] }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

export class DatabaseOpportunityJourneyLegacyStore
  implements OpportunityJourneyLegacyStore
{
  constructor(private readonly database: any = db) {}

  async listBookmarks(userId: string): Promise<LegacyOpportunityBookmark[]> {
    const result = await this.database.execute(sql`
      select
        opportunity_id::text as "opportunityId",
        opportunity_id::text as id,
        saved_at as "savedAt",
        priority,
        notes
      from public.opportunity_bookmarks
      where user_id = ${toDatabaseUserId(userId)}
      order by saved_at asc nulls last, opportunity_id asc
    `);
    return rows<LegacyOpportunityBookmark>(result);
  }

  async listApplications(
    userId: string,
  ): Promise<LegacyOpportunityApplication[]> {
    const result = await this.database.execute(sql`
      select
        id::text as id,
        opportunity_id::text as "opportunityId",
        status,
        submitted_at as "submittedAt",
        updated_at as "updatedAt",
        notes,
        metadata
      from public.opportunity_applications
      where user_id = ${toDatabaseUserId(userId)}
      order by updated_at asc nulls last, id asc
    `);
    return rows<LegacyOpportunityApplication>(result);
  }

  async ensureBookmark(
    userId: string,
    input: { opportunityId: string; priority?: string | null; notes?: string | null },
  ): Promise<void> {
    await this.database.execute(sql`
      insert into public.opportunity_bookmarks (
        user_id,
        opportunity_id,
        saved_at,
        priority,
        notes
      ) values (
        ${toDatabaseUserId(userId)},
        ${input.opportunityId}::uuid,
        now(),
        ${input.priority ?? "medium"},
        ${input.notes ?? null}
      )
      on conflict (user_id, opportunity_id) do update
      set priority = excluded.priority,
          notes = coalesce(public.opportunity_bookmarks.notes, excluded.notes)
    `);
  }

  async ensureApplication(
    userId: string,
    input: LegacyApplicationWrite,
  ): Promise<void> {
    const databaseUserId = toDatabaseUserId(userId);
    const existing = rows<{ id: string }>(
      await this.database.execute(sql`
        select id::text as id
        from public.opportunity_applications
        where user_id = ${databaseUserId}
          and opportunity_id = ${input.opportunityId}::uuid
        order by updated_at desc nulls last
        limit 1
      `),
    )[0];

    if (existing) {
      await this.database.execute(sql`
        update public.opportunity_applications
        set status = ${input.status},
            submitted_at = coalesce(
              submitted_at,
              ${input.submittedAt ?? null}
            ),
            notes = coalesce(notes, ${input.notes ?? null}),
            metadata = coalesce(metadata, '{}'::jsonb) ||
              ${JSON.stringify(input.metadata ?? {})}::jsonb,
            updated_at = now()
        where id = ${existing.id}::uuid
          and user_id = ${databaseUserId}
      `);
      return;
    }

    await this.database.execute(sql`
      insert into public.opportunity_applications (
        id,
        user_id,
        opportunity_id,
        status,
        submitted_at,
        notes,
        metadata,
        updated_at
      ) values (
        ${randomUUID()}::uuid,
        ${databaseUserId},
        ${input.opportunityId}::uuid,
        ${input.status},
        ${input.submittedAt ?? null},
        ${input.notes ?? null},
        ${JSON.stringify(input.metadata ?? {})}::jsonb,
        now()
      )
    `);
  }

  async listUserIds(input: {
    limit?: number;
    afterUserId?: string | null;
  } = {}): Promise<string[]> {
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 500), 1), 5_000);
    const afterUserId = input.afterUserId ?? "";
    const result = await this.database.execute(sql`
      select user_id::text as "userId"
      from (
        select user_id from public.opportunity_bookmarks
        union
        select user_id from public.opportunity_applications
      ) legacy_users
      where user_id::text > ${afterUserId}
      order by user_id::text asc
      limit ${limit}
    `);
    return rows<{ userId: string }>(result).map((row) => row.userId);
  }
}
