-- Community DM Realtime contract.
--
-- Writes remain owned by the NestJS API/service role. This migration changes
-- only CDC publication: authenticated clients still need the existing SELECT
-- RLS policy on community_dm_messages, which admits conversation participants
-- and withholds every other row.

do $$
begin
  if to_regclass('public.community_dm_messages') is null then
    raise exception
      'community_dm_messages must exist before enabling Community DM Realtime';
  end if;

  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'community_dm_messages'
  ) then
    alter publication supabase_realtime
      add table public.community_dm_messages;
  end if;
end
$$;
