import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../db/all-schema";
import { toDatabaseUserId } from "../common/user-id";
import {
  applyOpportunityJourneyMigration,
  createOpportunityJourneyTestDatabase,
} from "../../test/task-opportunity-pipeline/opportunity-journey-schema-pglite-runner";
import {
  OpportunityJourneyRepositoryError,
  OpportunityJourneysRepository,
} from "./opportunity-journeys.repository";

const RAW_USER = "user_repository_owner";
const USER_ID = toDatabaseUserId(RAW_USER);
const OTHER_USER = toDatabaseUserId("user_repository_other");
const OPPORTUNITY_ONE = "11111111-1111-4111-8111-111111111111";
const OPPORTUNITY_TWO = "22222222-2222-4222-8222-222222222222";
const OPPORTUNITY_THREE = "33333333-3333-4333-8333-333333333333";

async function createRepository() {
  const client = await createOpportunityJourneyTestDatabase();
  await client.exec(
    "alter table public.opportunities add column if not exists deadline timestamptz;",
  );
  await applyOpportunityJourneyMigration(client);
  const immutabilityMigration = await readFile(
    resolve(
      process.cwd(),
      "supabase/migrations/20260903090000_opportunity_journey_event_immutability.sql",
    ),
    "utf8",
  );
  await client.exec(immutabilityMigration);
  await client.exec(`
    insert into public.opportunities (id, title, deadline) values
      ('${OPPORTUNITY_ONE}', 'First', '2026-10-10T00:00:00Z'),
      ('${OPPORTUNITY_TWO}', 'Second', '2026-10-05T00:00:00Z'),
      ('${OPPORTUNITY_THREE}', 'Third', '2026-10-01T00:00:00Z');
  `);

  return {
    client,
    repository: new OpportunityJourneysRepository(drizzle(client, { schema })),
  };
}

