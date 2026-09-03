import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  applyOpportunityJourneyMigration,
  createOpportunityJourneyTestDatabase,
} from "../../test/task-opportunity-pipeline/opportunity-journey-schema-pglite-runner";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OPPORTUNITY_ID = "22222222-2222-4222-8222-222222222222";
const JOURNEY_ID = "33333333-3333-4333-8333-333333333333";

async function applyEventImmutabilityMigration(
  database: Awaited<ReturnType<typeof createOpportunityJourneyTestDatabase>>,
) {
  const sql = await readFile(
    resolve(
      process.cwd(),
      "supabase/migrations/20260903090000_opportunity_journey_event_immutability.sql",
    ),
    "utf8",
  );
  await database.exec(sql);
}

describe("opportunity journey event immutability", () => {
  it("preserves the event and detaches its parent id when a journey is deleted", async () => {
    const database = await createOpportunityJourneyTestDatabase();
    try {
      await applyOpportunityJourneyMigration(database);
      await applyEventImmutabilityMigration(database);
      await database.exec(`
        insert into public.opportunities (id, title)
        values ('${OPPORTUNITY_ID}', 'Test opportunity');

        insert into public.user_opportunity_journeys (
          id,
          user_id,
          opportunity_id,
          state,
          priority
        ) values (
          '${JOURNEY_ID}',
          '${USER_ID}',
          '${OPPORTUNITY_ID}',
          'shortlisted',
          'none'
        );

        insert into public.opportunity_journey_events (
          user_id,
          journey_id,
          opportunity_id,
          event_type,
          source,
          idempotency_key
        ) values (
          '${USER_ID}',
          '${JOURNEY_ID}',
          '${OPPORTUNITY_ID}',
          'journey_shortlisted',
          'backend',
          'immutable-parent-delete'
        );

        delete from public.user_opportunity_journeys
        where id = '${JOURNEY_ID}';
      `);

      const event = await database.query<{
        journey_id: string | null;
        event_type: string;
      }>(`
        select journey_id, event_type
        from public.opportunity_journey_events
        where idempotency_key = 'immutable-parent-delete';
      `);

      expect(event.rows).toEqual([
        { journey_id: null, event_type: "journey_shortlisted" },
      ]);
    } finally {
      await database.close();
    }
  }, 20_000);

  it("rejects direct content updates and deletes", async () => {
    const database = await createOpportunityJourneyTestDatabase();
    try {
      await applyOpportunityJourneyMigration(database);
      await applyEventImmutabilityMigration(database);
      await database.exec(`
        insert into public.opportunities (id, title)
        values ('${OPPORTUNITY_ID}', 'Test opportunity');

        insert into public.user_opportunity_journeys (
          id,
          user_id,
          opportunity_id,
          state,
          priority
        ) values (
          '${JOURNEY_ID}',
          '${USER_ID}',
          '${OPPORTUNITY_ID}',
          'shortlisted',
          'none'
        );

        insert into public.opportunity_journey_events (
          user_id,
          journey_id,
          opportunity_id,
          event_type,
          source,
          idempotency_key
        ) values (
          '${USER_ID}',
          '${JOURNEY_ID}',
          '${OPPORTUNITY_ID}',
          'journey_shortlisted',
          'backend',
          'immutable-direct-write'
        );
      `);

      await expect(
        database.exec(`
          update public.opportunity_journey_events
          set event_type = 'changed'
          where idempotency_key = 'immutable-direct-write';
        `),
      ).rejects.toThrow(/immutable/i);

      await expect(
        database.exec(`
          delete from public.opportunity_journey_events
          where idempotency_key = 'immutable-direct-write';
        `),
      ).rejects.toThrow(/immutable/i);
    } finally {
      await database.close();
    }
  }, 20_000);
});
