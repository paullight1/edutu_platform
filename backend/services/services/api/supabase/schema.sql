-- Edutu Supabase Schema
-- Run this script in the Supabase SQL editor to create the required tables, functions, and policies.

-- ------------------------------------------------------------------
-- Extensions
-- ------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------
-- Utility helpers
-- ------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ------------------------------------------------------------------
-- Profiles & user metadata
-- ------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  email text,
  full_name text,
  age smallint,
  avatar_url text,
  bio text,
  preferences jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, email, full_name, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name'),
    now(),
    now()
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create trigger set_timestamp_profiles
before update on public.profiles
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles
  for select
  using (auth.uid() = user_id);

create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Goals
-- ------------------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  description text,
  category text,
  deadline date,
  progress numeric(5,2) not null default 0 check (progress >= 0 and progress <= 100),
  status text not null default 'active' check (status in ('active','completed','archived')),
  priority text check (priority in ('low','medium','high')),
  source text default 'custom' check (source in ('template','custom','imported')),
  template_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists goals_user_idx on public.goals (user_id);
create index if not exists goals_status_idx on public.goals (status);

create trigger set_timestamp_goals
before update on public.goals
for each row
execute function public.set_updated_at();

alter table public.goals enable row level security;

create policy "Users manage own goals"
  on public.goals
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.goal_progress_entries (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  progress numeric(5,2) not null check (progress >= 0 and progress <= 100),
  progress_delta numeric(5,2) not null default 0 check (progress_delta >= -100 and progress_delta <= 100),
  note text,
  source text not null default 'system' check (source in ('system','user','automation','import')),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.goal_progress_entries
  add column if not exists progress_delta numeric(5,2) not null default 0 check (progress_delta >= -100 and progress_delta <= 100),
  add column if not exists source text not null default 'system' check (source in ('system','user','automation','import')),
  add column if not exists context jsonb not null default '{}'::jsonb;

create index if not exists goal_progress_goal_idx on public.goal_progress_entries (goal_id);
create index if not exists goal_progress_user_idx on public.goal_progress_entries (user_id);
create index if not exists goal_progress_created_idx on public.goal_progress_entries (user_id, created_at desc);

create table if not exists public.goal_daily_metrics (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  metric_date date not null,
  goals_created integer not null default 0,
  goals_completed integer not null default 0,
  goals_archived integer not null default 0,
  active_goal_delta integer not null default 0,
  progress_updates integer not null default 0,
  progress_delta numeric(10,2) not null default 0,
  last_event_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, metric_date)
);

create index if not exists goal_daily_metrics_user_idx on public.goal_daily_metrics (user_id, metric_date desc);
create index if not exists goal_daily_metrics_date_idx on public.goal_daily_metrics (metric_date desc);

create trigger set_timestamp_goal_daily_metrics
before update on public.goal_daily_metrics
for each row
execute function public.set_updated_at();

alter table public.goal_daily_metrics enable row level security;

create policy "Users view own goal daily metrics"
  on public.goal_daily_metrics
  for select
  using (auth.uid() = user_id);

create policy "Service role manages goal daily metrics"
  on public.goal_daily_metrics
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.goal_progress_entries enable row level security;

create policy "Users manage own goal progress"
  on public.goal_progress_entries
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Analytics tables
-- ------------------------------------------------------------------
create table if not exists public.analytics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users on delete cascade,
  opportunities_explored integer not null default 0,
  chat_sessions integer not null default 0,
  goals_created integer not null default 0,
  goals_completed integer not null default 0,
  active_goals integer not null default 0,
  total_progress numeric(12,2) not null default 0,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  active_dates text[] not null default '{}'::text[],
  last_active_on date,
  last_event_at timestamptz,
  last_goal_completed_at timestamptz,
  last_opportunity_explored_at timestamptz,
  last_chat_session_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.analytics
  add column if not exists goals_created integer not null default 0,
  add column if not exists goals_completed integer not null default 0,
  add column if not exists active_goals integer not null default 0,
  add column if not exists total_progress numeric(12,2) not null default 0,
  add column if not exists current_streak integer not null default 0,
  add column if not exists longest_streak integer not null default 0,
  add column if not exists last_active_on date,
  add column if not exists last_event_at timestamptz,
  add column if not exists last_goal_completed_at timestamptz,
  add column if not exists last_opportunity_explored_at timestamptz,
  add column if not exists last_chat_session_at timestamptz;

