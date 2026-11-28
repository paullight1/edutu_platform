import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { Expo } from "expo-server-sdk";
jest.mock("../db", () => ({
  db: { execute: jest.fn(), select: jest.fn() },
  pool: { query: jest.fn() },
}));
import { db, pool } from "../db";
import { AutoApplyController } from "./auto-apply.controller";
import { AutoApplyActivityService } from "./auto-apply-activity.service";
import { AutoApplyWorker } from "./auto-apply-worker.service";
import { NotificationsService } from "../notifications/notifications.service";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OPP = "22222222-2222-4222-8222-222222222222";
let database: PGlite;

async function migrateAutoApply() {
  await database.exec(`
    alter table public.opportunities add column title text, add column status text,
      add column deadline timestamptz, add column close_date date, add column application_url text, add column apply_url text;
    alter table public.profiles add column school text, add column degree text, add column major text, add column grad_year int;
    create function public.clerk_id_to_uuid(p_id text) returns text language sql immutable as $$ select p_id $$;
    update public.opportunities set title='Example Fellowship';
  `);
  const directory = resolve(process.cwd(), "supabase/migrations");
  const files = (await readdir(directory))
    .filter(
      (name) =>
        /^2026112[67]\d+_auto_apply_.*\.sql$/.test(name) &&
        !name.includes("notification_retry"),
    )
    .sort();
  for (const file of files)
    await database.exec(await readFile(resolve(directory, file), "utf8"));
  (pool.query as unknown as jest.Mock).mockImplementation(
    async (sql: string, params?: unknown[]) => database.query(sql, params),
  );
}