describe("OpportunityJourneysRepository", () => {
  it("creates once and returns the original journey for an identical retry", async () => {
    const { client, repository } = await createRepository();
    try {
      const input = {
        userId: RAW_USER,
        opportunityId: OPPORTUNITY_ONE,
        state: "shortlisted" as const,
        priority: "none" as const,
        idempotencyKey: "create-first",
        eventType: "journey_shortlisted",
        source: "backend" as const,
        metadata: { surface: "test" },
      };

      const first = await repository.createOrReadJourney(input);
      const retried = await repository.createOrReadJourney(input);

      expect(retried).toEqual(first);
      expect(first.userId).toBe(USER_ID);
      expect(await repository.listEventsForUser(RAW_USER)).toHaveLength(1);
    } finally {
      await client.close();
    }
  });

  it("rejects reuse of an idempotency key with a different payload", async () => {
    const { client, repository } = await createRepository();
    try {
      await repository.createOrReadJourney({
        userId: RAW_USER,
        opportunityId: OPPORTUNITY_ONE,
        state: "shortlisted",
        priority: "none",
        idempotencyKey: "same-key",
        eventType: "journey_shortlisted",
        source: "web",
        metadata: { action: "save" },
      });

      await expect(
        repository.createOrReadJourney({
          userId: RAW_USER,
          opportunityId: OPPORTUNITY_TWO,
          state: "pursuing",
          priority: "primary",
          idempotencyKey: "same-key",
          eventType: "journey_activated",
          source: "web",
          metadata: { action: "pursue" },
        }),
      ).rejects.toMatchObject<Partial<OpportunityJourneyRepositoryError>>({
        code: "IDEMPOTENCY_CONFLICT",
      });
    } finally {
      await client.close();
    }
  });

  it("returns an existing user/opportunity journey without duplicating it", async () => {
    const { client, repository } = await createRepository();
    try {
      const first = await repository.createOrReadJourney({
        userId: RAW_USER,
        opportunityId: OPPORTUNITY_ONE,
        state: "shortlisted",
        priority: "none",
        idempotencyKey: "create-a",
        eventType: "journey_shortlisted",
        source: "mobile",
      });
      const second = await repository.createOrReadJourney({
        userId: RAW_USER,
        opportunityId: OPPORTUNITY_ONE,
        state: "pursuing",
        priority: "primary",
        idempotencyKey: "create-b",
        eventType: "journey_activated",
        source: "mobile",
      });

      expect(second.id).toBe(first.id);
      expect(second.state).toBe("shortlisted");
      expect(await repository.listEventsForUser(RAW_USER)).toHaveLength(2);
    } finally {
      await client.close();
    }
  });

  it("updates with optimistic versioning and exposes the current row on conflict", async () => {
    const { client, repository } = await createRepository();
    try {
      const journey = await repository.createOrReadJourney({
        userId: RAW_USER,
        opportunityId: OPPORTUNITY_ONE,
        state: "shortlisted",
        priority: "none",
        idempotencyKey: "create-versioned",
        eventType: "journey_shortlisted",
        source: "backend",
      });

      const updated = await repository.updateJourneyVersioned({
        userId: RAW_USER,
        journeyId: journey.id,
        expectedVersion: 1,
        patch: { state: "pursuing", priority: "primary" },
        idempotencyKey: "activate-versioned",
        eventType: "journey_activated",
        source: "backend",
      });

      expect(updated.version).toBe(2);
      expect(updated.state).toBe("pursuing");

      await expect(
        repository.updateJourneyVersioned({
          userId: RAW_USER,
          journeyId: journey.id,
          expectedVersion: 1,
          patch: { state: "preparing" },
          idempotencyKey: "stale-version",
          eventType: "journey_preparing",
          source: "backend",
        }),
      ).rejects.toMatchObject({
        code: "JOURNEY_VERSION_CONFLICT",
        currentJourney: expect.objectContaining({ version: 2 }),
      });
    } finally {
      await client.close();
    }
  });

  it("scopes reads to the converted user id", async () => {
    const { client, repository } = await createRepository();
    try {
      const journey = await repository.createOrReadJourney({
        userId: RAW_USER,
        opportunityId: OPPORTUNITY_ONE,
        state: "shortlisted",
        priority: "none",
        idempotencyKey: "scoped-create",
        eventType: "journey_shortlisted",
        source: "backend",
      });

      expect(await repository.findJourneyForUser(RAW_USER, journey.id)).toEqual(
        journey,
      );
      expect(
        await repository.findJourneyForUser(OTHER_USER, journey.id),
      ).toBeNull();
    } finally {
      await client.close();
    }
  });

  it("orders stage rows by next action, then opportunity deadline", async () => {
    const { client, repository } = await createRepository();
    try {
      const first = await repository.createOrReadJourney({
        userId: RAW_USER,
        opportunityId: OPPORTUNITY_ONE,
        state: "pursuing",
        priority: "primary",
        nextActionAt: new Date("2026-09-20T00:00:00Z"),
        idempotencyKey: "order-1",
        eventType: "journey_activated",
        source: "backend",
      });
      const second = await repository.createOrReadJourney({
        userId: RAW_USER,
        opportunityId: OPPORTUNITY_TWO,
        state: "preparing",
        priority: "secondary",
        nextActionAt: new Date("2026-09-10T00:00:00Z"),
        idempotencyKey: "order-2",
        eventType: "journey_activated",
        source: "backend",
      });
      const third = await repository.createOrReadJourney({
        userId: RAW_USER,
        opportunityId: OPPORTUNITY_THREE,
        state: "ready_to_apply",
        priority: "secondary",
        idempotencyKey: "order-3",
        eventType: "journey_activated",
        source: "backend",
      });

      const rows = await repository.listJourneysByStage(RAW_USER, "pursuing");
      expect(rows.map((row) => row.id)).toEqual([
        second.id,
        first.id,
        third.id,
      ]);
      expect(await repository.countActivePursuits(RAW_USER)).toBe(3);
    } finally {
      await client.close();
    }
  });

  it("keeps the event ledger immutable at the database boundary", async () => {
    const { client, repository } = await createRepository();
    try {
      await repository.createOrReadJourney({
        userId: RAW_USER,
        opportunityId: OPPORTUNITY_ONE,
        state: "shortlisted",
        priority: "none",
        idempotencyKey: "immutable-event",
        eventType: "journey_shortlisted",
        source: "backend",
      });

      await expect(
        client.exec(
          `update public.opportunity_journey_events set event_type = 'changed' where idempotency_key = 'immutable-event';`,
        ),
      ).rejects.toThrow(/immutable/i);
      await expect(
        client.exec(
          `delete from public.opportunity_journey_events where idempotency_key = 'immutable-event';`,
        ),
      ).rejects.toThrow(/immutable/i);
    } finally {
      await client.close();
    }
  });
});