create trigger set_timestamp_analytics
before update on public.analytics
for each row
execute function public.set_updated_at();

alter table public.analytics enable row level security;

create policy "Users manage own analytics"
  on public.analytics
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.analytics_events (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade,
  goal_id uuid references public.goals on delete cascade,
  event_name text not null,
  source text not null default 'system' check (source in ('system','user','automation','import')),
  context text,
  session_id uuid,
  event_properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.analytics_events
  add column if not exists goal_id uuid references public.goals on delete cascade,
  add column if not exists source text not null default 'system' check (source in ('system','user','automation','import')),
  add column if not exists context text,
  add column if not exists session_id uuid;

create index if not exists analytics_events_user_idx on public.analytics_events (user_id, occurred_at desc);
create index if not exists analytics_events_name_idx on public.analytics_events (event_name);
create index if not exists analytics_events_goal_idx on public.analytics_events (goal_id, occurred_at desc);

alter table public.analytics_events enable row level security;

create policy "Users read own analytics events"
  on public.analytics_events
  for select
  using (auth.uid() = user_id);

create policy "Service role writes analytics events"
  on public.analytics_events
  for insert
  with check (auth.role() = 'service_role');

create table if not exists public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_type text not null check (snapshot_type in ('users','opportunities','ai','goals','engagement')),
  timeframe text not null default '7d' check (timeframe in ('1d','7d','14d','30d','90d','all')),
  metrics jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  source text not null default 'system' check (source in ('system','user','automation','import')),
  created_by uuid references auth.users on delete set null,
  notes text
);

create index if not exists analytics_snapshots_lookup_idx on public.analytics_snapshots (snapshot_type, timeframe, generated_at desc);

alter table public.analytics_snapshots enable row level security;

create policy "Admins view analytics snapshots"
  on public.analytics_snapshots
  for select
  using (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and coalesce(p.preferences->>'role', '') = 'admin'
    )
  );

create policy "Service role manages analytics snapshots"
  on public.analytics_snapshots
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ------------------------------------------------------------------
-- Goal analytics helper functions & triggers
-- ------------------------------------------------------------------
create or replace function public.ensure_analytics_profile(p_user_id uuid)
returns public.analytics as $$
declare
  analytics_row public.analytics%rowtype;
begin
  insert into public.analytics (user_id)
  values (p_user_id)
  on conflict (user_id) do update
    set updated_at = now()
  returning * into analytics_row;

  return analytics_row;
end;
$$ language plpgsql;

create or replace function public.touch_analytics_activity(
  p_user_id uuid,
  p_event text,
  p_payload jsonb default '{}'::jsonb
) returns void as $$
declare
  analytics_row public.analytics%rowtype;
  today_text text := to_char(current_date, 'YYYY-MM-DD');
  merged_dates text[];
  last_seen date;
  next_streak integer;
begin
  analytics_row := public.ensure_analytics_profile(p_user_id);

  last_seen := analytics_row.last_active_on;

  if last_seen = current_date then
    next_streak := analytics_row.current_streak;
  elsif last_seen = current_date - 1 then
    next_streak := analytics_row.current_streak + 1;
  else
    next_streak := 1;
  end if;

  if analytics_row.active_dates is null or array_length(analytics_row.active_dates, 1) = 0 then
    merged_dates := array[today_text];
  elsif analytics_row.active_dates @> array[today_text] then
    merged_dates := analytics_row.active_dates;
  else
    merged_dates := (
      select array_agg(distinct value order by value)
      from unnest(analytics_row.active_dates || today_text) as value
    );
  end if;

  update public.analytics
  set
    active_dates = merged_dates,
    last_active_on = current_date,
    current_streak = next_streak,
    longest_streak = greatest(analytics_row.longest_streak, next_streak),
    last_event_at = now(),
    metadata = coalesce(analytics_row.metadata, '{}'::jsonb) || jsonb_build_object(
      'last_activity', p_event,
      'last_activity_payload', coalesce(p_payload, '{}'::jsonb)
    ),
    updated_at = now()
  where user_id = p_user_id;
