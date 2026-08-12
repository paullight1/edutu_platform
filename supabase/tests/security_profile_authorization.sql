begin;

select plan(15);

select is(
  has_column_privilege('anon', 'public.profiles', 'role', 'INSERT'),
  false,
  'anon cannot insert the server-owned profile role'
);

select is(
  has_column_privilege('anon', 'public.profiles', 'role', 'UPDATE'),
  false,
  'anon cannot update the server-owned profile role'
);

select is(
  has_column_privilege('authenticated', 'public.profiles', 'role', 'INSERT'),
  false,
  'authenticated users cannot insert the server-owned profile role'
);

select is(
  has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE'),
  false,
  'authenticated users cannot update the server-owned profile role'
);

select is(
  has_column_privilege('service_role', 'public.profiles', 'role', 'INSERT'),
  true,
  'service_role can insert the server-owned profile role'
);

select is(
  has_column_privilege('service_role', 'public.profiles', 'role', 'UPDATE'),
  true,
  'service_role can update the server-owned profile role'
);

select is(
  has_column_privilege('authenticated', 'public.profiles', 'preferences', 'UPDATE'),
  true,
  'authenticated users retain permitted profile preference updates'
);

select ok(
  exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.profiles'::regclass
      and t.tgname = 'profiles_reject_client_authorization_metadata'
      and not t.tgisinternal
  ),
  'profiles reject client authorization metadata through a table trigger'
);

select is(
  (
    select t.tgenabled
    from pg_trigger t
    where t.tgrelid = 'public.profiles'::regclass
      and t.tgname = 'profiles_reject_client_authorization_metadata'
      and not t.tgisinternal
  ),
  'O',
  'the profile authorization trigger is enabled for authenticated writes'
);

select is(
  (
    select p.prosecdef
    from pg_proc p
    where p.oid = 'public.profiles_reject_client_authorization_metadata()'::regprocedure
  ),
  false,
  'the profile authorization trigger function runs as its caller'
);

create temporary table profile_authorization_probe (
  preferences jsonb not null default '{}'::jsonb
);

create trigger profiles_reject_client_authorization_metadata
before insert or update of preferences on profile_authorization_probe
for each row
execute function public.profiles_reject_client_authorization_metadata();

grant select, insert, update on profile_authorization_probe to authenticated;

insert into profile_authorization_probe (preferences)
values ('{"home_categories":["scholarships"]}'::jsonb);

set local role authenticated;

select throws_ok(
  $$
    update profile_authorization_probe
    set preferences = '{"role":"admin"}'::jsonb
  $$,
  '42501',
  'Profile authorization metadata is managed by the server',
  'a regular profile update with preferences.role = admin is denied'
);

select lives_ok(
  $$
    update profile_authorization_probe
    set preferences = '{"home_categories":["fellowships"]}'::jsonb
  $$,
  'a regular profile update with permitted preferences succeeds'
);

reset role;

select is(
  exists (
    select 1
    from pg_policy p
    where p.polrelid = 'public.profiles'::regclass
      and (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~* 'preferences[^\\n]*role'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~* 'preferences[^\\n]*role'
      )
  ),
  false,
  'no profile policy derives authorization from preferences.role'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.opportunity_admin_stats()'::regprocedure,
    'EXECUTE'
  ),
  false,
  'a regular user cannot execute the admin analytics function'
);

select is(
  exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm')
      and c.relname ~* '(cv|resume)'
      and has_table_privilege('authenticated', c.oid, 'SELECT')
  ),
  false,
  'a regular user cannot read any canonical public CV or resume relation'
);

select * from finish();

rollback;
