import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260823224500_community_dm_realtime_contract.sql",
);

describe("community DM realtime migration", () => {
  it("lives in the canonical migration tree", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("publishes DM inserts idempotently without widening client writes", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    expect(sql).toContain("pg_publication_tables");
    expect(sql).toContain("supabase_realtime");
    expect(sql).toContain("community_dm_messages");
    expect(sql).toContain("alter publication");
    expect(sql).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*authenticated/,
    );
    expect(sql).not.toMatch(
      /create\s+policy[^;]*for\s+(?:insert|update|delete)/,
    );
  });
});