it("reclaims submissions interrupted before dispatch and preserves uncertainty after dispatch", async () => {
  await migrateAutoApply();
  const second = "33333333-3333-4333-8333-333333333333";
  const third = "44444444-4444-4444-8444-444444444444";
  await database.query(
    "insert into opportunities(id,title) values($1,'Dispatched'),($2,'Legacy')",
    [second, third],
  );
  const trackers = (
    await database.query<{ id: string; opportunity_id: string }>(
      `insert into opportunity_applications(user_id, opportunity_id) values ($1,$2),($1,$3),($1,$4)
       returning id,opportunity_id`,
      [OWNER, OPP, second, third],
    )
  ).rows;
  for (const [index, tracker] of trackers.entries()) {
    await database.query(
      `insert into private.auto_apply_attempts(application_id, owner_id, state, version, lease_until, submission_dispatched,
          mapping_revision, destination_host, review, profile_snapshot)
        values($1,$2,'submitting',7,now()-interval '1 minute',$3,repeat('a',64),'provider.example',
          '[{"label":"Name","value":"Example Learner"}]', '{"education":{"school":"Example school"}}')`,
      [tracker.id, OWNER, [false, true, null][index]],
    );
  }
  const snapshot = async () =>
    (
      await database.query<{
        id: string;
        opportunity_id: string;
        state: string;
        version: number;
        profile_snapshot: unknown;
        receipt: string | null;
      }>(
        `select attempt.id, application.opportunity_id, attempt.state, attempt.version, attempt.profile_snapshot,
        attempt.provider_receipt as receipt
       from private.auto_apply_attempts attempt join opportunity_applications application on application.id=attempt.application_id
       order by application.opportunity_id`,
      )
    ).rows;
  const fetchMock = jest
    .spyOn(global, "fetch")
    .mockImplementation(async (_input, options) => {
      const [ready, sent, legacy] = await snapshot();
      expect(ready).toMatchObject({
        state: "submitting",
        version: 8,
        profile_snapshot: expect.any(Object),
      });
      for (const row of [sent, legacy]) {
        expect(row).toMatchObject({
          state: "unconfirmed",
          version: 8,
          profile_snapshot: null,
        });
      }
      expect(JSON.parse(String(options?.body))).toMatchObject({
        id: ready.id,
        version: 8,
        opportunityId: OPP,
      });
      return Response.json({ receipt: "RECOVERED-BEFORE-DISPATCH" });
    });
  const env = process.env;
  process.env = {
    ...env,
    AUTO_APPLY_PROVIDER_PREPARE_URL: "https://provider.example/prepare",
    AUTO_APPLY_PROVIDER_SUBMIT_URL: "https://provider.example/submit",
    AUTO_APPLY_PROVIDER_TOKEN: "fixture",
    AUTO_APPLY_PILOT_OPPORTUNITIES: [OPP, second, third].join(","),
  };
  try {
    const worker = new AutoApplyWorker({} as never, {} as never);
    await worker.submitApproved();
    await worker.submitApproved();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await snapshot()).toMatchObject([
      { state: "submitted", version: 9, receipt: "RECOVERED-BEFORE-DISPATCH" },
      { state: "unconfirmed", version: 8, receipt: null },
      { state: "unconfirmed", version: 8, receipt: null },
    ]);
    const [verified, manuallyRecorded] = await snapshot();
    await database.query(
      `update opportunity_applications set status = 'submitted',
        metadata = '{"submission_source":"auto_apply","auto_apply_confirmation":{"attemptId":"forged","attemptVersion":999}}'
        where opportunity_id = $1`,
      [manuallyRecorded.opportunity_id],
    );
    const outbox = await database.query<{
      payload: {
        title: string;
        body: string;
        metadata: Record<string, unknown>;
      };
    }>(
      "select payload from notification_queue where payload #>> '{metadata,status}' = 'submitted'",
    );
    expect(outbox.rows).toHaveLength(2);
    const verifiedNotice = outbox.rows.find(
      ({ payload }) => payload.metadata.opportunityId === OPP,
    )?.payload;
    expect(verifiedNotice).toMatchObject({
      title: "Application receipt confirmed",
      body: expect.stringContaining("Example Fellowship"),
      metadata: {
        source: "application-status",
        status: "submitted",
        submissionVerified: true,
        attemptId: verified.id,
        attemptVersion: verified.version,
        url: "/auto-apply/" + verified.id,
      },
    });
    expect(JSON.stringify(verifiedNotice)).not.toContain(
      "RECOVERED-BEFORE-DISPATCH",
    );
    const manualNotice = outbox.rows.find(
      ({ payload }) =>
        payload.metadata.opportunityId === manuallyRecorded.opportunity_id,
    )?.payload;
    expect(manualNotice).toMatchObject({
      title: "Submission recorded",
      metadata: { url: "/applied" },
    });
    expect(manualNotice?.metadata).not.toHaveProperty("submissionVerified");
    expect(manualNotice?.metadata).not.toHaveProperty("attemptId");
  } finally {
    process.env = env;
    fetchMock.mockRestore();
  }
}, 30_000);

it("invalidates a cross-origin handoff when Edutu's catalog link changes and clears it on cancellation", async () => {
  await migrateAutoApply();
  const listing = "https://listing.example/application?cycle=2027";
  const exact = "https://provider.example/documents#references";
  await database.query(
    "update opportunities set application_url = $1 where id = $2",
    [listing, OPP],
  );
  const [tracker] = (
    await database.query<{ id: string }>(
      "insert into opportunity_applications (user_id, opportunity_id) values ($1,$2) returning id",
      [OWNER, OPP],
    )
  ).rows;
  const [attempt] = (
    await database.query<{ id: string }>(
      `insert into private.auto_apply_attempts (application_id, owner_id, state, question,
       handoff_required, handoff_step_url, handoff_catalog_fingerprint)
     values ($1, $2, 'needs_input', 'Complete verification.', true, $3, $4) returning id`,
      [
        tracker.id,
        OWNER,
        exact,
        createHash("sha256").update(listing).digest("hex"),
      ],
    )
  ).rows;
  const controller = new AutoApplyController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const before = await controller.attempt(OWNER, attempt.id);
  expect(before).toMatchObject({ exactHandoff: true, handoffUrl: exact });
  const changed = "https://listing.example/application?cycle=2028";
  await database.query(
    "update opportunities set application_url = $1 where id = $2",
    [changed, OPP],
  );
  expect(await controller.attempt(OWNER, attempt.id)).toMatchObject({
    exactHandoff: false,
    handoffUrl: changed,
  });
  await expect(
    controller.controlAttempt(OWNER, attempt.id, {
      version: before.version,
      action: "cancel",
    }),
  ).resolves.toMatchObject({ state: "cancelled" });
  const { rows } = await database.query(
    "select handoff_step_url, handoff_catalog_fingerprint from private.auto_apply_attempts where id = $1",
    [attempt.id],
  );
  expect(rows[0]).toEqual({
    handoff_step_url: null,
    handoff_catalog_fingerprint: null,
  });
}, 30_000);

