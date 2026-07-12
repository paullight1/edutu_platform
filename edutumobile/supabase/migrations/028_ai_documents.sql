-- AI-authored documents (CVs, SOPs, cover letters, essays) created and edited
-- through the Edutu Coach chat. Backend service-role only; exports land in the
-- private 'ai-documents' storage bucket and are served via signed URLs.
-- (Applied live via Supabase MCP on 2026-07-12 as create_ai_documents.)

create table if not exists public.ai_documents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  type text not null check (type in ('cv','sop','cover_letter','essay')),
  title text not null,
  content jsonb not null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  version integer not null default 1,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_documents_user on public.ai_documents (user_id, updated_at desc);

alter table public.ai_documents enable row level security;

insert into storage.buckets (id, name, public)
values ('ai-documents', 'ai-documents', false)
on conflict (id) do nothing;
