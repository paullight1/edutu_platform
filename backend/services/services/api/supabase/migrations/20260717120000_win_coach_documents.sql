-- Win-Coach: user-provided documents + which documents were submitted to which
-- application. opportunity_applications has no doc columns today, and ai_documents
-- only holds AI-generated drafts (jsonb), so both of these are new.

create table if not exists public.user_uploads (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null,
  kind           text not null default 'other',      -- cv | transcript | essay | other
  file_name      text not null,
  storage_path   text not null,                       -- path within the 'cv-files' bucket
  mime_type      text not null,
  size           integer not null default 0,
  extracted_text text,
  parse_status   text not null default 'pending',     -- pending | done | failed
  parse_error    text,
  opportunity_id uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists user_uploads_user_idx
  on public.user_uploads (user_id, created_at desc);

create table if not exists public.application_documents (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.opportunity_applications (id) on delete cascade,
  user_id        text not null,
  document_id    uuid references public.ai_documents (id) on delete set null,
  upload_id      uuid references public.user_uploads (id) on delete set null,
  role           text not null default 'other',       -- cv | sop | transcript | other
  status         text not null default 'missing',     -- missing | draft | submitted
  submitted_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists application_documents_app_idx
  on public.application_documents (application_id);
create index if not exists application_documents_user_idx
  on public.application_documents (user_id);

alter table public.user_uploads enable row level security;
alter table public.application_documents enable row level security;

-- The backend uses the service-role key (bypasses RLS); these policies exist so
-- a future direct-from-client read stays owner-scoped. auth.jwt()->>'sub' is the
-- Clerk id, matching the text user_id convention used across the schema.
drop policy if exists user_uploads_owner on public.user_uploads;
create policy user_uploads_owner on public.user_uploads
  for all using (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

drop policy if exists application_documents_owner on public.application_documents;
create policy application_documents_owner on public.application_documents
  for all using (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

grant select, insert, update, delete on public.user_uploads to authenticated, service_role;
grant select, insert, update, delete on public.application_documents to authenticated, service_role;