it("counts text length the same way as the browser for review limits", async () => {
  await migrateAutoApply();
  const { rows } = await database.query(
    `select private.auto_apply_review_value_fits('{"maxLength":3}', 'é🙂') as fits,
      private.auto_apply_review_value_fits('{"maxLength":2}', 'é🙂') as over_limit,
      private.auto_apply_review_value_fits('{}', 'Example') as unlimited`,
  );
  expect(rows[0]).toEqual({ fits: true, over_limit: false, unlimited: true });
}, 30_000);

it("uses the existing attempt and quota when resolving a CV notification", async () => {
  await migrateAutoApply();
  const tracked = await database.query<{ id: string }>(
    "insert into opportunity_applications(user_id, opportunity_id) values($1,$2) returning id",
    [OWNER, OPP],
  );
  await database.query(
    "insert into private.auto_apply_profiles(user_id,background,statement) values($1,'Academic projects','')",
    [OWNER],
  );
  const started = await database.query<{ id: string }>(
    "select private.start_auto_apply($1,$2,'none',$1,array[$3]) as id",
    [OWNER, tracked.rows[0].id, OPP],
  );
  const attemptId = started.rows[0].id;
  await database.query(
    "update private.auto_apply_attempts set state='needs_input', question='Which CV?', question_cv=true, version=2 where id=$1",
    [attemptId],
  );
  const notification = (
    await database.query<{ payload: Record<string, unknown> }>(
      "select payload from notification_queue where payload->'metadata'->>'source'='auto-apply-action'",
    )
  ).rows[0].payload;
  expect(notification).toMatchObject({
    title: "Auto Apply needs a CV",
    body: "Example Fellowship needs a CV to continue.",
    metadata: { attemptId, url: "/auto-apply/" + attemptId },
  });
  const cv = {
    id: OPP,
    name: "Academic CV",
    data: { summary: "Academic projects" },
  };
  const controller = new AutoApplyController(
    {} as never,
    { get: async () => cv } as never,
    {} as never,
    {} as never,
  );
  await expect(
    controller.selectAttemptCv(OWNER, attemptId, { cvId: cv.id, version: 2 }),
  ).resolves.toMatchObject({ id: attemptId, state: "queued", version: 3 });
  const stored = (
    await database.query(
      "select cv_snapshot, question_cv, (select attempts from private.auto_apply_usage) as used from private.auto_apply_attempts where id=$1",
      [attemptId],
    )
  ).rows[0];
  expect(stored).toMatchObject({
    cv_snapshot: cv,
    question_cv: false,
    used: 1,
  });
}, 30_000);