end;
$$ language plpgsql;

create or replace function public.increment_goal_daily_metric(
  p_user_id uuid,
  p_metric_date date,
  p_goals_created integer default 0,
  p_goals_completed integer default 0,
  p_goals_archived integer default 0,
  p_active_goal_delta integer default 0,
  p_progress_updates integer default 0,
  p_progress_delta numeric default 0,
  p_metadata jsonb default '{}'::jsonb
) returns void as $$
begin
  insert into public.goal_daily_metrics (
    user_id,
    metric_date,
    goals_created,
    goals_completed,
    goals_archived,
    active_goal_delta,
    progress_updates,
    progress_delta,
    metadata,
    last_event_at
  )
  values (
    p_user_id,
    p_metric_date,
    p_goals_created,
    p_goals_completed,
    p_goals_archived,
    p_active_goal_delta,
    p_progress_updates,
    p_progress_delta,
    coalesce(p_metadata, '{}'::jsonb),
    now()
  )
  on conflict (user_id, metric_date) do update
    set goals_created = public.goal_daily_metrics.goals_created + excluded.goals_created,
        goals_completed = public.goal_daily_metrics.goals_completed + excluded.goals_completed,
        goals_archived = public.goal_daily_metrics.goals_archived + excluded.goals_archived,
        active_goal_delta = public.goal_daily_metrics.active_goal_delta + excluded.active_goal_delta,
        progress_updates = public.goal_daily_metrics.progress_updates + excluded.progress_updates,
        progress_delta = public.goal_daily_metrics.progress_delta + excluded.progress_delta,
        metadata = public.goal_daily_metrics.metadata || coalesce(excluded.metadata, '{}'::jsonb),
        last_event_at = now(),
        updated_at = now();
end;
$$ language plpgsql;

create or replace function public.handle_goal_insert()
returns trigger as $$
begin
  perform public.ensure_analytics_profile(new.user_id);

  update public.analytics
  set
    goals_created = goals_created + 1,
    active_goals = active_goals + 1,
    metadata = metadata || jsonb_build_object(
      'last_goal_created', jsonb_build_object(
        'goal_id', new.id,
        'title', new.title,
        'created_at', now()
      )
    )
  where user_id = new.user_id;

  perform public.touch_analytics_activity(
    new.user_id,
    'goal_created',
    jsonb_build_object(
      'goal_id', new.id,
      'status', new.status,
      'priority', new.priority,
      'category', new.category
    )
  );

  perform public.increment_goal_daily_metric(
    new.user_id,
    current_date,
    1,
    0,
    0,
    1,
    0,
    0,
    jsonb_build_object('goal_id', new.id)
  );

  insert into public.analytics_events (user_id, goal_id, event_name, source, event_properties)
  values (
    new.user_id,
    new.id,
    'goal_created',
    'system',
    jsonb_build_object(
      'status', new.status,
      'priority', new.priority,
      'category', new.category,
      'deadline', new.deadline
    )
  );

  return new;
end;
$$ language plpgsql;

create or replace function public.handle_goal_update()
returns trigger as $$
declare
  progress_change numeric(5,2);
  payload jsonb := jsonb_build_object('goal_id', new.id);
  touched boolean := false;
  previous_active integer := case when old.status = 'active' then 1 else 0 end;
  next_active integer := case when new.status = 'active' then 1 else 0 end;
  active_diff integer := next_active - previous_active;
