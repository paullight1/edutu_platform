import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../db/schema";
import { OpportunitiesService } from "./opportunities.service";
import { EdutuApiService } from "../edutu-api/edutu-api.service";
import { OpportunityVerificationService } from "./opportunity-verification.service";
import { OpportunityRankingService } from "./opportunity-ranking.service";

let mockRuntimeDb: any;

jest.mock("../db", () => {
  const actual = jest.requireActual("../db/schema");
  return {
    db: {
      select: (...args: any[]) => mockRuntimeDb.select(...args),
      execute: (...args: any[]) => mockRuntimeDb.execute(...args),
    },
    opportunities: actual.opportunities,
  };
});

const APPROVED_ID = "11111111-1111-4111-8111-111111111111";
const PENDING_ID = "22222222-2222-4222-8222-222222222222";
const REJECTED_ID = "33333333-3333-4333-8333-333333333333";
const UNVERIFIED_ID = "44444444-4444-4444-8444-444444444444";
const RACE_ID = "55555555-5555-4555-8555-555555555555";
const OPERATION_ID = "66666666-6666-4666-8666-666666666666";
const OLD_LEASE_TOKEN = "77777777-7777-4777-8777-777777777777";
const NEW_LEASE_TOKEN = "88888888-8888-4888-8888-888888888888";
const RECOMMENDATION_USER_ID = "99999999-9999-4999-8999-999999999999";

const consumer = {
  id: "consumer-1",
  name: "visibility-test",
  plan: "starter",
  scopes: ["opportunities:read"],
  monthlyQuota: 100,
  requestId: "visibility-request",
  quota: { limit: 100, remaining: 99, resetAt: null },
} as any;

async function createCatalogTable(database: PGlite) {
  await database.exec(`
    create table opportunities (
      id uuid primary key,
      title text not null,
      summary text,
      provider_id uuid,
      category text,
      canonical_category text,
      type text,
      description text,
      organization text,
      location text,
      eligibility_criteria text,
      eligibility jsonb,
      funding_type text,
      target_region text,
      deadline timestamptz,
      open_date date,
      close_date date,
      stipend numeric,
      currency text,
      source_url text,
      canonical_url text,
      content_fingerprint text,
      title_fingerprint text,
      apply_url text,
      application_url text,
      source text,
      image_url text,
      tags text[],
      skills text[],
      embedding text,
      embedding_model text,
      embedded_at timestamptz,
      metadata jsonb,
      is_remote boolean,
      is_featured boolean,
      quality_score integer,
      validation_status text,
      duplicate_of uuid,
      first_seen_at timestamptz,
      last_seen_at timestamptz,
      last_verified_at timestamptz,
      verification_status text,
      verification_attempts integer,
      verification_error text,
      verification_next_check_at timestamptz,
      last_http_status integer,
      broken_link_count integer,
      status text,
      created_by uuid,
      original_json text,
      created_at timestamptz,
      updated_at timestamptz
    );
  `);
  await database.exec(`
    create table opportunity_verification_operations (
      id uuid primary key,
      submission_id uuid not null,
      opportunity_id uuid not null,
      review_version integer not null,
      status text not null,
      lease_token uuid,
      lease_expires_at timestamptz,
      updated_at timestamptz default now()
    );
  `);
  await database.exec(`
    insert into opportunities
      (id, title, category, canonical_category, type, description, apply_url,
       application_url, is_remote, metadata, tags, skills, status,
       verification_status, verification_attempts, broken_link_count,
       created_at, updated_at)
    values
      ('${APPROVED_ID}', 'Approved scholarship', 'scholarships', 'scholarships',
       'scholarship', 'Approved and verified', 'https://example.com/apply',
       'https://example.com/apply', true, '{}'::jsonb, '{}'::text[], '{}'::text[],
       'active', 'verified', 1, 0, now(), now()),
      ('${PENDING_ID}', 'Pending scholarship', 'scholarships', 'scholarships',
       'scholarship', 'Pending', 'https://example.com/pending',
       'https://example.com/pending', true, '{}'::jsonb, '{}'::text[], '{}'::text[],
       'pending_review', 'unverified', 0, 0, now(), now()),
      ('${REJECTED_ID}', 'Rejected scholarship', 'scholarships', 'scholarships',
       'scholarship', 'Rejected', 'https://example.com/rejected',
       'https://example.com/rejected', true, '{}'::jsonb, '{}'::text[], '{}'::text[],
       'rejected', 'unverified', 0, 0, now(), now()),
      ('${UNVERIFIED_ID}', 'Unverified scholarship', 'scholarships', 'scholarships',
       'scholarship', 'Unverified', 'https://example.com/unverified',
       'https://example.com/unverified', true, '{}'::jsonb, '{}'::text[], '{}'::text[],
       'active', 'unverified', 0, 0, now(), now());
  `);
}