it("snapshots saved education and protects existing attempts from profile edits", async () => {
  await migrateAutoApply();
  const secondOpportunity = "33333333-3333-4333-8333-333333333333";
  await database.query(
    "insert into opportunities(id,title) values($1,'Second opportunity')",
    [secondOpportunity],
  );
  await database.query(
    "insert into profiles(user_id,school,major,grad_year) values($1,'Edutu University','Physics',2027)",
    [OWNER],
  );
  await database.query(
    "insert into private.auto_apply_profiles(user_id,background,statement) values($1,'Academic projects','')",
    [OWNER],
  );
  const applications = await database.query<{
    id: string;
    opportunity_id: string;
  }>(
    "insert into opportunity_applications(user_id,opportunity_id) values($1,$2),($1,$3) returning id,opportunity_id",
    [OWNER, OPP, secondOpportunity],
  );
  const start = async (application: { id: string; opportunity_id: string }) =>
    (
      await database.query<{ id: string }>(
        "select private.start_auto_apply($1,$2,'none',$1,array[$3]) as id",
        [OWNER, application.id, application.opportunity_id],
      )
    ).rows[0].id;
  const snapshot = async (id: string) =>
    (
      await database.query<{ education: unknown }>(
        "select profile_snapshot->'education' as education from private.auto_apply_attempts where id=$1",
        [id],
      )
    ).rows[0].education;

  const first = await start(applications.rows[0]);
  expect(await snapshot(first)).toEqual({
    school: "Edutu University",
    degree: "",
    major: "Physics",
    graduationYear: "2027",
  });
  const education = {
    school: "New University",
    degree: "BSc",
    major: "",
    graduationYear: "2028",
  };
  const controller = new AutoApplyController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const contact = { name: "Example Learner", email: "learner@example.test" };
  await expect(
    controller.saveProfile(OWNER, {
      background: "",
      statement: "",
      version: 1,
      education,
      contact: { ...contact, phone: "+1 202 555 0100" },
    }),
  ).resolves.toEqual({ version: 2 });
  await expect(
    controller.saveProfile(OWNER, {
      background: "",
      statement: "",
      version: 2,
      contact,
    }),
  ).resolves.toEqual({ version: 3 });
  const second = await start(applications.rows[1]);
  expect(await snapshot(second)).toEqual(education);
  expect(await snapshot(first)).toMatchObject({
    major: "Physics",
    graduationYear: "2027",
  });
  const phones = await database.query(
    "select id, profile_snapshot->>'contact_phone' as phone from private.auto_apply_attempts where id in ($1,$2)",
    [first, second],
  );
  expect(phones.rows).toEqual(
    expect.arrayContaining([
      { id: first, phone: "" },
      { id: second, phone: "+1 202 555 0100" },
    ]),
  );
}, 30_000);