begin
  perform public.ensure_analytics_profile(new.user_id);

  if new.progress is distinct from old.progress then
    progress_change := coalesce(new.progress, 0) - coalesce(old.progress, 0);

    insert into public.goal_progress_entries (
      goal_id,
      user_id,
      progress,
      progress_delta,
      note,
      source,
      context
    )
    values (
      new.id,
      new.user_id,
      new.progress,
      progress_change,
      'Auto capture from goal update',
      'system',
      jsonb_build_object('trigger', 'goal_update')
    );

    update public.analytics
    set total_progress = greatest(total_progress + progress_change, 0)
    where user_id = new.user_id;

    perform public.increment_goal_daily_metric(
      new.user_id,
      current_date,
      0,
      0,
      0,
      0,
      1,
      progress_change,
      jsonb_build_object('goal_id', new.id)
    );

    insert into public.analytics_events (user_id, goal_id, event_name, source, event_properties)
    values (
      new.user_id,
      new.id,
      'goal_progress_updated',
      'system',
      jsonb_build_object(
        'previous_progress', old.progress,
        'progress', new.progress,
        'progress_delta', progress_change
      )
    );

    payload := payload || jsonb_build_object(
      'progress', new.progress,
      'progress_delta', progress_change
    );
    touched := true;
  end if;

  if new.status is distinct from old.status then
    if active_diff <> 0 then
      update public.analytics
      set active_goals = greatest(active_goals + active_diff, 0)
      where user_id = new.user_id;
    end if;

    if new.status = 'completed' and old.status is distinct from 'completed' then
      update public.analytics
      set
        goals_completed = goals_completed + 1,
        last_goal_completed_at = now()
      where user_id = new.user_id;

      perform public.increment_goal_daily_metric(
        new.user_id,
        current_date,
        0,
        1,
        0,
        active_diff,
        0,
        0,
        jsonb_build_object('goal_id', new.id)
      );

      insert into public.analytics_events (user_id, goal_id, event_name, source, event_properties)
      values (
        new.user_id,
        new.id,
        'goal_completed',
        'system',
        jsonb_build_object(
          'previous_status', old.status,
          'status', new.status,
          'completed_at', coalesce(new.completed_at, now())
        )
      );
    elsif old.status = 'completed' and new.status <> 'completed' then
      update public.analytics
      set goals_completed = greatest(goals_completed - 1, 0)
      where user_id = new.user_id;

      perform public.increment_goal_daily_metric(
        new.user_id,
        current_date,
        0,
        -1,
        0,
        active_diff,
        0,
        0,
        jsonb_build_object('goal_id', new.id, 'reason', 'completion_reverted')
      );

      insert into public.analytics_events (user_id, goal_id, event_name, source, event_properties)
      values (
        new.user_id,
        new.id,
        'goal_completion_reverted',
        'system',
        jsonb_build_object(
          'previous_status', old.status,
          'status', new.status
        )
      );
    end if;

    if new.status = 'archived' and old.status <> 'archived' then
      perform public.increment_goal_daily_metric(
        new.user_id,
        current_date,
        0,
        0,
        1,
        active_diff,
        0,
        0,
        jsonb_build_object('goal_id', new.id)
      );

      insert into public.analytics_events (user_id, goal_id, event_name, source, event_properties)
      values (
        new.user_id,
        new.id,
        'goal_archived',
        'system',
        jsonb_build_object(
          'previous_status', old.status,
          'status', new.status
        )
      );
    elsif old.status = 'archived' and new.status <> 'archived' then
      perform public.increment_goal_daily_metric(
        new.user_id,
        current_date,
        0,
        0,
        -1,
        active_diff,
        0,
        0,
        jsonb_build_object('goal_id', new.id)
      );

      insert into public.analytics_events (user_id, goal_id, event_name, source, event_properties)
      values (
        new.user_id,
        new.id,
        'goal_unarchived',
        'system',
        jsonb_build_object(
          'previous_status', old.status,
          'status', new.status
        )
      );
    end if;

    payload := payload || jsonb_build_object(
      'status', new.status,
      'previous_status', old.status
    );
    touched := true;
  end if;

  if touched then
    perform public.touch_analytics_activity(
      new.user_id,
      'goal_updated',
      payload
    );
  end if;

  return new;
end;
$$ language plpgsql;

create or replace function public.handle_goal_delete()
returns trigger as $$
declare
  active_diff integer := case when old.status = 'active' then -1 else 0 end;
  payload jsonb := jsonb_build_object(
    'goal_id', old.id,
    'status', old.status
  );
begin
  perform public.ensure_analytics_profile(old.user_id);

  if active_diff <> 0 then
    update public.analytics
    set active_goals = greatest(active_goals + active_diff, 0)
    where user_id = old.user_id;
  end if;

  if old.status = 'completed' then
    update public.analytics
    set goals_completed = greatest(goals_completed - 1, 0)
    where user_id = old.user_id;
  end if;

  perform public.increment_goal_daily_metric(
    old.user_id,
    current_date,
    0,
    case when old.status = 'completed' then -1 else 0 end,
    1,
    active_diff,
    0,
    0,
    payload
  );

  insert into public.analytics_events (user_id, goal_id, event_name, source, event_properties)
  values (
    old.user_id,
    null,
    'goal_deleted',
    'system',
    payload
  );

  perform public.touch_analytics_activity(old.user_id, 'goal_deleted', payload);

  return old;
