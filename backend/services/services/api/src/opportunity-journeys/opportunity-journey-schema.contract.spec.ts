import { getTableColumns, getTableName } from "drizzle-orm";
import {
  opportunityIntents,
  opportunityJourneyEvents,
  opportunityJourneyTasks,
  userOpportunityJourneys,
  type NewOpportunityIntent,
  type NewOpportunityJourney,
  type NewOpportunityJourneyEvent,
  type NewOpportunityJourneyTask,
  type OpportunityIntent,
  type OpportunityJourney,
  type OpportunityJourneyEvent,
  type OpportunityJourneyTask,
} from "../db/schema";
import {
  applyOpportunityJourneyMigration,
  createOpportunityJourneyTestDatabase,
  readOpportunityJourneyMigration,
} from "../../test/task-opportunity-pipeline/opportunity-journey-schema-pglite-runner";

const USER_ONE = "11111111-1111-4111-8111-111111111111";
const USER_TWO = "22222222-2222-4222-8222-222222222222";
const OPPORTUNITY_ONE = "33333333-3333-4333-8333-333333333333";
const OPPORTUNITY_TWO = "44444444-4444-4444-8444-444444444444";
const INTENT_ONE = "55555555-5555-4555-8555-555555555555";
const JOURNEY_ONE = "66666666-6666-4666-8666-666666666666";

async function expectSqlFailure(
  database: Awaited<ReturnType<typeof createOpportunityJourneyTestDatabase>>,
  statement: string,
): Promise<void> {
  await expect(database.exec(statement)).rejects.toThrow();
}

async function seedOpportunityAndIntent(
  database: Awaited<ReturnType<typeof createOpportunityJourneyTestDatabase>>,
): Promise<void> {
  await database.exec(`
    insert into public.opportunities (id, title)
    values
      ('${OPPORTUNITY_ONE}', 'First opportunity'),
      ('${OPPORTUNITY_TWO}', 'Second opportunity');

    insert into public.opportunity_intents (
      id,
      user_id,
      goal_key,
      opportunity_types,
      locations,
      remote_preference,
      action_horizon_days,
      weekly_hours,
      readiness_mode,
      source
    ) values (
      '${INTENT_ONE}',
      '${USER_ONE}',
      'study_funding',
      array['scholarship'],
      array['Nigeria'],
      'preferred',
      90,
      4,
      'apply_now',
      'explicit'
    );
  `);
}

describe("opportunity journey Drizzle mappings", () => {
  it("maps the four API-owned tables and their canonical camelCase columns", () => {
    expect(getTableName(opportunityIntents)).toBe("opportunity_intents");
    expect(getTableName(userOpportunityJourneys)).toBe(
      "user_opportunity_journeys",
    );
    expect(getTableName(opportunityJourneyTasks)).toBe(
      "opportunity_journey_tasks",
    );
    expect(getTableName(opportunityJourneyEvents)).toBe(
      "opportunity_journey_events",
    );

    expect(Object.keys(getTableColumns(opportunityIntents))).toEqual([
      "id",
      "userId",
      "status",
      "goalKey",
      "opportunityTypes",
      "locations",
      "remotePreference",
      "actionHorizonDays",
      "weeklyHours",
      "readinessMode",
      "source",
      "createdAt",
      "updatedAt",
      "archivedAt",
    ]);
    expect(Object.keys(getTableColumns(userOpportunityJourneys))).toEqual([
      "id",
      "userId",
      "opportunityId",
      "intentId",
      "state",
      "priority",
      "eligibilityStatus",
      "eligibilityConfidence",
      "eligibilityReasons",
      "eligibilityBlockers",
      "matchScoreSnapshot",
      "matchReasonsSnapshot",
      "matchRisksSnapshot",
      "estimatedEffortHours",
      "nextActionAt",
      "committedAt",
      "applyLinkOpenedAt",
      "appliedAt",
      "closedAt",
      "outcome",
      "version",
      "metadata",
      "createdAt",
      "updatedAt",
    ]);
  });

  it("exports inferred select and insert types", () => {
    const compileOnly: [
      OpportunityIntent | NewOpportunityIntent,
      OpportunityJourney | NewOpportunityJourney,
      OpportunityJourneyTask | NewOpportunityJourneyTask,
      OpportunityJourneyEvent | NewOpportunityJourneyEvent,
    ] = [
      {} as OpportunityIntent,
      {} as OpportunityJourney,
      {} as OpportunityJourneyTask,
      {} as OpportunityJourneyEvent,
    ];

    expect(compileOnly).toHaveLength(4);
  });
});

