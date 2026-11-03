import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { toDatabaseUserId } from "../common/user-id";
import { Test } from "@nestjs/testing";
import { UnauthorizedException, type INestApplication } from "@nestjs/common";
import request from "supertest";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";
import { ApplicationHistoryService } from "./application-history.service";
import { NotificationsService } from "../notifications/notifications.service";
jest.mock("../db", () => ({ db: { execute: jest.fn() } }));
import { db } from "../db";
import { ApplicationListService } from "./application-list.service";
import { ApplicationListQuerySchema } from "./dto/application-list.dto";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
let database: PGlite;
let httpApp: INestApplication;
const service = new ApplicationListService();

beforeAll(async () => {
  database = new PGlite();
  const alignment = await readFile(
    resolve(
      process.cwd(),
      "supabase/migrations/20260707150000_clerk_uuid_rls_alignment.sql",
    ),
    "utf8",
  );
  await database.exec(
    alignment.slice(
      alignment.indexOf("create or replace function public.clerk_id_to_uuid"),
      alignment.indexOf("revoke all on function public.clerk_id_to_uuid"),
    ),
  );
  await database.exec(`create table opportunities(id uuid primary key, title text, category text);
    create table opportunity_applications(id uuid primary key default gen_random_uuid(),user_id text,opportunity_id uuid,status text,
      notes text, metadata jsonb default '{}', created_at timestamptz default now(), updated_at timestamptz default now(), submitted_at timestamptz,version int default 1);
    insert into opportunities select ('33333333-3333-4333-8333-'||lpad(i::text,12,'0'))::uuid, 'Fellowship '||i, 'Fellowships' from generate_series(1,1205) i;
    insert into opportunity_applications(user_id,opportunity_id,status,created_at)
      select '${OWNER}',id,case when row_number() over(order by title)%2=0 then 'submitted' else 'draft' end,
        now()+(row_number() over(order by title))*interval '1 microsecond' from opportunities;
    insert into opportunity_applications(user_id,opportunity_id,status) values('${OTHER}',(select id from opportunities limit 1),'offer');`);
  const dialect = new PgDialect();
  (db.execute as jest.Mock).mockImplementation((statement: any) => {
    const compiled = dialect.sqlToQuery(statement);
    return database.query(compiled.sql, compiled.params);
  });
  const module = await Test.createTestingModule({
    controllers: [MeController],
    providers: [
      { provide: ApplicationListService, useValue: service },
      { provide: MeService, useValue: {} },
      { provide: ApplicationHistoryService, useValue: {} },
    ],
  }).compile();
  httpApp = module.createNestApplication();
  // This test-only identity fixture exercises HTTP ownership and validation;
  // the deployed Clerk guard is untouched.
  httpApp.useGlobalGuards({
    canActivate(context) {
      const req = context.switchToHttp().getRequest();
      const id = req.headers.authorization?.replace(/^Bearer /, "");
      if (id !== OWNER && id !== OTHER) throw new UnauthorizedException();
      req.user = { id, authId: id };
      return true;
    },
  });
  await httpApp.init();
}, 30_000);
afterAll(async () => {
  await httpApp?.close();
  await database.close();
});