end;
$$ language plpgsql;

drop trigger if exists goals_after_insert on public.goals;
create trigger goals_after_insert
after insert on public.goals
for each row
execute function public.handle_goal_insert();

drop trigger if exists goals_after_update on public.goals;
create trigger goals_after_update
after update on public.goals
for each row
execute function public.handle_goal_update();

drop trigger if exists goals_after_delete on public.goals;
create trigger goals_after_delete
after delete on public.goals
for each row
execute function public.handle_goal_delete();

-- ------------------------------------------------------------------
-- AI chat
-- ------------------------------------------------------------------
create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create index if not exists chat_threads_user_idx on public.chat_threads (user_id, updated_at desc);

create trigger set_timestamp_chat_threads
before update on public.chat_threads
for each row
execute function public.set_updated_at();

alter table public.chat_threads enable row level security;

create policy "Users manage own chat threads"
  on public.chat_threads
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_thread_idx on public.chat_messages (thread_id, created_at);
create index if not exists chat_messages_user_idx on public.chat_messages (user_id);

alter table public.chat_messages enable row level security;

create policy "Users access own chat messages"
  on public.chat_messages
  using (
    auth.uid() = (select user_id from public.chat_threads where id = chat_messages.thread_id)
  )
  with check (
    auth.uid() = coalesce(user_id, (select user_id from public.chat_threads where id = chat_messages.thread_id))
  );

create table if not exists public.chat_usage (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  period_start date not null,
  period_end date not null,
  total_requests integer not null default 0,
  total_tokens integer not null default 0,
  billed_amount_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_usage_unique_period unique (user_id, period_start, period_end)
);

create trigger set_timestamp_chat_usage
before update on public.chat_usage
for each row
execute function public.set_updated_at();

alter table public.chat_usage enable row level security;

create policy "Users view own chat usage"
  on public.chat_usage
  for select
  using (auth.uid() = user_id);

create policy "Service role manages chat usage"
  on public.chat_usage
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ------------------------------------------------------------------
-- CV records & document intelligence
-- ------------------------------------------------------------------
create table if not exists public.cv_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  file_name text not null,
  file_size integer not null,
  mime_type text not null default 'application/octet-stream',
  text_content text not null,
  stats jsonb not null default '{}'::jsonb,
  job_target text,
  job_description text,
  analysis jsonb,
  optimization jsonb,
  generated boolean not null default false,
  storage_path text,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cv_records_user_idx on public.cv_records (user_id, uploaded_at desc);

create trigger set_timestamp_cv_records
before update on public.cv_records
for each row
execute function public.set_updated_at();

alter table public.cv_records enable row level security;

create policy "Users manage own cv records"
  on public.cv_records
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Admins view cv records"
  on public.cv_records
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and coalesce(p.preferences->>'role', '') = 'admin'
    )
  );

-- ------------------------------------------------------------------
-- CV storage bucket & policies
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cv-files',
  'cv-files',
  false,
  5 * 1024 * 1024, -- 5 MB per object
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'text/plain'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.cv_files_under_limit()
returns boolean
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  max_files integer := 3;
  current_count integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  select count(*)
  into current_count
  from storage.objects
  where bucket_id = 'cv-files'
    and owner = auth.uid();

  return current_count < max_files;
end;
$$;

grant execute on function public.cv_files_under_limit() to authenticated;

create policy "Users view own CV files"
  on storage.objects
  for select
  using (
    bucket_id = 'cv-files'
    and owner = auth.uid()
  );

create policy "Users upload CV files"
  on storage.objects
  for insert
  with check (
    bucket_id = 'cv-files'
    and owner = auth.uid()
    and public.cv_files_under_limit()
  );

create policy "Users remove own CV files"
  on storage.objects
  for delete
  using (
    bucket_id = 'cv-files'
    and owner = auth.uid()
  );

