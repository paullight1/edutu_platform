import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { BillingEventsRepository } from "./billing-events.repository";
import { PostgresBillingEventsPersistence } from "./billing-events.persistence";

async function createHarness() {
  const client = new PGlite();
  await client.exec(`
    create table public.billing_provider_events (
      id uuid primary key default gen_random_uuid(),
      provider text not null,
      environment text not null,
      event_id text not null,
      event_type text not null,
      provider_reference text,
      organization_id text,
      provider_account_id text,
      received_at timestamptz not null,
      processed_at timestamptz,
      status text not null default 'received',
      attempt_count integer not null default 0,
      last_error text,
      payload_hash text not null,
      raw_payload jsonb,
      raw_payload_expires_at timestamptz not null default (now() + interval '90 days'),
      next_retry_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (provider, environment, event_id)
    );
  `);
  return {
    client,
    persistence: new PostgresBillingEventsPersistence(drizzle(client)),
  };
}

function event(eventId: string, raw = `{"id":"${eventId}"}`) {
  return {
    provider: "revenuecat" as const,
    environment: "sandbox" as const,
    eventId,
    eventType: "INITIAL_PURCHASE",
    providerReference: `transaction-${eventId}`,
    payload: { id: eventId },
    rawPayload: Buffer.from(raw),
  };
}

describe("PostgresBillingEventsPersistence", () => {
  it("distinguishes insertion, exact duplicate, and hash conflict", async () => {
    const { client, persistence } = await createHarness();
    try {
      const repository = new BillingEventsRepository(persistence, {
        clock: () => new Date("2026-08-30T10:00:00.000Z"),
      });

      const inserted = await repository.accept(event("evt-one"));
      const duplicate = await repository.accept(event("evt-one"));
      const conflict = await repository.accept(
        event("evt-one", '{"id":"evt-one","changed":true}'),
      );

      expect(inserted.kind).toBe("inserted");
      expect(inserted.event.providerReference).toBe("transaction-evt-one");
      expect(duplicate.kind).toBe("duplicate");
      expect(conflict.kind).toBe("conflict");
      const rows = await client.query<{
        count: number;
        status: string;
        last_error: string | null;
      }>(
        `select count(*)::integer as count, min(status) as status,
                min(last_error) as last_error
         from public.billing_provider_events`,
      );
      expect(rows.rows[0]?.count).toBe(1);
      expect(rows.rows[0]).toMatchObject({
        status: "review",
        last_error: "provider_event_payload_conflict",
      });
    } finally {
      await client.close();
    }
  });

  it("leases only eligible events once with skip-locked semantics", async () => {
    const { client, persistence } = await createHarness();
    try {
      const repository = new BillingEventsRepository(persistence, {
        clock: () => new Date("2026-08-30T10:00:00.000Z"),
      });
      await repository.accept(event("evt-first"));
      await repository.accept(event("evt-second"));
      await repository.accept(event("evt-third"));

      const firstLease = await persistence.leaseBatch({
        now: new Date("2026-08-30T10:00:00.000Z"),
        limit: 2,
      });
      const secondLease = await persistence.leaseBatch({
        now: new Date("2026-08-30T10:00:00.000Z"),
        limit: 2,
      });

      expect(firstLease).toHaveLength(2);
      expect(firstLease.map(({ attemptCount }) => attemptCount)).toEqual([
        1, 1,
      ]);
      expect(secondLease).toHaveLength(1);
      expect(
        new Set([...firstLease, ...secondLease].map(({ id }) => id)).size,
      ).toBe(3);
    } finally {
      await client.close();
    }
  });

  it("completes, retries, reviews, and dead-letters only leased events", async () => {
    const { client, persistence } = await createHarness();
    try {
      const now = new Date("2026-08-30T10:00:00.000Z");
      const repository = new BillingEventsRepository(persistence, {
        clock: () => now,
        deadLetterAfter: 2,
      });
      await repository.accept(event("evt-complete"));
      await repository.accept(event("evt-retry"));
      await repository.accept(event("evt-review"));

      expect(await persistence.complete("missing", new Date())).toBe(false);
      const leased = await repository.lease(3);
      expect(await repository.complete(leased[0].id)).toBe(true);
      expect((await repository.retry(leased[1].id, "temporary"))?.status).toBe(
        "failed",
      );
      expect(await repository.review(leased[2].id, "unknown_product")).toBe(
        true,
      );

      now.setTime(now.getTime() + 2_000);
      const retryLease = await repository.lease(1);
      expect(retryLease[0]?.attemptCount).toBe(2);
      expect(
        (await repository.retry(retryLease[0].id, "permanent"))?.status,
      ).toBe("dead_letter");
    } finally {
      await client.close();
    }
  });
});
