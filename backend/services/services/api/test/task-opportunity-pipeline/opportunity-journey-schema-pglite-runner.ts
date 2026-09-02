import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

export const OPPORTUNITY_JOURNEY_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260902090000_opportunity_journey_pipeline.sql",
);

export async function createOpportunityJourneyTestDatabase(): Promise<PGlite> {
  const database = new PGlite();

  await database.exec(`
    create schema if not exists public;
    create role anon;
    create role authenticated;

    create table public.opportunities (
      id uuid primary key default gen_random_uuid(),
      title text not null default 'Opportunity'
    );
  `);

  return database;
}

export async function readOpportunityJourneyMigration(): Promise<string> {
  return readFile(OPPORTUNITY_JOURNEY_MIGRATION_PATH, "utf8");
}

export async function applyOpportunityJourneyMigration(
  database: PGlite,
): Promise<void> {
  await database.exec(await readOpportunityJourneyMigration());
}
