create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  summary text,
  description text,
  starts_at timestamp not null,
  ends_at timestamp,
  timezone text default 'UTC',
  location text,
  is_online boolean default true,
  cta_label text default 'Join event',
  cta_url text,
  image_url text,
  status text default 'draft',
  audience text default 'public',
  capacity integer,
  created_by text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create index if not exists idx_events_status on public.events(status);
create index if not exists idx_events_starts_at on public.events(starts_at);
create index if not exists idx_events_updated_at on public.events(updated_at);
create unique index if not exists idx_events_slug_unique on public.events(slug);

alter table public.events enable row level security;

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id text,
  name text,
  email text,
  status text default 'registered',
  source text default 'web',
  metadata jsonb default '{}'::jsonb,
  created_at timestamp default now()
);

create index if not exists idx_event_registrations_event_id on public.event_registrations(event_id);
create index if not exists idx_event_registrations_user_id on public.event_registrations(user_id);
create index if not exists idx_event_registrations_email on public.event_registrations(email);

alter table public.event_registrations enable row level security;