-- ------------------------------------------------------------------
-- Opportunities & personalization
-- ------------------------------------------------------------------
create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  description text,
  category text,
  organization text,
  location text,
  is_remote boolean not null default false,
  application_url text,
  tags text[] not null default '{}'::text[],
  eligibility jsonb not null default '{}'::jsonb,
  stipend numeric,
  currency text,
  open_date date,
  close_date date,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunities_category_idx on public.opportunities (category);
create index if not exists opportunities_tags_idx on public.opportunities using gin (tags);
create index if not exists opportunities_close_date_idx on public.opportunities (close_date);

create trigger set_timestamp_opportunities
before update on public.opportunities
for each row
execute function public.set_updated_at();

alter table public.opportunities enable row level security;

create policy "Public can read opportunities"
  on public.opportunities
  for select
  using (true);

create policy "Service role manages opportunities"
  on public.opportunities
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.opportunity_bookmarks (
  user_id uuid not null references auth.users on delete cascade,
  opportunity_id uuid not null references public.opportunities on delete cascade,
  saved_at timestamptz not null default now(),
  priority text check (priority in ('low','medium','high')),
  notes text,
  primary key (user_id, opportunity_id)
);

alter table public.opportunity_bookmarks enable row level security;

create policy "Users manage own opportunity bookmarks"
  on public.opportunity_bookmarks
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.opportunity_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  opportunity_id uuid not null references public.opportunities on delete cascade,
  status text not null default 'draft' check (status in ('draft','submitted','interview','offer','rejected','withdrawn')),
  submitted_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_unique_user_opportunity unique (user_id, opportunity_id)
);

create trigger set_timestamp_opportunity_applications
before update on public.opportunity_applications
for each row
execute function public.set_updated_at();

alter table public.opportunity_applications enable row level security;

create policy "Users manage own opportunity applications"
  on public.opportunity_applications
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Community & marketplace
-- ------------------------------------------------------------------
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text not null default 'discussion' check (type in ('discussion','roadmap','win','question','resource')),
  title text not null,
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}'::text[],
  visibility text not null default 'public' check (visibility in ('public','mentors','admins')),
  likes integer not null default 0,
  comments_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_posts_user_idx on public.community_posts (user_id, created_at desc);
create index if not exists community_posts_tags_idx on public.community_posts using gin (tags);

create trigger set_timestamp_community_posts
before update on public.community_posts
for each row
execute function public.set_updated_at();

alter table public.community_posts enable row level security;

create policy "Public can read community posts"
  on public.community_posts
  for select
  using (visibility = 'public' or auth.role() = 'service_role');

create policy "Users manage own community posts"
  on public.community_posts
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_comments_post_idx on public.community_comments (post_id, created_at);

create trigger set_timestamp_community_comments
before update on public.community_comments
for each row
execute function public.set_updated_at();

alter table public.community_comments enable row level security;

create policy "Users view comments on visible posts"
  on public.community_comments
  for select
  using (
    exists (
      select 1
      from public.community_posts p
      where p.id = community_comments.post_id
        and (p.visibility = 'public' or p.user_id = auth.uid() or auth.role() = 'service_role')
    )
  );

create policy "Users manage own comments"
  on public.community_comments
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.community_post_reactions (
  post_id uuid not null references public.community_posts on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  reaction text not null check (reaction in ('like','insightful','cheer','celebrate')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, reaction)
);

alter table public.community_post_reactions enable row level security;

