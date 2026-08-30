import { Inject, Injectable } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import type {
  BillingEventRecord,
  BillingEventsPersistence,
} from "./billing-events.repository";

type QueryResult = { rows?: unknown[] };
type BillingEventsTransaction = {
  execute(statement: SQL): Promise<QueryResult>;
};
export type BillingEventsDatabase = BillingEventsTransaction & {
  transaction<T>(
    callback: (transaction: BillingEventsTransaction) => Promise<T>,
  ): Promise<T>;
};

export const BILLING_EVENTS_DATABASE = Symbol("BILLING_EVENTS_DATABASE");

type EventRow = {
  id: unknown;
  provider: unknown;
  environment: unknown;
  event_id: unknown;
  event_type: unknown;
  provider_reference: unknown;
  organization_id: unknown;
  provider_account_id: unknown;
  payload_hash: unknown;
  raw_payload: unknown;
  status: unknown;
  attempt_count: unknown;
  next_retry_at: unknown;
  last_error: unknown;
  received_at: unknown;
  processed_at: unknown;
  updated_at: unknown;
};

const EVENT_COLUMNS = sql.raw(`
  id, provider, environment, event_id, event_type, provider_reference,
  organization_id, provider_account_id, payload_hash, raw_payload, status,
  attempt_count, next_retry_at, last_error, received_at, processed_at,
  updated_at
`);
const EVENT_COLUMNS_QUALIFIED = sql.raw(`
  event.id, event.provider, event.environment, event.event_id,
  event.event_type, event.provider_reference, event.organization_id,
  event.provider_account_id, event.payload_hash, event.raw_payload,
  event.status, event.attempt_count, event.next_retry_at, event.last_error,
  event.received_at, event.processed_at, event.updated_at
`);

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function rows(result: QueryResult): EventRow[] {
  return (result.rows ?? []).filter((row): row is EventRow =>
    Boolean(row && typeof row === "object"),
  );
}

function date(value: unknown): Date {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("billing event contains an invalid date");
  }
  return parsed;
}

function optionalDate(value: unknown): Date | null {
  return value == null ? null : date(value);
}

function mapEvent(row: EventRow): BillingEventRecord {
  return {
    id: String(row.id),
    provider: String(row.provider) as BillingEventRecord["provider"],
    environment: String(row.environment) as BillingEventRecord["environment"],
    eventId: String(row.event_id),
    eventType: String(row.event_type),
    providerReference:
      row.provider_reference == null ? null : String(row.provider_reference),
    organizationId:
      row.organization_id == null ? null : String(row.organization_id),
    providerAccountId:
      row.provider_account_id == null ? null : String(row.provider_account_id),
    payloadHash: String(row.payload_hash),
    payload: row.raw_payload,
    status: String(row.status) as BillingEventRecord["status"],
    attemptCount: Number(row.attempt_count),
    nextRetryAt: optionalDate(row.next_retry_at),
    lastError: row.last_error == null ? null : String(row.last_error),
    receivedAt: date(row.received_at),
    processedAt: optionalDate(row.processed_at),
    updatedAt: date(row.updated_at),
  };
}

@Injectable()
export class PostgresBillingEventsPersistence implements BillingEventsPersistence {
  constructor(
    @Inject(BILLING_EVENTS_DATABASE)
    private readonly database: BillingEventsDatabase = db as unknown as BillingEventsDatabase,
  ) {}

  insert(
    input: Parameters<BillingEventsPersistence["insert"]>[0],
  ): ReturnType<BillingEventsPersistence["insert"]> {
    return this.database.transaction(async (transaction) => {
      const inserted = await transaction.execute(sql`
        insert into public.billing_provider_events (
          provider, environment, event_id, event_type, provider_reference,
          organization_id, provider_account_id, received_at, status,
          payload_hash, raw_payload, updated_at
        ) values (
          ${input.provider}, ${input.environment}, ${input.eventId},
          ${input.eventType}, ${input.providerReference ?? null},
          ${input.organizationId ?? null}, ${input.providerAccountId ?? null},
          ${input.receivedAt}, 'received', ${input.payloadHash},
          ${JSON.stringify(input.payload)}::jsonb, ${input.receivedAt}
        )
        on conflict (provider, environment, event_id) do nothing
        returning ${EVENT_COLUMNS}
      `);
      const created = rows(inserted)[0];
      if (created)
        return { kind: "inserted" as const, event: mapEvent(created) };

      const existing = await transaction.execute(sql`
        select ${EVENT_COLUMNS}
        from public.billing_provider_events
        where provider = ${input.provider}
          and environment = ${input.environment}
          and event_id = ${input.eventId}
        for update
      `);
      const found = rows(existing)[0];
      if (!found) throw new Error("billing event insert was inconclusive");
      const event = mapEvent(found);
      if (event.payloadHash === input.payloadHash) {
        return { kind: "duplicate" as const, event };
      }
      const conflicted = await transaction.execute(sql`
        update public.billing_provider_events
        set status = 'review', next_retry_at = null,
            last_error = 'provider_event_payload_conflict', updated_at = now()
        where id = ${event.id}::uuid
        returning ${EVENT_COLUMNS}
      `);
      return {
        kind: "conflict" as const,
        event: mapEvent(rows(conflicted)[0] ?? found),
      };
    });
  }

  async leaseBatch(
    input: Parameters<BillingEventsPersistence["leaseBatch"]>[0],
  ): Promise<BillingEventRecord[]> {
    return this.database.transaction(async (transaction) => {
      const result = await transaction.execute(sql`
        with candidates as (
          select id
          from public.billing_provider_events
          where status in ('received', 'failed')
            and processed_at is null
            and (next_retry_at is null or next_retry_at <= ${input.now})
          order by received_at, id
          for update skip locked
          limit ${input.limit}
        )
        update public.billing_provider_events as event
        set status = 'processing',
            attempt_count = event.attempt_count + 1,
            updated_at = ${input.now}
        from candidates
        where event.id = candidates.id
        returning ${EVENT_COLUMNS_QUALIFIED}
      `);
      return rows(result).map(mapEvent);
    });
  }

  async complete(id: string, now: Date): Promise<boolean> {
    if (!isUuid(id)) return false;
    const result = await this.database.execute(sql`
      update public.billing_provider_events
      set status = 'processed', processed_at = ${now}, next_retry_at = null,
          last_error = null, updated_at = ${now}
      where id = ${id}::uuid and status = 'processing'
      returning id
    `);
    return rows(result).length === 1;
  }

  async retry(
    input: Parameters<BillingEventsPersistence["retry"]>[0],
  ): Promise<BillingEventRecord | null> {
    if (!isUuid(input.id)) return null;
    const deadLetter = input.attemptCount >= input.deadLetterAfter;
    const result = await this.database.execute(sql`
      update public.billing_provider_events
      set status = ${deadLetter ? "dead_letter" : "failed"},
          next_retry_at = ${deadLetter ? null : input.nextRetryAt},
          last_error = ${input.error},
          updated_at = now()
      where id = ${input.id}::uuid and status = 'processing'
      returning ${EVENT_COLUMNS}
    `);
    const row = rows(result)[0];
    return row ? mapEvent(row) : null;
  }

  async review(
    input: Parameters<BillingEventsPersistence["review"]>[0],
  ): Promise<boolean> {
    if (!isUuid(input.id)) return false;
    const result = await this.database.execute(sql`
      update public.billing_provider_events
      set status = 'review', next_retry_at = null,
          last_error = ${input.reason}, updated_at = now()
      where id = ${input.id}::uuid and status = 'processing'
      returning id
    `);
    return rows(result).length === 1;
  }
}