describe("opportunity journey migration", () => {
  it("creates all tables, indexes, RLS boundaries, and is safe to apply twice", async () => {
    const database = await createOpportunityJourneyTestDatabase();

    try {
      await applyOpportunityJourneyMigration(database);
      await applyOpportunityJourneyMigration(database);

      const tables = await database.query<{
        relname: string;
        relrowsecurity: boolean;
      }>(`
        select c.relname, c.relrowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relname in (
            'opportunity_intents',
            'user_opportunity_journeys',
            'opportunity_journey_tasks',
            'opportunity_journey_events'
          )
        order by c.relname;
      `);

      expect(tables.rows).toEqual([
        { relname: "opportunity_intents", relrowsecurity: true },
        { relname: "opportunity_journey_events", relrowsecurity: true },
        { relname: "opportunity_journey_tasks", relrowsecurity: true },
        { relname: "user_opportunity_journeys", relrowsecurity: true },
      ]);

      const indexes = await database.query<{ indexname: string }>(`
        select indexname
        from pg_indexes
        where schemaname = 'public'
          and tablename in (
            'opportunity_intents',
            'user_opportunity_journeys',
            'opportunity_journey_tasks',
            'opportunity_journey_events'
          )
        order by indexname;
      `);
      const indexNames = indexes.rows.map((row) => row.indexname);

      expect(indexNames).toEqual(
        expect.arrayContaining([
          "journey_events_type_created_idx",
          "journey_events_user_created_idx",
          "journey_tasks_next_action_idx",
          "opportunity_intents_one_active_per_user",
          "opportunity_journeys_one_active_primary",
          "opportunity_journeys_opportunity_idx",
          "opportunity_journeys_user_stage_idx",
          "opportunity_journey_events_user_id_idempotency_key_key",
          "opportunity_journey_tasks_journey_id_position_key",
          "user_opportunity_journeys_user_id_opportunity_id_key",
        ]),
      );

      const grants = await database.query<{
        grantee: string;
        table_name: string;
        privilege_type: string;
      }>(`
        select grantee, table_name, privilege_type
        from information_schema.role_table_grants
        where grantee in ('anon', 'authenticated')
          and table_schema = 'public'
          and table_name in (
            'opportunity_intents',
            'user_opportunity_journeys',
            'opportunity_journey_tasks',
            'opportunity_journey_events'
          );
      `);
      expect(grants.rows).toEqual([]);

      const migration = await readOpportunityJourneyMigration();
      for (const table of [
        "opportunity_intents",
        "user_opportunity_journeys",
        "opportunity_journey_tasks",
        "opportunity_journey_events",
      ]) {
        expect(migration).toContain(`alter table public.${table} enable row level security`);
        expect(migration).toContain(
          `revoke all privileges on table public.${table} from anon, authenticated`,
        );
      }
    } finally {
      await database.close();
    }
  }, 20_000);

  it("enforces one active intent, one journey per opportunity, and one active primary pursuit", async () => {
    const database = await createOpportunityJourneyTestDatabase();

    try {
      await applyOpportunityJourneyMigration(database);
      await seedOpportunityAndIntent(database);

      await expectSqlFailure(
        database,
        `
          insert into public.opportunity_intents (user_id, goal_key)
          values ('${USER_ONE}', 'employment');
        `,
      );

      await database.exec(`
        insert into public.opportunity_intents (user_id, status, goal_key)
        values ('${USER_ONE}', 'archived', 'employment');

        insert into public.user_opportunity_journeys (
          id,
          user_id,
          opportunity_id,
          intent_id,
          state,
          priority
        ) values (
          '${JOURNEY_ONE}',
          '${USER_ONE}',
          '${OPPORTUNITY_ONE}',
          '${INTENT_ONE}',
          'pursuing',
          'primary'
        );
      `);

      await expectSqlFailure(
        database,
        `
          insert into public.user_opportunity_journeys (
            user_id,
            opportunity_id,
            state,
            priority
          ) values (
            '${USER_ONE}',
            '${OPPORTUNITY_ONE}',
            'shortlisted',
            'none'
          );
        `,
      );

      await expectSqlFailure(
        database,
        `
          insert into public.user_opportunity_journeys (
            user_id,
            opportunity_id,
            state,
            priority
          ) values (
            '${USER_ONE}',
            '${OPPORTUNITY_TWO}',
            'preparing',
            'primary'
          );
        `,
      );

      await database.exec(`
        insert into public.user_opportunity_journeys (
          user_id,
          opportunity_id,
          state,
          priority
        ) values (
          '${USER_TWO}',
          '${OPPORTUNITY_TWO}',
          'preparing',
          'primary'
        );
      `);
    } finally {
      await database.close();
    }
  }, 20_000);

  it("rejects values outside every bounded intent, journey, task, and event vocabulary", async () => {
    const database = await createOpportunityJourneyTestDatabase();

    try {
      await applyOpportunityJourneyMigration(database);
      await seedOpportunityAndIntent(database);

      const invalidIntentValues = [
        "status = 'paused'",
        "goal_key = 'anything'",
        "remote_preference = 'sometimes'",
        "action_horizon_days = 45",
        "weekly_hours = 0",
        "readiness_mode = 'later'",
        "source = 'guessed'",
      ];

      for (const assignment of invalidIntentValues) {
        await expectSqlFailure(
          database,
          `update public.opportunity_intents set ${assignment} where id = '${INTENT_ONE}';`,
        );
      }

      await database.exec(`
        insert into public.user_opportunity_journeys (
          id,
          user_id,
          opportunity_id,
          intent_id,
          state,
          priority
        ) values (
          '${JOURNEY_ONE}',
          '${USER_ONE}',
          '${OPPORTUNITY_ONE}',
          '${INTENT_ONE}',
          'shortlisted',
          'none'
        );
      `);

      const invalidJourneyValues = [
        "state = 'viewed'",
        "priority = 'urgent'",
        "eligibility_status = 'maybe'",
        "eligibility_confidence = 1.001",
        "version = 0",
        "outcome = 'won'",
      ];

      for (const assignment of invalidJourneyValues) {
        await expectSqlFailure(
          database,
          `update public.user_opportunity_journeys set ${assignment} where id = '${JOURNEY_ONE}';`,
        );
      }

      await database.exec(`
        insert into public.opportunity_journey_tasks (
          journey_id,
          task_type,
          title,
          position
        ) values (
          '${JOURNEY_ONE}',
          'eligibility',
          'Confirm eligibility',
          0
        );

        insert into public.opportunity_journey_events (
          user_id,
          journey_id,
          opportunity_id,
          event_type,
          source,
          idempotency_key
        ) values (
          '${USER_ONE}',
          '${JOURNEY_ONE}',
          '${OPPORTUNITY_ONE}',
          'journey_shortlisted',
          'backend',
          'event-1'
        );
      `);

      for (const assignment of [
        "position = -1",
        "status = 'blocked'",
        "source = 'imported'",
      ]) {
        await expectSqlFailure(
          database,
          `update public.opportunity_journey_tasks set ${assignment} where journey_id = '${JOURNEY_ONE}';`,
        );
      }

      await expectSqlFailure(
        database,
        `
          update public.opportunity_journey_events
          set source = 'unknown'
          where idempotency_key = 'event-1';
        `,
      );
    } finally {
      await database.close();
    }
  }, 20_000);

  it("enforces task ordering and event idempotency uniqueness", async () => {
    const database = await createOpportunityJourneyTestDatabase();

    try {
      await applyOpportunityJourneyMigration(database);
      await seedOpportunityAndIntent(database);
      await database.exec(`
        insert into public.user_opportunity_journeys (
          id,
          user_id,
          opportunity_id,
          intent_id,
          state,
          priority
        ) values (
          '${JOURNEY_ONE}',
          '${USER_ONE}',
          '${OPPORTUNITY_ONE}',
          '${INTENT_ONE}',
          'preparing',
          'primary'
        );

        insert into public.opportunity_journey_tasks (
          journey_id,
          task_type,
          title,
          position
        ) values (
          '${JOURNEY_ONE}',
          'eligibility',
          'Confirm eligibility',
          0
        );

        insert into public.opportunity_journey_events (
          user_id,
          journey_id,
          opportunity_id,
          event_type,
          source,
          idempotency_key
        ) values (
          '${USER_ONE}',
          '${JOURNEY_ONE}',
          '${OPPORTUNITY_ONE}',
          'journey_activated',
          'backend',
          'activate-1'
        );
      `);

      await expectSqlFailure(
        database,
        `
          insert into public.opportunity_journey_tasks (
            journey_id,
            task_type,
            title,
            position
          ) values (
            '${JOURNEY_ONE}',
            'document',
            'Collect transcript',
            0
          );
        `,
      );

      await expectSqlFailure(
        database,
        `
          insert into public.opportunity_journey_events (
            user_id,
            journey_id,
            opportunity_id,
            event_type,
            source,
            idempotency_key
          ) values (
            '${USER_ONE}',
            '${JOURNEY_ONE}',
            '${OPPORTUNITY_ONE}',
            'journey_activated',
            'mobile',
            'activate-1'
          );
        `,
      );
    } finally {
      await database.close();
    }
  }, 20_000);
});
