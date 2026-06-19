-- CV records are owned by the Edutu application user id.
-- Clerk users are converted to deterministic UUIDs by the API, so this table
-- cannot require every owner id to exist in auth.users.
alter table if exists public.cv_records
  drop constraint if exists cv_records_user_id_fkey;

create index if not exists cv_records_user_idx
  on public.cv_records (user_id, uploaded_at desc);

drop policy if exists "Service role manages cv records" on public.cv_records;

create policy "Service role manages cv records"
  on public.cv_records
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
