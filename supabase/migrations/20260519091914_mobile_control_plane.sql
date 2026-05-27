-- Mobile control plane for Edu2Mobile campaigns, feature flags, and widget feeds.
-- Admin writes go through the NestJS API with the Supabase service role.

create extension if not exists "pgcrypto";

create table if not exists public.mobile_app_campaigns (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  body text,
  campaign_type text not null default 'popup',
  placement text not null default 'global',
  status text not null default 'draft',
  priority integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  audience jsonb not null default '{}'::jsonb,
  creative jsonb not null default '{}'::jsonb,
  frequency jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mobile_feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  enabled boolean not null default false,
  default_value jsonb not null default 'false'::jsonb,
  rollout jsonb not null default '{}'::jsonb,
  requires_pro boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.widget_feeds (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  feed_type text not null default 'opportunities',
  placement text not null default 'home',
  status text not null default 'draft',
  items jsonb not null default '[]'::jsonb,
  audience jsonb not null default '{}'::jsonb,
  priority integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mobile_campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.mobile_app_campaigns(id) on delete cascade,
  user_id text not null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_mobile_campaigns_status on public.mobile_app_campaigns(status);
create index if not exists idx_mobile_campaigns_placement on public.mobile_app_campaigns(placement);
create index if not exists idx_mobile_campaigns_priority on public.mobile_app_campaigns(priority);
create index if not exists idx_mobile_feature_flags_enabled on public.mobile_feature_flags(enabled);
create index if not exists idx_mobile_feature_flags_sort_order on public.mobile_feature_flags(sort_order);
create index if not exists idx_widget_feeds_status on public.widget_feeds(status);
create index if not exists idx_widget_feeds_placement on public.widget_feeds(placement);
create index if not exists idx_widget_feeds_priority on public.widget_feeds(priority);
create index if not exists idx_mobile_campaign_events_campaign_id on public.mobile_campaign_events(campaign_id);
create index if not exists idx_mobile_campaign_events_user_id on public.mobile_campaign_events(user_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp_mobile_app_campaigns on public.mobile_app_campaigns;
create trigger set_timestamp_mobile_app_campaigns
before update on public.mobile_app_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists set_timestamp_mobile_feature_flags on public.mobile_feature_flags;
create trigger set_timestamp_mobile_feature_flags
before update on public.mobile_feature_flags
for each row execute function public.set_updated_at();

drop trigger if exists set_timestamp_widget_feeds on public.widget_feeds;
create trigger set_timestamp_widget_feeds
before update on public.widget_feeds
for each row execute function public.set_updated_at();

alter table public.mobile_app_campaigns enable row level security;
alter table public.mobile_feature_flags enable row level security;
alter table public.widget_feeds enable row level security;
alter table public.mobile_campaign_events enable row level security;

grant select on public.mobile_app_campaigns to anon, authenticated;
grant select on public.mobile_feature_flags to anon, authenticated;
grant select on public.widget_feeds to anon, authenticated;
grant insert on public.mobile_campaign_events to authenticated;
grant select, insert, update, delete on public.mobile_app_campaigns to service_role;
grant select, insert, update, delete on public.mobile_feature_flags to service_role;
grant select, insert, update, delete on public.widget_feeds to service_role;
grant select, insert, update, delete on public.mobile_campaign_events to service_role;

drop policy if exists "Public clients can view active mobile campaigns" on public.mobile_app_campaigns;
create policy "Public clients can view active mobile campaigns"
  on public.mobile_app_campaigns
  for select
  to anon, authenticated
  using (
    status = 'active'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

drop policy if exists "Public clients can view enabled mobile feature flags" on public.mobile_feature_flags;
create policy "Public clients can view enabled mobile feature flags"
  on public.mobile_feature_flags
  for select
  to anon, authenticated
  using (enabled = true);

drop policy if exists "Public clients can view active widget feeds" on public.widget_feeds;
create policy "Public clients can view active widget feeds"
  on public.widget_feeds
  for select
  to anon, authenticated
  using (
    status = 'active'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

drop policy if exists "Users can insert their own mobile campaign events" on public.mobile_campaign_events;
create policy "Users can insert their own mobile campaign events"
  on public.mobile_campaign_events
  for insert
  to authenticated
  with check (auth.uid()::text = user_id);
