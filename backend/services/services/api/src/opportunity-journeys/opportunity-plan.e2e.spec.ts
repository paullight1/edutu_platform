import { readFile } from "node:fs/promises";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../db/all-schema";
import { OpportunityJourneysController } from "./opportunity-journeys.controller";
import { OpportunityJourneysService } from "./opportunity-journeys.service";
import { OpportunityJourneyOperationsRepository } from "./opportunity-journey-operations.repository";
import { OpportunityJourneyCompatibilityService } from "./opportunity-journey-compatibility.service";
import { DatabaseOpportunityJourneyLegacyStore } from "./opportunity-journey-legacy.store";
import { OpportunityHomeService } from "./opportunity-home.service";
import { OpportunityIntentService } from "./opportunity-intent.service";
import {
  applyOpportunityJourneyMigration,
  createOpportunityJourneyTestDatabase,
} from "../../test/task-opportunity-pipeline/opportunity-journey-schema-pglite-runner";

const opportunityId = "11111111-1111-4111-8111-111111111111";
// Clerk itself is covered by auth tests. These requests use a test principal
// while exercising actual HTTP validation, domain logic and PostgreSQL writes.
describe("My Plan HTTP → PostgreSQL lifecycle", () => {
  let app: INestApplication;
  let database: Awaited<
    ReturnType<typeof createOpportunityJourneyTestDatabase>
  >;
  beforeAll(async () => {
    database = await createOpportunityJourneyTestDatabase();
    await database.exec(`
      alter table opportunities add column deadline timestamptz;
      insert into opportunities(id,title,deadline) values('${opportunityId}','Test scholarship',now()+interval '90 days');
      create table opportunity_bookmarks(user_id text, opportunity_id uuid, saved_at timestamptz, priority text, notes text, primary key(user_id,opportunity_id));
      create table opportunity_applications(id uuid primary key, user_id text, opportunity_id uuid, status text check(status in ('draft','submitted','interview','offer','rejected','withdrawn','no_response')), submitted_at timestamptz, updated_at timestamptz, notes text, metadata jsonb, unique(user_id, opportunity_id));
    `);
    const identityMigration = await readFile(
      "supabase/migrations/20260707150000_clerk_uuid_rls_alignment.sql",
      "utf8",
    );
    const functionSql = identityMigration.slice(
      identityMigration.indexOf(
        "create or replace function public.clerk_id_to_uuid",
      ),
      identityMigration.indexOf(
        "revoke all on function public.clerk_id_to_uuid",
      ),
    );
    await database.exec(functionSql);
    await applyOpportunityJourneyMigration(database);
    const connection = drizzle(database, { schema });
    const repository = new OpportunityJourneyOperationsRepository(connection);
    const intent = {
      ensureActiveIntent: async () => ({ id: null, weeklyHours: 4 }),
      getProfileSnapshot: async () => ({}),
    };
    const opportunities = {
      findOne: async (id: string) =>
        id === opportunityId
          ? {
              id,
              title: "Test scholarship",
              category: "scholarship",
              deadline: new Date(Date.now() + 90 * 86400000),
              applyUrl: "https://example.org/apply",
            }
          : null,
      recordUserOpportunitySignal: async () => ({ recorded: true }),
    };
    const service = new OpportunityJourneysService(
      repository,
      opportunities as never,
      intent as never,
    );
    const compatibility = new OpportunityJourneyCompatibilityService(
      repository,
      new DatabaseOpportunityJourneyLegacyStore(connection),
    );
    const module = await Test.createTestingModule({
      controllers: [OpportunityJourneysController],
      providers: [
        { provide: OpportunityJourneysService, useValue: service },
        { provide: OpportunityIntentService, useValue: intent },
        { provide: OpportunityHomeService, useValue: {} },
        {
          provide: OpportunityJourneyCompatibilityService,
          useValue: compatibility,
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(
      (
        req: { user?: { id: string }; headers: Record<string, string> },
        _res: unknown,
        next: () => void,
      ) => {
        req.user = { id: req.headers["x-test-user"] ?? "user_plan_owner" };
        next();
      },
    );
    await app.init();
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await database?.close();
  });

  it("saves, prepares, confirms, records outcomes, reloads and isolates another account", async () => {
    const http = request(app.getHttpServer());
    const create = {
      opportunityId,
      action: "shortlist",
      idempotencyKey: "e2e-shortlist",
    };
    let response = await http
      .post("/me/opportunity-journeys")
      .send(create)
      .expect(201);
    const id = response.body.journey.id;
    await http
      .get(`/me/opportunity-journeys/${id}`)
      .set("x-test-user", "user_someone_else")
      .expect(404);
    const retry = await http
      .post("/me/opportunity-journeys")
      .send(create)
      .expect(201);
    expect(retry.body.journey.id).toBe(id);
    response = await http
      .post("/me/opportunity-journeys")
      .send({ ...create, action: "pursue", idempotencyKey: "e2e-pursue" })
      .expect(201);
    let view = response.body;
    expect(view.tasks.length).toBeGreaterThan(0);
    await http
      .patch(`/me/opportunity-journeys/${id}/transition`)
      .send({
        state: "ready_to_apply",
        expectedVersion: view.journey.version,
        idempotencyKey: "e2e-premature-ready",
      })
      .expect(422);
    for (const task of view.tasks) {
      const update = {
        status: "completed",
        expectedVersion: view.journey.version,
        idempotencyKey: `e2e-task-${task.id}`,
      };
      response = await http
        .patch(`/me/opportunity-journeys/${id}/tasks/${task.id}`)
        .send(update)
        .expect(200);
      view = response.body;
      const repeated = await http
        .patch(`/me/opportunity-journeys/${id}/tasks/${task.id}`)
        .send(update)
        .expect(200);
      expect(repeated.body.journey.version).toBe(view.journey.version);
    }
    expect(view.journey.state).toBe("ready_to_apply");
    response = await http
      .post(`/me/opportunity-journeys/${id}/application-opened`)
      .send({
        expectedVersion: view.journey.version,
        idempotencyKey: "e2e-opened",
      })
      .expect(201);
    view = response.body;
    expect(view.journey.appliedAt).toBeNull();
    expect(
      (await database.query("select * from opportunity_applications")).rows,
    ).toHaveLength(0);
    const confirmation = {
      expectedVersion: view.journey.version,
      idempotencyKey: "e2e-confirmed",
    };
    response = await http
      .post(`/me/opportunity-journeys/${id}/application-confirmed`)
      .send(confirmation)
      .expect(201);
    view = response.body;
    expect(view.journey.appliedAt).toBeTruthy();
    const replay = await http
      .post(`/me/opportunity-journeys/${id}/application-confirmed`)
      .send(confirmation)
      .expect(201);
    expect(replay.body.journey.version).toBe(view.journey.version);
    expect(
      (await database.query("select status from opportunity_applications"))
        .rows,
    ).toEqual([{ status: "submitted" }]);
    await http
      .patch(`/me/opportunity-journeys/${id}/tasks/${view.tasks[0].id}`)
      .send({
        status: "pending",
        expectedVersion: view.journey.version,
        idempotencyKey: "e2e-illegal-task",
      })
      .expect(422);
    response = await http
      .patch(`/me/opportunity-journeys/${id}/transition`)
      .send({
        state: "interview",
        expectedVersion: view.journey.version,
        idempotencyKey: "e2e-interview",
      })
      .expect(200);
    view = response.body;
    response = await http
      .post(`/me/opportunity-journeys/${id}/outcome`)
      .send({
        outcome: "offer",
        expectedVersion: view.journey.version,
        idempotencyKey: "e2e-offer",
      })
      .expect(201);
    expect(response.body.journey.state).toBe("offer");
    expect(
      (await database.query("select status from opportunity_applications"))
        .rows,
    ).toEqual([{ status: "offer" }]);
    const closed = await http
      .get("/me/opportunity-journeys?stage=outcome")
      .expect(200);
    expect(closed.body[0].journey.state).toBe("offer");
    const other = await http
      .get("/me/opportunity-journeys?stage=outcome")
      .set("x-test-user", "user_someone_else")
      .expect(200);
    expect(other.body).toEqual([]);
  }, 60000);
});