create policy "Users manage own reactions"
  on public.community_post_reactions
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  description text not null,
  category text,
  skills text[] not null default '{}'::text[],
  price_range text,
  availability text,
  status text not null default 'active' check (status in ('active','paused','closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_listings_user_idx on public.marketplace_listings (user_id);

create trigger set_timestamp_marketplace_listings
before update on public.marketplace_listings
for each row
execute function public.set_updated_at();

alter table public.marketplace_listings enable row level security;

create policy "Users manage own listings"
  on public.marketplace_listings
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.marketplace_applications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings on delete cascade,
  applicant_id uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_timestamp_marketplace_applications
before update on public.marketplace_applications
for each row
execute function public.set_updated_at();

alter table public.marketplace_applications enable row level security;

create policy "Applicants manage own marketplace applications"
  on public.marketplace_applications
  using (auth.uid() = applicant_id)
  with check (auth.uid() = applicant_id);

-- ------------------------------------------------------------------
-- Support tickets
-- ------------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  category text not null,
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','waiting','resolved','closed')),
  subject text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_timestamp_support_tickets
before update on public.support_tickets
for each row
execute function public.set_updated_at();

alter table public.support_tickets enable row level security;

create policy "Users view own tickets"
  on public.support_tickets
  for select
  using (auth.uid() = user_id or auth.role() = 'service_role');

create policy "Users create own tickets"
  on public.support_tickets
  for insert
  with check (auth.uid() = user_id);

create policy "Users update own open tickets"
  on public.support_tickets
  for update
  using (auth.uid() = user_id and status in ('open','in_progress'))
  with check (auth.uid() = user_id);

create policy "Service role manages tickets"
  on public.support_tickets
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets on delete cascade,
  author_id uuid not null references auth.users on delete cascade,
  role text not null default 'user' check (role in ('user','agent','system')),
  message text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

alter table public.support_messages enable row level security;

create policy "Participants read ticket messages"
  on public.support_messages
  for select
  using (
    exists (
      select 1
      from public.support_tickets t
      where t.id = support_messages.ticket_id
        and (t.user_id = auth.uid() or auth.role() = 'service_role')
    )
  );

create policy "Users add ticket messages"
  on public.support_messages
  for insert
  with check (
    role = 'user'
    and author_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = support_messages.ticket_id
        and t.user_id = auth.uid()
    )
  );

create policy "Service role responds to tickets"
  on public.support_messages
  for insert
  with check (auth.role() = 'service_role');

-- ------------------------------------------------------------------
-- Notifications & system signals
-- ------------------------------------------------------------------
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  category text not null default 'general',
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_idx on public.user_notifications (user_id, created_at desc);

alter table public.user_notifications enable row level security;

create policy "Users manage own notifications"
  on public.user_notifications
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Service role sends notifications"
  on public.user_notifications
  for insert
  with check (auth.role() = 'service_role');

-- ------------------------------------------------------------------
-- Feature flags & admin helpers
-- ------------------------------------------------------------------
create table if not exists public.feature_flags (
  key text primary key,
  description text,
  rollout jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_timestamp_feature_flags
before update on public.feature_flags
for each row
execute function public.set_updated_at();

alter table public.feature_flags enable row level security;

create policy "Everyone can read feature flags"
  on public.feature_flags
  for select
  using (true);

create policy "Service role manages feature flags"
  on public.feature_flags
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ------------------------------------------------------------------
-- Notifications
-- ------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('goal-reminder','goal-weekly-digest','goal-progress','opportunity-highlight','admin-broadcast','system')),
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info','success','warning','critical')),
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  channel_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Users read own notifications"
  on public.notifications
  for select
  using (auth.uid() = user_id);

create policy "Users update own notifications"
  on public.notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users on delete cascade,
  push_notifications boolean not null default true,
  email_notifications boolean not null default false,
  opportunity_alerts boolean not null default true,
  deadline_reminders boolean not null default true,
  goal_reminders boolean not null default true,
  achievement_celebrations boolean not null default true,
  weekly_digest boolean not null default false,
  marketing_emails boolean not null default false,
  quiet_hours jsonb not null default jsonb_build_object('start','22:00','end','08:00'),
  updated_at timestamptz not null default now()
);

create trigger set_timestamp_notification_preferences
before update on public.notification_preferences
for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

create policy "Users manage own notification preferences"
  on public.notification_preferences
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.notification_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  provider text not null default 'fcm',
  token text not null,
  device jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists notification_push_tokens_user_idx on public.notification_push_tokens (user_id);

alter table public.notification_push_tokens enable row level security;

create policy "Users manage own push tokens"
  on public.notification_push_tokens
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Audit log for admin insights
-- ------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigserial primary key,
  actor_id uuid references auth.users on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id);

alter table public.audit_log enable row level security;

create policy "Service role writes audit log"
  on public.audit_log
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Admins can read audit log"
  on public.audit_log
  for select
  using (auth.role() = 'service_role');

-- ------------------------------------------------------------------
-- Done
-- ------------------------------------------------------------------
comment on schema public is 'Edutu application schema managed through Supabase SQL.';
