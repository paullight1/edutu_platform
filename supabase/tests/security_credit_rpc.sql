begin;

select plan(8);

select is(
  exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = 'public.spend_credits(text, integer, text, text, text)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  false,
  'PUBLIC cannot execute public.spend_credits(text, integer, text, text, text)'
);

select is(
  has_function_privilege(
    'anon',
    'public.spend_credits(text, integer, text, text, text)'::regprocedure,
    'execute'
  ),
  false,
  'anon cannot execute public.spend_credits(text, integer, text, text, text)'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.spend_credits(text, integer, text, text, text)'::regprocedure,
    'execute'
  ),
  false,
  'authenticated cannot execute public.spend_credits(text, integer, text, text, text)'
);

select is(
  exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = 'public.add_credits(text, integer, text, text, text)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  false,
  'PUBLIC cannot execute public.add_credits(text, integer, text, text, text)'
);

select is(
  has_function_privilege(
    'anon',
    'public.add_credits(text, integer, text, text, text)'::regprocedure,
    'execute'
  ),
  false,
  'anon cannot execute public.add_credits(text, integer, text, text, text)'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.add_credits(text, integer, text, text, text)'::regprocedure,
    'execute'
  ),
  false,
  'authenticated cannot execute public.add_credits(text, integer, text, text, text)'
);

select is(
  has_function_privilege(
    'service_role',
    'public.spend_credits(text, integer, text, text, text)'::regprocedure,
    'execute'
  ),
  true,
  'service_role retains the temporary cutover execute grant for public.spend_credits'
);

select is(
  has_function_privilege(
    'service_role',
    'public.add_credits(text, integer, text, text, text)'::regprocedure,
    'execute'
  ),
  true,
  'service_role retains the temporary cutover execute grant for public.add_credits'
);

select * from finish();

rollback;
