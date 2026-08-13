import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../db/schema";
import { OpportunitiesService } from "./opportunities.service";
import { EdutuApiService } from "../edutu-api/edutu-api.service";

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
      apply_url text,
      application_url text,
      image_url text,
      tags text[],
      skills text[],
      embedding text,
      embedding_model text,
      embedded_at timestamptz,
      source text,
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
});
