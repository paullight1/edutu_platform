import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
jest.mock("../db", () => ({ db: { execute: jest.fn(), select: jest.fn() } }));
import { db } from "../db";
import { NotificationsService } from "../notifications/notifications.service";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OPP = "22222222-2222-4222-8222-222222222222";
let database: PGlite;

beforeEach(async () => {
  database = new PGlite();
  await database.exec(`create role anon; create role authenticated; create role service_role;
    create schema private;
    create table public.opportunities(id uuid primary key);
    create table public.profiles(user_id text primary key);
    create table public.notification_queue(id uuid primary key default gen_random_uuid(), payload jsonb not null,
      scheduled_for timestamp not null, status text not null default 'pending', processed_at timestamp,
      result jsonb, created_by text references public.profiles(user_id), created_at timestamp default now());
    insert into public.opportunities values('${OPP}');`);
  for (const name of [
    "20260821002000_notification_queue_resilience.sql",
    "20261103145625_applications_tracking_reliability.sql",
  ]) {
    await database.exec(
      await readFile(
        resolve(process.cwd(), "supabase/migrations", name),
        "utf8",
      ),
    );
  }
}, 30_000);
afterEach(async () => {
  jest.restoreAllMocks();
  await database.close();
});

it("preserves accepted push delivery across a failed checkpoint without resending", async () => {
  const dialect = new PgDialect();
  let failCheckpoint = true;
  (db.execute as jest.Mock).mockImplementation(async (query) => {
    const compiled = dialect.sqlToQuery(query);
    if (compiled.sql.includes("set status='accepted'") && failCheckpoint) {
      failCheckpoint = false;
      throw new Error("checkpoint temporarily unavailable");
    }
    return database.query(compiled.sql, compiled.params);
  });
  const token = {
    id: OPP,
    userId: OWNER,
    device: { subscription: { endpoint: "https://push.test/device" } },
  };
  (db.select as jest.Mock).mockReturnValue({
    from: () => ({ where: async () => [token] }),
  });
  const sendNotification = jest.fn().mockResolvedValue({});
  const service = new NotificationsService();
  const restarted = new NotificationsService();
  jest
    .spyOn(service as any, "getWebpush")
    .mockReturnValue({ sendNotification });
  jest
    .spyOn(restarted as any, "getWebpush")
    .mockReturnValue({ sendNotification });
  const dto = {
    title: "Status",
    body: "Update",
    dedupeKey: "application-status:test:submitted",
    metadata: { source: "application-status" },
  };
  const first = await (service as any).sendWebPush([{ userId: OWNER }], dto);
  expect(first.failed).toContain("checkpoint temporarily unavailable");
  // A restart cannot know whether an in-flight request was accepted. Leave it
  // for bounded retries/dead-letter review rather than interrupting twice.
  const uncertain = await (restarted as any).sendWebPush(
    [{ userId: OWNER }],
    dto,
  );
  expect(uncertain.failed).toContain("uncertain");
  const delivered = new Set<string>();
  const retry = await (service as any).sendWebPush(
    [{ userId: OWNER }],
    dto,
    undefined,
    delivered,
  );
  expect(retry.sent).toBe(1);
  expect(delivered.has(OWNER)).toBe(true);
  expect(sendNotification).toHaveBeenCalledTimes(1);
  const receipts = await database.query<{ status: string }>(
    "select status from private.application_push_receipts",
  );
  expect(receipts.rows[0].status).toBe("accepted");
  // A later process recovers delivery telemetry from the persisted receipt.
  const restored = new Set<string>();
  await (restarted as any).sendWebPush(
    [{ userId: OWNER }],
    dto,
    undefined,
    restored,
  );
  expect(restored.has(OWNER)).toBe(true);
  expect(sendNotification).toHaveBeenCalledTimes(1);
});

async function draft() {
  const result = await database.query<{ id: string; version: number }>(
    `insert into public.opportunity_applications(user_id,opportunity_id,metadata)
    values($1,$2,'{"application_opened_at":"2026-11-03"}') returning id,version`,
    [OWNER, OPP],
  );
  return result.rows[0];
}

