import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const migrationPath = resolve(
  process.cwd(),
  "../../../../supabase/migrations/20260828153000_community_admin_management.sql",
);

describe("community administration migration", () => {
  it("creates request moderation, management scope, and unique trending order", async () => {
    const database = new PGlite();
    await database.exec(`
      create role anon;
      create role authenticated;
      create table opportunities (id uuid primary key);
      create table community_groups (
        id uuid primary key,
        slug text not null unique,
        name text not null,
        owner_id text not null,
        visibility text not null default 'public',
        archived_at timestamptz,
        expires_at timestamptz,
        created_at timestamptz not null default now()
      );
    `);

    const migration = await readFile(migrationPath, "utf8");
    await database.exec(migration);

    const requestColumns = await database.query<{ column_name: string }>(`
      select column_name
      from information_schema.columns
      where table_name = 'community_creation_requests'
      order by column_name
    `);
    expect(requestColumns.rows.map(({ column_name }) => column_name)).toEqual(
      expect.arrayContaining([
        "requester_id",
        "status",
        "review_reason",
        "approved_group_id",
        "cover_image_resource_url",
      ]),
    );

    const groupColumns = await database.query<{ column_name: string }>(`
      select column_name
      from information_schema.columns
      where table_name = 'community_groups'
      order by column_name
    `);
    expect(groupColumns.rows.map(({ column_name }) => column_name)).toEqual(
      expect.arrayContaining([
        "management_scope",
        "trending_rank",
        "updated_at",
      ]),
    );

    await database.exec(`
      insert into community_groups (id, slug, name, owner_id, trending_rank)
      values (
        '11111111-1111-4111-8111-111111111111',
        'first-group',
        'First group',
        'user_first',
        1
      );
    `);
    await expect(
      database.exec(`
        insert into community_groups (id, slug, name, owner_id, trending_rank)
        values (
          '22222222-2222-4222-8222-222222222222',
          'second-group',
          'Second group',
          'user_second',
          1
        );
      `),
    ).rejects.toThrow();

    await expect(
      database.exec(`
        insert into community_creation_requests (
          requester_id,
          name,
          visibility,
          join_policy,
          cover_emoji,
          status
        ) values (
          'user_requester',
          'Invalid request',
          'public',
          'open',
          '💬',
          'published'
        );
      `),
    ).rejects.toThrow();

    await database.close();
  }, 15_000);
});
