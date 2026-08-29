import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260828120000_community_post_engagement.sql",
);

describe("community post engagement migration", () => {
  it("creates the comment, pin, and idempotent-like persistence contract", async () => {
    const database = new PGlite();
    await database.exec(`
      create role anon;
      create role authenticated;
      create table community_group_messages (
        id uuid primary key,
        group_id uuid not null,
        created_at timestamptz not null default now(),
        deleted_at timestamptz
      );
    `);

    const migration = await readFile(migrationPath, "utf8");
    await database.exec(migration);

    const columns = await database.query<{ column_name: string }>(`
      select column_name
      from information_schema.columns
      where table_name = 'community_group_messages'
      order by column_name
    `);
    expect(columns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining(["parent_message_id", "pinned_at", "pinned_by"]),
    );

    const constraints = await database.query<{
      constraint_name: string;
      constraint_type: string;
    }>(`
      select constraint_name, constraint_type
      from information_schema.table_constraints
      where table_name in ('community_group_messages', 'community_message_likes')
      order by constraint_name
    `);
    expect(constraints.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          constraint_name: "community_group_messages_parent_message_id_fkey",
          constraint_type: "FOREIGN KEY",
        }),
        expect.objectContaining({
          constraint_name: "community_message_likes_pkey",
          constraint_type: "PRIMARY KEY",
        }),
      ]),
    );

    await database.exec(`
      insert into community_group_messages (id, group_id)
      values
        ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
        ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      insert into community_message_likes (message_id, user_id)
      values ('11111111-1111-4111-8111-111111111111', 'user_ada');
    `);
    await expect(
      database.exec(`
        insert into community_message_likes (message_id, user_id)
        values ('11111111-1111-4111-8111-111111111111', 'user_ada');
      `),
    ).rejects.toThrow();

    await database.exec(`
      update community_group_messages
      set pinned_at = now(), pinned_by = 'user_owner'
      where id = '11111111-1111-4111-8111-111111111111';
    `);
    await expect(
      database.exec(`
        update community_group_messages
        set pinned_at = now(), pinned_by = 'user_owner'
        where id = '22222222-2222-4222-8222-222222222222';
      `),
    ).rejects.toThrow();

    await database.close();
  }, 30_000);
});
