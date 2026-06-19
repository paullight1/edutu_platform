-- Backend-owned member settings for privacy/security controls.

alter table if exists public.profiles
  add column if not exists settings jsonb not null default '{}'::jsonb;
