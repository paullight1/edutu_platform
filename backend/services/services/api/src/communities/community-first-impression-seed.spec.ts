import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260827070117_seed_community_first_impression_groups.sql",
);

async function createCommunityGroupsTable(database: PGlite) {
  await database.exec(`
    create table public.community_groups (
      id uuid primary key default gen_random_uuid(),
      slug text not null unique,
      name text not null,
      description text,
      owner_id text not null,
      visibility text not null,
      join_policy text not null,
      cover_emoji text not null,
      accent text,
      member_count integer not null default 0,
      message_count integer not null default 0
    );
  `);
}

describe("Community first-impression group seed", () => {
  it("creates joinable scholarship and global-opportunity groups", async () => {
    const database = new PGlite();
    try {
      await createCommunityGroupsTable(database);
      await database.exec(readFileSync(migrationPath, "utf8"));

      const result = await database.query<{
        slug: string;
        name: string;
        visibility: string;
        join_policy: string;
      }>(`
        select slug, name, visibility, join_policy
        from public.community_groups
        order by slug
      `);

      expect(result.rows).toEqual([
        {
          slug: "global-opportunities-network",
          name: "Global Opportunities Network",
          visibility: "public",
          join_policy: "open",
        },
        {
          slug: "scholarship-opportunities-hub",
          name: "Scholarship Opportunities Hub",
          visibility: "public",
          join_policy: "open",
        },
      ]);
    } finally {
      await database.close();
    }
  });

  it("is safe to run more than once", async () => {
    const database = new PGlite();
    try {
      await createCommunityGroupsTable(database);
      const migration = readFileSync(migrationPath, "utf8");

      await database.exec(migration);
      await database.exec(migration);

      const result = await database.query<{ count: number }>(
        "select count(*)::int as count from public.community_groups",
      );
      expect(result.rows[0]?.count).toBe(2);
    } finally {
      await database.close();
    }
  });

  it("does not rewrite an existing group that owns a seeded slug", async () => {
    const database = new PGlite();
    try {
      await createCommunityGroupsTable(database);
      await database.exec(`
        insert into public.community_groups (
          id, slug, name, description, owner_id, visibility, join_policy,
          cover_emoji, accent, member_count, message_count
        ) values (
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'scholarship-opportunities-hub',
          'Private scholarship circle',
          'An existing member-owned room.',
          'user_existing_owner',
          'private',
          'request',
          '🔒',
          null,
          3,
          8
        );
      `);

      await database.exec(readFileSync(migrationPath, "utf8"));

      const result = await database.query<{
        name: string;
        owner_id: string;
        visibility: string;
        join_policy: string;
      }>(`
        select name, owner_id, visibility, join_policy
        from public.community_groups
        where slug = 'scholarship-opportunities-hub'
      `);
      expect(result.rows[0]).toEqual({
        name: "Private scholarship circle",
        owner_id: "user_existing_owner",
        visibility: "private",
        join_policy: "request",
      });
    } finally {
      await database.close();
    }
  });

  it("does not abort when an existing group owns a former seed id", async () => {
    const database = new PGlite();
    try {
      await createCommunityGroupsTable(database);
      await database.exec(`
        insert into public.community_groups (
          id, slug, name, description, owner_id, visibility, join_policy,
          cover_emoji, accent, member_count, message_count
        ) values (
          'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a201',
          'member-owned-scholarship-room',
          'Member-owned scholarship room',
          'A pre-existing group with an unrelated slug.',
          'user_existing_owner',
          'private',
          'request',
          '🔒',
          null,
          2,
          4
        );
      `);

      let migrationError: unknown;
      try {
        await database.exec(readFileSync(migrationPath, "utf8"));
      } catch (error) {
        migrationError = error;
      }
      expect(migrationError).toBeUndefined();

      const result = await database.query<{ count: number }>(
        "select count(*)::int as count from public.community_groups",
      );
      expect(result.rows[0]?.count).toBe(3);
    } finally {
      await database.close();
    }
  });
});
