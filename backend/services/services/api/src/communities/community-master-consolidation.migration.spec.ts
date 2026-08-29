import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260829190000_consolidate_scholarships_for_africa.sql",
);

describe("Scholarships for Africa consolidation migration", () => {
  it("keeps active members, removes old content and orphan-prone reports, and is idempotent", async () => {
    const database = new PGlite();
    await database.exec(`
      create schema if not exists public;
      create table public.community_groups (
        id uuid primary key,
        slug text not null unique,
        name text not null,
        description text,
        owner_id text not null,
        visibility text not null,
        join_policy text not null,
        cover_emoji text not null,
        accent text,
        member_count integer not null default 0,
        message_count integer not null default 0,
        last_message_at timestamptz,
        management_scope text not null default 'member',
        trending_rank integer,
        archived_at timestamptz,
        expires_at timestamptz,
        updated_at timestamptz not null default now()
      );
      create unique index community_groups_trending_rank_unique
        on public.community_groups (trending_rank) where trending_rank is not null;
      create table public.community_group_members (
        group_id uuid not null references public.community_groups(id) on delete cascade,
        user_id text not null,
        role text not null,
        status text not null,
        joined_at timestamptz not null default now(),
        unique (group_id, user_id)
      );
      create table public.community_group_messages (
        id uuid primary key,
        group_id uuid not null references public.community_groups(id) on delete cascade,
        opportunity_id uuid,
        body text not null
      );
      create table public.community_reports (
        id uuid primary key,
        target_type text not null,
        target_id uuid not null
      );
      create table public.community_creation_requests (
        id uuid primary key,
        status text not null,
        review_reason text,
        reviewed_by text,
        reviewed_at timestamptz,
        updated_at timestamptz not null default now()
      );
      insert into public.community_groups
        (id, slug, name, owner_id, visibility, join_policy, cover_emoji, trending_rank)
      values
        ('b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a102', 'africa-opportunity-circle', 'Africa Opportunity Circle', 'system:edutu-curated', 'public', 'open', '🌍', 2),
        ('11111111-1111-4111-8111-111111111111', 'old-group', 'Old Group', 'user_owner', 'public', 'open', '💬', 1);
      insert into public.community_group_members (group_id, user_id, role, status) values
        ('11111111-1111-4111-8111-111111111111', 'user_active', 'owner', 'active'),
        ('b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a102', 'user_existing', 'member', 'active'),
        ('b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a102', 'user_banned', 'member', 'banned');
      insert into public.community_group_messages (id, group_id, body) values
        ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'old post');
      insert into public.community_reports (id, target_type, target_id) values
        ('33333333-3333-4333-8333-333333333333', 'message', '22222222-2222-4222-8222-222222222222'),
        ('44444444-4444-4444-8444-444444444444', 'group', '11111111-1111-4111-8111-111111111111');
      insert into public.community_creation_requests (id, status) values
        ('55555555-5555-4555-8555-555555555555', 'pending');
    `);

    const migration = await readFile(migrationPath, "utf8");
    await database.exec(migration);
    await database.exec(`
      insert into public.community_group_messages (id, group_id, body)
      values (
        '66666666-6666-4666-8666-666666666666',
        'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a102',
        'new master post'
      );
      update public.community_groups
      set message_count = 1
      where id = 'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a102';
    `);
    await database.exec(migration);

    const groups = await database.query<{ name: string; member_count: number }>(
      "select name, member_count from public.community_groups",
    );
    expect(groups.rows).toEqual([
      { name: "Scholarships for Africa", member_count: 2 },
    ]);
    const members = await database.query<{ user_id: string; status: string }>(
      "select user_id, status from public.community_group_members order by user_id",
    );
    expect(members.rows).toEqual([
      { user_id: "user_active", status: "active" },
      { user_id: "user_banned", status: "banned" },
      { user_id: "user_existing", status: "active" },
    ]);
    expect(
      (await database.query("select 1 from public.community_group_messages"))
        .rows,
    ).toHaveLength(1);
    expect(
      (await database.query("select 1 from public.community_reports")).rows,
    ).toHaveLength(0);
    expect(
      (
        await database.query<{ status: string }>(
          "select status from public.community_creation_requests",
        )
      ).rows[0].status,
    ).toBe("cancelled");
    await database.close();
  }, 15_000);
});