it("paginates beyond the Data API row cap with microsecond-accurate cursors and no duplicates", async () => {
  const ids = new Set();
  let cursor: string | undefined;
  do {
    const page = await service.page(
      OWNER,
      ApplicationListQuerySchema.parse({ limit: 100, cursor }),
    );
    expect(page.total).toBe(1205);
    for (const row of page.items) {
      expect(ids.has(row.id)).toBe(false);
      ids.add(row.id);
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  expect(ids.size).toBe(1205);
});

it("returns global stage counts alongside server-filtered results", async () => {
  const page = await service.page(
    OWNER,
    ApplicationListQuerySchema.parse({ q: "Fellowship 12", status: "draft" }),
  );
  expect(page.total).toBe(1205);
  expect(page.filteredTotal).toBeGreaterThan(0);
  expect(
    page.items.every(
      (row) =>
        row.status === "draft" &&
        String(row.opportunity_title).includes("Fellowship 12"),
    ),
  ).toBe(true);
  expect(page.counts.offer).toBeUndefined();
});

it("treats wildcard characters as a literal search and isolates another account", async () => {
  const empty = await service.page(
    OWNER,
    ApplicationListQuerySchema.parse({ q: "%" }),
  );
  expect(empty.filteredTotal).toBe(0);
  const other = await service.page(OTHER, ApplicationListQuerySchema.parse({}));
  expect(other.total).toBe(1);
  expect(other.items[0].user_id).toBe(OTHER);
});

it("rejects malformed cursors and unbounded limits", async () => {
  await expect(
    service.page(
      OWNER,
      ApplicationListQuerySchema.parse({ cursor: "not-a-cursor" }),
    ),
  ).rejects.toThrow("Invalid application cursor");
  expect(ApplicationListQuerySchema.safeParse({ limit: 1001 }).success).toBe(
    false,
  );
});

it("excludes tracked opportunities across every page without exposing another account", async () => {
  expect(await service.opportunityIds(OWNER)).toHaveLength(1205);
  expect(await service.opportunityIds(OTHER)).toHaveLength(1);
});

it("includes raw and derived Clerk-owned rows in pages, counts, and exclusions", async () => {
  const raw = "user_legacy_applications";
  const derived = toDatabaseUserId(raw);
  await database.query(
    `insert into opportunity_applications(user_id,opportunity_id,status)
    values($1,(select id from opportunities order by id limit 1),'draft'),
    ($2,(select id from opportunities order by id offset 1 limit 1),'submitted')`,
    [raw, derived],
  );
  const page = await service.page(
    derived,
    ApplicationListQuerySchema.parse({}),
  );
  expect(page.total).toBe(2);
  expect(page.counts).toEqual({ draft: 1, submitted: 1 });
  expect(await service.opportunityIds(derived)).toHaveLength(2);
  expect(
    (await service.page(raw, ApplicationListQuerySchema.parse({}))).items,
  ).toHaveLength(2);
  expect(
    (await service.page(OTHER, ApplicationListQuerySchema.parse({}))).total,
  ).toBe(1);
  const reminder = new NotificationsService();
  const recipients = jest
    .spyOn(reminder as any, "resolveRecipients")
    .mockResolvedValue([]);
  const draft = page.items.find((row) => row.status === "draft")!;
  const payload = {
    title: "Did you submit?",
    body: "Update your tracker",
    audience: "specific",
    targetUserIds: [derived],
    metadata: { source: "application-confirmation", applicationId: draft.id },
  };
  await (reminder as any).deliverBroadcast(payload);
  expect(recipients).toHaveBeenCalledTimes(1);
  await (reminder as any).deliverBroadcast({
    ...payload,
    targetUserIds: [OTHER],
  });
  expect(recipients).toHaveBeenCalledTimes(1);
  recipients.mockRestore();
});

it("serves bounded owner-scoped pages through HTTP and rejects invalid queries", async () => {
  const server = httpApp.getHttpServer();
  const page = await request(server)
    .get("/me/applications/page?limit=100")
    .set("Authorization", `Bearer ${OWNER}`)
    .expect(200);
  expect(page.body.items).toHaveLength(100);
  expect(page.body.total).toBe(1205);
  await request(server).get("/me/applications/page").expect(401);
  await request(server)
    .get("/me/applications/page?limit=1001")
    .set("Authorization", `Bearer ${OWNER}`)
    .expect(400);
  await request(server)
    .get(`/me/applications/page?user_id=${OTHER}`)
    .set("Authorization", `Bearer ${OWNER}`)
    .expect(400);
  const other = await request(server)
    .get("/me/applications/page")
    .set("Authorization", `Bearer ${OTHER}`)
    .expect(200);
  expect(other.body.total).toBe(1);
  const ids = await request(server)
    .get("/me/applications/opportunity-ids")
    .set("Authorization", `Bearer ${OWNER}`)
    .expect(200);
  expect(ids.body.opportunityIds).toHaveLength(1205);
});