it("commits the draft and exactly one reminder together, even when Apply is reopened", async () => {
  const application = await draft();
  expect(application.version).toBe(1);
  await database.query(
    `insert into public.opportunity_applications(user_id,opportunity_id,metadata)
    values($1,$2,'{"application_opened_at":"2026-11-03"}') on conflict(user_id,opportunity_id) do nothing`,
    [OWNER, OPP],
  );
  const jobs = await database.query<{ payload: any }>(
    "select payload from notification_queue",
  );
  expect(jobs.rows).toHaveLength(1);
  expect(jobs.rows[0].payload).toMatchObject({
    dedupeKey: `application-confirmation:${application.id}`,
    targetUserIds: [OWNER],
    metadata: { url: "/applied" },
  });
});

it("rolls back the application if its durable reminder cannot be written", async () => {
  await database.exec(`create function private.reject_test_outbox() returns trigger language plpgsql as $$ begin raise exception 'test outbox unavailable'; end $$;
    create trigger reject_test_outbox before insert on notification_queue for each row execute function private.reject_test_outbox();`);
  await expect(draft()).rejects.toThrow("test outbox unavailable");
  expect(
    (await database.query("select id from opportunity_applications")).rows,
  ).toHaveLength(0);
  await database.exec(
    "drop trigger reject_test_outbox on notification_queue; drop function private.reject_test_outbox()",
  );
  await draft();
  expect(
    (await database.query("select id from notification_queue")).rows,
  ).toHaveLength(1);
});

it("rejects stale status updates and records a submission notification once", async () => {
  const application = await draft();
  const first = await database.query<{ version: number; submitted_at: string }>(
    `update opportunity_applications set status='submitted' where id=$1 and user_id=$2 and version=1 returning version,submitted_at`,
    [application.id, OWNER],
  );
  expect(first.rows[0].version).toBe(2);
  expect(first.rows[0].submitted_at).toBeTruthy();
  const stale = await database.query(
    `update opportunity_applications set status='withdrawn' where id=$1 and user_id=$2 and version=1 returning id`,
    [application.id, OWNER],
  );
  expect(stale.rows).toHaveLength(0);
  const jobs = await database.query(
    `select id from notification_queue where payload->'metadata'->>'source'='application-status'`,
  );
  expect(jobs.rows).toHaveLength(1);
});

it("retries transient failures with a bounded attempt count, then dead-letters", async () => {
  await draft();
  for (let attempt = 1; attempt <= 3; attempt++) {
    await database.exec(`update notification_queue set status='processing' where status='pending';
      update notification_queue set status='failed',result='{"error":"transient test failure"}' where status='processing'`);
    const result = await database.query<{
      status: string;
      attempt_count: number;
    }>("select status,attempt_count from notification_queue");
    expect(result.rows[0]).toMatchObject({
      status: attempt < 3 ? "pending" : "dead_letter",
      attempt_count: attempt,
    });
  }
});

it("recovers a worker lease after a restart without dropping the reminder", async () => {
  await draft();
  await database.exec(
    `update notification_queue set status='processing'; update notification_queue set locked_at=now()-interval '16 minutes';`,
  );
  const result = await database.query<{ recovered: number }>(
    "select public.recover_stale_notification_queue() as recovered",
  );
  expect(result.rows[0].recovered).toBe(1);
  expect(
    (
      await database.query<{ status: string; attempt_count: number }>(
        "select status,attempt_count from notification_queue",
      )
    ).rows[0],
  ).toMatchObject({ status: "pending", attempt_count: 1 });
});

it("retries push-only application jobs and retains unique accepted-device receipts", async () => {
  await draft();
  await database.exec(`update notification_queue set payload=jsonb_set(payload,'{channels,inApp}','false');
    update notification_queue set status='processing';
    update notification_queue set status='failed',result='{"error":"provider unavailable"}';`);
  expect(
    (
      await database.query<{ status: string }>(
        "select status from notification_queue",
      )
    ).rows[0].status,
  ).toBe("pending");
  await database.query(
    `insert into private.application_push_receipts(delivery_key,token_id)
    values('application-confirmation:test',$1),('application-confirmation:test',$1) on conflict do nothing`,
    [OPP],
  );
  expect(
    (await database.query("select * from private.application_push_receipts"))
      .rows,
  ).toHaveLength(1);
  await database.exec(`update notification_queue set status='processing';
    update notification_queue set locked_at=now()-interval '16 minutes';
    select public.recover_stale_notification_queue();`);
  expect(
    (
      await database.query<{ status: string }>(
        "select status from notification_queue",
      )
    ).rows[0].status,
  ).toBe("pending");
});
