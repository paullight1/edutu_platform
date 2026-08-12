begin;

select plan(20);

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

set local role service_role;

insert into public.profiles (user_id, full_name, role, preferences)
values
  (
    '00000000-0000-4000-8000-000000000041',
    'Task 4 regular user',
    'user',
    '{"home_categories":["scholarships"]}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000042',
    'Task 4 administrator',
    'admin',
    '{}'::jsonb
  );

reset role;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000041',
  true
);

set local role authenticated;

select throws_ok(
  $$
    update public.profiles
    set preferences = '{"role":"admin"}'::jsonb
    where user_id = '00000000-0000-4000-8000-000000000041'
  $$,
  '42501',
  'Profile authorization metadata is managed by the server',
  'a regular user cannot add admin role metadata to their real profile'
);

select lives_ok(
  $$
    update public.profiles
    set preferences = '{"home_categories":["fellowships"]}'::jsonb
    where user_id = '00000000-0000-4000-8000-000000000041'
  $$,
  'a regular user can update permitted preferences on their real profile'
);

select lives_ok(
  $$
    update public.profiles
    set full_name = 'Cross-user profile tamper'
    where user_id = '00000000-0000-4000-8000-000000000042'
  $$,
  'a regular user cross-user update does not raise an administrative bypass'
);

reset role;

select is(
  (
    select role
    from public.profiles
    where user_id = '00000000-0000-4000-8000-000000000041'
  ),
  'user',
  'the regular user role remains server-owned after a rejected preference escalation'
);

select is(
  (
    select role
    from public.profiles
    where user_id = '00000000-0000-4000-8000-000000000042'
  ),
  'admin',
  'the administrator role persists independently of client preferences'
);

select is(
  (
    select full_name
    from public.profiles
    where user_id = '00000000-0000-4000-8000-000000000042'
  ),
  'Task 4 administrator',
  'a regular user cannot persist a cross-user profile update'
);

select is(
  exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname not in ('pg_catalog', 'information_schema')
      and (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~*
          'preferences[[:space:][:print:]]*(role|admin|is_admin|isadmin)'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~*
          'preferences[[:space:][:print:]]*(role|admin|is_admin|isadmin)'
      )
  ),
  false,
  'no exposed policy derives authorization from profiles preferences'
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

select ok(
  nullif(current_setting('app.task4_cv_relation', true), '') is not null
  and to_regclass(current_setting('app.task4_cv_relation', true)) is not null,
  'CV relation inventory input is required; set app.task4_cv_relation to the live relation before running this test'
);

select is(
  (
    select c.relrowsecurity
    from pg_class c
    where c.oid = to_regclass(current_setting('app.task4_cv_relation', true))
  ),
  true,
  'the inventoried CV relation has row level security enabled'
);

select * from finish();

rollback;