it.each([false, true])(
  "delivers separate progress for attempts sharing an Android token (rollback=%s)",
  async (rollback) => {
    await migrateAutoApply();
    const secondOpportunity = "33333333-3333-4333-8333-333333333333";
    const token = "ExpoPushToken[fixture-android]";
    await database.exec(`
    create table public.notification_push_tokens (user_id uuid, token text, provider text, device jsonb);
    create table public.notification_preferences (user_id uuid, push_notifications boolean);
  `);
    await database.query(
      "insert into opportunities(id,title) values($1,'Second opportunity')",
      [secondOpportunity],
    );
    await database.query(
      `insert into notification_push_tokens(user_id,token,provider,device)
     values($1,$2,'expo','{"platform":"android"}')`,
      [OWNER, token],
    );
    const tracked = await database.query<{
      id: string;
      opportunity_id: string;
    }>(
      "insert into opportunity_applications(user_id, opportunity_id) values($1,$2),($1,$3) returning id, opportunity_id",
      [OWNER, OPP, secondOpportunity],
    );
    const jobs = await database.query<{ id: string }>(
      `insert into private.auto_apply_attempts(application_id,owner_id,state,version)
     values($1,$3,'running',3),($2,$3,'queued',4) returning id`,
      [tracked.rows[0].id, tracked.rows[1].id, OWNER],
    );
    const [first, second] = jobs.rows.map((row) => row.id);
    const controller = new AutoApplyController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const device = {
      activityId: "android",
      token,
      platform: "android" as const,
    };
    await expect(
      controller.registerActivity(OWNER, first, device),
    ).resolves.toEqual({ updated: true });
    await expect(
      controller.registerActivity(OWNER, second, device),
    ).resolves.toEqual({ updated: true });
    await database.query(
      "update private.auto_apply_attempts set state=$2, version=$3 where id=$1",
      [first, rollback ? "unconfirmed" : "submitted", rollback ? 4 : 5],
    );
    const send = jest
      .spyOn(Expo.prototype, "sendPushNotificationsAsync")
      .mockImplementation(async (messages) =>
        messages.map(() => ({ status: "ok", id: "fixture-ticket" })),
      );
    const env = process.env;
    process.env = {
      ...env,
      AUTO_APPLY_PILOT_OPPORTUNITIES: rollback ? "" : OPP,
      AUTO_APPLY_PROVIDER_PREPARE_URL: "https://provider.example/prepare",
      AUTO_APPLY_PROVIDER_RECEIPT_URL: "https://provider.example/receipt",
      AUTO_APPLY_PROVIDER_TOKEN: "fixture",
    };
    try {
      if (rollback) {
        const provider = jest
          .spyOn(global, "fetch")
          .mockResolvedValueOnce(Response.json({ receipt: "LATE-RECEIPT" }));
        await expect(
          new AutoApplyWorker({} as never, {} as never).reconcileReceipt(
            first,
            4,
          ),
        ).resolves.toBe(true);
        expect(provider).toHaveBeenCalledWith(
          `https://provider.example/receipt/${first}`,
          expect.objectContaining({ method: "GET" }),
        );
      }
      await new AutoApplyActivityService().sendAndroidUpdates();
    } finally {
      process.env = env;
    }
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: token,
          data: expect.objectContaining({
            attemptId: first,
            state: "submitted",
          }),
        }),
        expect.objectContaining({
          to: token,
          data: expect.objectContaining({ attemptId: second, state: "queued" }),
        }),
      ]),
    );
    const remaining = await database.query(
      "select attempt_id, delivered_version from private.auto_apply_android_activities",
    );
    expect(remaining.rows).toEqual([
      { attempt_id: second, delivered_version: 4 },
    ]);
    const terminalProgress = {
      updated: false,
      progress: { id: first, state: "submitted", version: 5 },
    };
    await expect(
      controller.registerActivity(OWNER, first, device),
    ).resolves.toEqual(terminalProgress);
    const ios = { activityId: "late-activity", token: "aa".repeat(32) };
    await expect(
      controller.registerActivity(OWNER, first, ios),
    ).resolves.toEqual(terminalProgress);
    await expect(
      controller.registerActivity(secondOpportunity, first, ios),
    ).resolves.toEqual({ updated: false });
    const registeredLate = await database.query(
      `select token from private.auto_apply_android_activities where attempt_id = $1
     union all select token from private.auto_apply_live_activities where attempt_id = $1`,
      [first],
    );
    expect(registeredLate.rows).toEqual([]);
  },
  30_000,
);

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
    "20261126174700_auto_apply_notification_retry.sql",
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
  (pool.query as unknown as jest.Mock).mockReset();
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

it("recovers deferred Auto Apply pushes after a transient failure and a stale lease", async () => {
  await database.exec(`set timezone = 'Africa/Lagos';
    insert into notification_queue(payload, scheduled_for)
    values ('{"channels":{"inApp":false},"metadata":{"source":"auto-apply-action","quietHoursDeferred":true},"dedupeKey":"auto-apply:test"}', now());
    update notification_queue set status='processing';
    update notification_queue set status='failed',result='{"error":"push temporarily unavailable"}';`);
  const read = async () =>
    (
      await database.query(
        "select status, attempt_count, scheduled_for between (now() at time zone 'UTC') and (now() at time zone 'UTC') + interval '3 minutes' as delayed from notification_queue",
      )
    ).rows[0];
  expect(await read()).toMatchObject({
    status: "pending",
    attempt_count: 1,
    delayed: true,
  });
  await database.exec(`update notification_queue set status='processing';
    update notification_queue set locked_at=now()-interval '16 minutes';
    select public.recover_stale_notification_queue();`);
  expect(await read()).toMatchObject({
    status: "pending",
    attempt_count: 2,
    delayed: true,
  });
  await database.exec(`update notification_queue set status='processing';
    update notification_queue set status='failed',result='{"error":"push temporarily unavailable"}';`);
  expect(await read()).toMatchObject({
    status: "dead_letter",
    attempt_count: 3,
  });
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
