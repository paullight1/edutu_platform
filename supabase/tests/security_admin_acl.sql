begin;

select plan(72);

select is(
  (
    select c.relrowsecurity
    from pg_class c
    where c.oid = to_regclass(target.table_name)
  ),
  true,
  format('%s has row level security enabled', target.table_name)
)
from (
  values
    ('public.scraping_sources'),
    ('public.scrape_logs'),
    ('public.notification_queue')
) as target(table_name);

select is(
  has_table_privilege(test_case.role_name, test_case.table_name, test_case.privilege_name),
  false,
  format(
    '%s cannot %s %s',
    test_case.role_name,
    lower(test_case.privilege_name),
    test_case.table_name
  )
)
from (
  values
    ('anon', 'public.scraping_sources', 'SELECT'),
    ('anon', 'public.scraping_sources', 'INSERT'),
    ('anon', 'public.scraping_sources', 'UPDATE'),
    ('anon', 'public.scraping_sources', 'DELETE'),
    ('anon', 'public.scrape_logs', 'SELECT'),
    ('anon', 'public.scrape_logs', 'INSERT'),
    ('anon', 'public.scrape_logs', 'UPDATE'),
    ('anon', 'public.scrape_logs', 'DELETE'),
    ('anon', 'public.notification_queue', 'SELECT'),
    ('anon', 'public.notification_queue', 'INSERT'),
    ('anon', 'public.notification_queue', 'UPDATE'),
    ('anon', 'public.notification_queue', 'DELETE'),
    ('authenticated', 'public.scraping_sources', 'SELECT'),
    ('authenticated', 'public.scraping_sources', 'INSERT'),
    ('authenticated', 'public.scraping_sources', 'UPDATE'),
    ('authenticated', 'public.scraping_sources', 'DELETE'),
    ('authenticated', 'public.scrape_logs', 'SELECT'),
    ('authenticated', 'public.scrape_logs', 'INSERT'),
    ('authenticated', 'public.scrape_logs', 'UPDATE'),
    ('authenticated', 'public.scrape_logs', 'DELETE'),
    ('authenticated', 'public.notification_queue', 'SELECT'),
    ('authenticated', 'public.notification_queue', 'INSERT'),
    ('authenticated', 'public.notification_queue', 'UPDATE'),
    ('authenticated', 'public.notification_queue', 'DELETE')
) as test_case(role_name, table_name, privilege_name);

select is(
  has_table_privilege('service_role', test_case.table_name, test_case.privilege_name),
  true,
  format(
    'service_role can %s %s',
    lower(test_case.privilege_name),
    test_case.table_name
  )
)
from (
  values
    ('public.scraping_sources', 'SELECT'),
    ('public.scraping_sources', 'INSERT'),
    ('public.scraping_sources', 'UPDATE'),
    ('public.scraping_sources', 'DELETE'),
    ('public.scrape_logs', 'SELECT'),
    ('public.scrape_logs', 'INSERT'),
    ('public.scrape_logs', 'UPDATE'),
    ('public.scrape_logs', 'DELETE'),
    ('public.notification_queue', 'SELECT'),
    ('public.notification_queue', 'INSERT'),
    ('public.notification_queue', 'UPDATE'),
    ('public.notification_queue', 'DELETE')
) as test_case(table_name, privilege_name);

select is(
  exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) as acl
    where p.oid = to_regprocedure(target.function_name)
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  false,
  format('PUBLIC cannot execute %s', target.function_name)
)
from (
  values
    ('public.count_opportunities_by_source()'),
    ('public.opportunity_admin_stats()'),
    ('public.get_signup_trends(integer)'),
    ('public.get_opportunity_performance(integer)'),
    ('public.get_support_metrics(integer)'),
    ('public.generate_user_recommendations(uuid)')
) as target(function_name);

select is(
  has_function_privilege(
    test_case.role_name,
    to_regprocedure(test_case.function_name),
    'execute'
  ),
  false,
  format('%s cannot execute %s', test_case.role_name, test_case.function_name)
)
from (
  values
    ('anon', 'public.count_opportunities_by_source()'),
    ('anon', 'public.opportunity_admin_stats()'),
    ('anon', 'public.get_signup_trends(integer)'),
    ('anon', 'public.get_opportunity_performance(integer)'),
    ('anon', 'public.get_support_metrics(integer)'),
    ('anon', 'public.generate_user_recommendations(uuid)'),
    ('authenticated', 'public.count_opportunities_by_source()'),
    ('authenticated', 'public.opportunity_admin_stats()'),
    ('authenticated', 'public.get_signup_trends(integer)'),
    ('authenticated', 'public.get_opportunity_performance(integer)'),
    ('authenticated', 'public.get_support_metrics(integer)'),
    ('authenticated', 'public.generate_user_recommendations(uuid)')
) as test_case(role_name, function_name);

select is(
  has_function_privilege(
    'service_role',
    to_regprocedure(target.function_name),
    'execute'
  ),
  true,
  format('service_role can execute %s', target.function_name)
)
from (
  values
    ('public.count_opportunities_by_source()'),
    ('public.opportunity_admin_stats()'),
    ('public.get_signup_trends(integer)'),
    ('public.get_opportunity_performance(integer)'),
    ('public.get_support_metrics(integer)'),
    ('public.generate_user_recommendations(uuid)')
) as target(function_name);

select ok(
  exists (
    select 1
    from pg_proc p
    where p.oid = to_regprocedure(target.function_name)
      and p.prosecdef
      and p.proconfig @> array['search_path=""']::text[]
  ),
  format('%s is SECURITY DEFINER with an empty search_path', target.function_name)
)
from (
  values
    ('public.count_opportunities_by_source()'),
    ('public.opportunity_admin_stats()'),
    ('public.get_signup_trends(integer)'),
    ('public.get_opportunity_performance(integer)'),
    ('public.get_support_metrics(integer)'),
    ('public.generate_user_recommendations(uuid)')
) as target(function_name);

select ok(
  (
    select count(*) = 1
      and bool_and(
        p.polcmd = '*'
        and p.polroles = array[
          (select r.oid from pg_roles r where r.rolname = 'service_role')
        ]::oid[]
        and pg_get_expr(p.polqual, p.polrelid) = 'true'
        and pg_get_expr(p.polwithcheck, p.polrelid) = 'true'
      )
    from pg_policy p
    where p.polrelid = to_regclass(target.table_name)
  ),
  format('%s has only one explicit service_role management policy', target.table_name)
)
from (
  values
    ('public.scraping_sources'),
    ('public.scrape_logs'),
    ('public.notification_queue')
) as target(table_name);

select * from finish();

rollback;