describe("persisted shared catalog visibility", () => {
  let database: PGlite;

  beforeAll(async () => {
    database = new PGlite();
    await createCatalogTable(database);
    mockRuntimeDb = drizzle(database, { schema });
  });

  afterAll(async () => {
    await database.close();
  });

  it("returns the same verified active persisted row through learner and /v1 service paths", async () => {
    const learnerService = new OpportunitiesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const apiService = new EdutuApiService({} as any);

    const learnerRows = await learnerService.findAll(20, 0, "active");
    const apiRows = await apiService.listOpportunities({}, consumer);

    expect(learnerRows.map((row: any) => row.id)).toContain(APPROVED_ID);
    expect(apiRows.data.map((row: any) => row.id)).toContain(APPROVED_ID);
    expect(learnerRows.map((row: any) => row.id)).not.toEqual(
      expect.arrayContaining([PENDING_ID, REJECTED_ID, UNVERIFIED_ID]),
    );
    expect(apiRows.data.map((row: any) => row.id)).not.toEqual(
      expect.arrayContaining([PENDING_ID, REJECTED_ID, UNVERIFIED_ID]),
    );
    expect(await apiService.getOpportunity(PENDING_ID, consumer)).toBeNull();
  });

  it("keeps public detail, search, share, and recommendation ID lookups fail-closed", async () => {
    const learnerService = new OpportunitiesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const rankingService = new OpportunityRankingService({} as any, {} as any);

    expect(await learnerService.findOne(PENDING_ID)).toBeNull();
    expect(await learnerService.ensureShareCard(REJECTED_ID)).toBeNull();
    expect(await learnerService.getSharePdf(UNVERIFIED_ID)).toBeNull();

    const searched = await learnerService.hybridSearch("Pending scholarship");
    expect(searched.map((row: any) => row.id)).not.toEqual(
      expect.arrayContaining([PENDING_ID, REJECTED_ID, UNVERIFIED_ID]),
    );

    const candidates = await (
      rankingService as any
    ).fetchCandidateOpportunities([]);
    expect(candidates.map((row: any) => row.id)).not.toEqual(
      expect.arrayContaining([PENDING_ID, REJECTED_ID, UNVERIFIED_ID]),
    );
  });

  it("only exposes a pending-review row after the persisted verification transition", async () => {
    const learnerService = new OpportunitiesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const before = await learnerService.findAll(20, 0, "active");
    expect(before.map((row: any) => row.id)).not.toContain(PENDING_ID);

    await database.exec(`
      update opportunities
      set status = 'active', verification_status = 'verified',
          last_verified_at = now()
      where id = '${PENDING_ID}'
    `);

    const after = await learnerService.findAll(20, 0, "active");
    expect(after.map((row: any) => row.id)).toContain(PENDING_ID);
  });

  it("invalidates a warmed learner cache across withdrawal and verification publication", async () => {
    let cached: unknown;
    const cache = {
      wrap: jest.fn(
        async (_key: string, _ttl: number, load: () => Promise<unknown>) => {
          if (cached === undefined) cached = await load();
          return cached;
        },
      ),
      delByPrefix: jest.fn(async () => {
        cached = undefined;
      }),
    };
    const learnerService = new OpportunitiesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      cache as any,
    );

    expect(
      (await learnerService.findAll(20, 0, "active")).map((row: any) => row.id),
    ).toContain(APPROVED_ID);
    await database.exec(`
      update opportunities
      set status = 'rejected', verification_status = 'unverified'
      where id = '${APPROVED_ID}'
    `);
    await learnerService.invalidateCatalogCache();
    expect(
      (await learnerService.findAll(20, 0, "active")).map((row: any) => row.id),
    ).not.toContain(APPROVED_ID);

    await database.exec(`
      update opportunities
      set status = 'active', verification_status = 'verified', last_verified_at = now()
      where id = '${APPROVED_ID}'
    `);
    await learnerService.invalidateCatalogCache();
    expect(
      (await learnerService.findAll(20, 0, "active")).map((row: any) => row.id),
    ).toContain(APPROVED_ID);
    expect(cache.delByPrefix).toHaveBeenCalledWith("opps:");
  });

  it("withdraws a warmed personalized recommendation when catalog visibility changes", async () => {
    let withdrawn = false;
    const rankingService = new OpportunityRankingService({} as any, {} as any);
    jest.spyOn(rankingService as any, "getUserProfile").mockResolvedValue(null);
    jest
      .spyOn(rankingService as any, "getUserPreferences")
      .mockResolvedValue(null);
    jest.spyOn(rankingService as any, "getUserGoals").mockResolvedValue([]);
    const query = jest
      .spyOn(rankingService, "queryRecommendations")
      .mockImplementation(
        async () =>
          ({
            opportunities: withdrawn ? [] : [{ id: APPROVED_ID }],
          }) as any,
      );
    const learnerService = new OpportunitiesService(
      rankingService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const before = await rankingService.getRecommendationsForUser(
      RECOMMENDATION_USER_ID,
    );
    expect((before as any).opportunities).toEqual([{ id: APPROVED_ID }]);

    withdrawn = true;
    await database.exec(`
      update opportunities
      set status = 'rejected', verification_status = 'unverified'
      where id = '${APPROVED_ID}'
    `);
    await learnerService.invalidateCatalogCache();

    const after = await rankingService.getRecommendationsForUser(
      RECOMMENDATION_USER_ID,
    );
    expect((after as any).opportunities).toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("database condition rejects a stale verifier after withdrawal", async () => {
    await database.exec(`
      insert into opportunities
        (id, title, apply_url, application_url, is_remote, metadata, tags, skills,
         status, verification_status, verification_attempts, broken_link_count,
         created_at, updated_at)
      values
        ('${RACE_ID}', 'Race submission', 'https://example.com/race',
         'https://example.com/race', true,
         '{"submission_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "submission_review_status":"approved", "submission_review_version":1}'::jsonb,
         '{}'::text[], '{}'::text[], 'pending_review', 'unverified', 0, 0, now(), now())
    `);

    // This is the committed withdrawal interleaving: the verifier has an old
    // candidate snapshot (version 1), then review commits version 2/rejected.
    await database.exec(`
      update opportunities
      set status = 'rejected', verification_status = 'unverified',
          metadata = jsonb_set(
            jsonb_set(metadata, '{submission_review_status}', '"rejected"'),
            '{submission_review_version}', '2'
          )
      where id = '${RACE_ID}'
    `);

    const verifier = new OpportunityVerificationService({} as any);
    const persisted = await (verifier as any).persistOutcome({
      opportunityId: RACE_ID,
      title: "Race submission",
      url: "https://example.com/race",
      status: "verified",
      opportunityStatus: "active",
      httpStatus: 200,
      error: null,
      nextCheckAt: new Date(),
      submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      submissionReviewVersion: 1,
    });

    const result = await database.query<{
      status: string;
      verification_status: string;
    }>(
      `select status, verification_status from opportunities where id = '${RACE_ID}'`,
    );
    const [row] = result.rows;
    expect(persisted).toBe(false);
    expect(row).toEqual({
      status: "rejected",
      verification_status: "unverified",
    });
  });

  it("fences a late old worker catalog write after reclaim and replacement success", async () => {
    await database.exec(`
      insert into opportunities
        (id, title, apply_url, application_url, is_remote, metadata, tags, skills,
         status, verification_status, verification_attempts, broken_link_count,
         created_at, updated_at)
      values
        ('${RACE_ID}', 'Lease race', 'https://example.com/race',
         'https://example.com/race', true,
         '{"submission_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "submission_review_status":"approved", "submission_review_version":1}'::jsonb,
         '{}'::text[], '{}'::text[], 'pending_review', 'unverified', 0, 0, now(), now())
      on conflict (id) do update set
        status = excluded.status,
        verification_status = excluded.verification_status,
        metadata = excluded.metadata,
        verification_attempts = excluded.verification_attempts,
        broken_link_count = excluded.broken_link_count;
    `);
    await database.exec(`
      insert into opportunity_verification_operations
        (id, submission_id, opportunity_id, review_version, status, lease_token,
         lease_expires_at)
      values
        ('${OPERATION_ID}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${RACE_ID}', 1,
         'running', '${OLD_LEASE_TOKEN}', now() + interval '2 minutes')
      on conflict (id) do update set
        status = excluded.status,
        lease_token = excluded.lease_token,
        review_version = excluded.review_version,
        lease_expires_at = excluded.lease_expires_at;
    `);

    await database.exec(`
      update opportunity_verification_operations
      set status = 'retry', lease_token = null, lease_expires_at = null
      where id = '${OPERATION_ID}';
      update opportunity_verification_operations
      set status = 'running', lease_token = '${NEW_LEASE_TOKEN}',
          lease_expires_at = now() + interval '2 minutes'
      where id = '${OPERATION_ID}';
    `);

    const verifier = new OpportunityVerificationService({} as any);
    const replacement = await (verifier as any).persistOutcome({
      opportunityId: RACE_ID,
      title: "Lease race",
      url: "https://example.com/race",
      status: "verified",
      opportunityStatus: "active",
      httpStatus: 200,
      error: null,
      nextCheckAt: new Date(),
      submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      submissionReviewVersion: 1,
      verificationOperationId: OPERATION_ID,
      verificationLeaseToken: NEW_LEASE_TOKEN,
    });
    const oldWorker = await (verifier as any).persistOutcome({
      opportunityId: RACE_ID,
      title: "Lease race",
      url: "https://example.com/race",
      status: "broken_link",
      opportunityStatus: "pending_review",
      httpStatus: 404,
      error: "late old worker",
      nextCheckAt: null,
      submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      submissionReviewVersion: 1,
      verificationOperationId: OPERATION_ID,
      verificationLeaseToken: OLD_LEASE_TOKEN,
    });

    const result = await database.query<{
      status: string;
      verification_status: string;
    }>(
      `select status, verification_status from opportunities where id = '${RACE_ID}'`,
    );
    expect(replacement).toBe(true);
    expect(oldWorker).toBe(false);
    expect(result.rows[0]).toEqual({
      status: "active",
      verification_status: "verified",
    });
  });

  it("rejects a late catalog write from a verifier aborted by the hard timeout", async () => {
    await database.exec(`
      insert into opportunities
        (id, title, apply_url, application_url, is_remote, metadata, tags, skills,
         status, verification_status, verification_attempts, broken_link_count,
         created_at, updated_at)
      values
        ('${RACE_ID}', 'Timed out submission', 'https://example.com/timeout',
         'https://example.com/timeout', true,
         '{"submission_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "submission_review_status":"approved", "submission_review_version":1}'::jsonb,
         '{}'::text[], '{}'::text[], 'pending_review', 'unverified', 0, 0, now(), now())
      on conflict (id) do update set
        status = excluded.status,
        verification_status = excluded.verification_status,
        metadata = excluded.metadata,
        verification_attempts = excluded.verification_attempts,
        broken_link_count = excluded.broken_link_count;
    `);
    await database.exec(`
      insert into opportunity_verification_operations
        (id, submission_id, opportunity_id, review_version, status, lease_token,
         lease_expires_at)
      values
        ('${OPERATION_ID}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${RACE_ID}', 1,
         'running', '${NEW_LEASE_TOKEN}', now() + interval '2 minutes')
      on conflict (id) do update set
        status = excluded.status,
        lease_token = excluded.lease_token,
        review_version = excluded.review_version,
        lease_expires_at = excluded.lease_expires_at;
    `);

    const verifier = new OpportunityVerificationService({} as any);
    const controller = new AbortController();
    controller.abort(new Error("Verification operation timed out"));

    const persisted = await (verifier as any).persistOutcome({
      opportunityId: RACE_ID,
      title: "Timed out submission",
      url: "https://example.com/timeout",
      status: "verified",
      opportunityStatus: "active",
      httpStatus: 200,
      error: null,
      nextCheckAt: new Date(),
      submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      submissionReviewVersion: 1,
      verificationOperationId: OPERATION_ID,
      verificationLeaseToken: NEW_LEASE_TOKEN,
      verificationSignal: controller.signal,
    });

    const result = await database.query<{
      status: string;
      verification_status: string;
    }>(
      `select status, verification_status from opportunities where id = '${RACE_ID}'`,
    );
    expect(persisted).toBe(false);
    expect(result.rows[0]).toEqual({
      status: "pending_review",
      verification_status: "unverified",
    });
  });
});
