begin;

select plan(110);

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
    ('public.scraped_urls'),
    ('public.scrape_logs'),
    ('public.scraper_config'),
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
    ('anon', 'public.scraped_urls', 'SELECT'),
    ('anon', 'public.scraped_urls', 'INSERT'),
    ('anon', 'public.scraped_urls', 'UPDATE'),
    ('anon', 'public.scraped_urls', 'DELETE'),
    ('anon', 'public.scrape_logs', 'SELECT'),
    ('anon', 'public.scrape_logs', 'INSERT'),
    ('anon', 'public.scrape_logs', 'UPDATE'),
    ('anon', 'public.scrape_logs', 'DELETE'),
    ('anon', 'public.scraper_config', 'SELECT'),
    ('anon', 'public.scraper_config', 'INSERT'),
    ('anon', 'public.scraper_config', 'UPDATE'),
    ('anon', 'public.scraper_config', 'DELETE'),
    ('anon', 'public.notification_queue', 'SELECT'),
    ('anon', 'public.notification_queue', 'INSERT'),
    ('anon', 'public.notification_queue', 'UPDATE'),
    ('anon', 'public.notification_queue', 'DELETE'),
    ('authenticated', 'public.scraping_sources', 'SELECT'),
    ('authenticated', 'public.scraping_sources', 'INSERT'),
    ('authenticated', 'public.scraping_sources', 'UPDATE'),
    ('authenticated', 'public.scraping_sources', 'DELETE'),
    ('authenticated', 'public.scraped_urls', 'SELECT'),
    ('authenticated', 'public.scraped_urls', 'INSERT'),
    ('authenticated', 'public.scraped_urls', 'UPDATE'),
    ('authenticated', 'public.scraped_urls', 'DELETE'),
    ('authenticated', 'public.scrape_logs', 'SELECT'),
    ('authenticated', 'public.scrape_logs', 'INSERT'),
    ('authenticated', 'public.scrape_logs', 'UPDATE'),
    ('authenticated', 'public.scrape_logs', 'DELETE'),
    ('authenticated', 'public.scraper_config', 'SELECT'),
    ('authenticated', 'public.scraper_config', 'INSERT'),
    ('authenticated', 'public.scraper_config', 'UPDATE'),
    ('authenticated', 'public.scraper_config', 'DELETE'),
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
    ('public.scraped_urls', 'SELECT'),
    ('public.scraped_urls', 'INSERT'),
    ('public.scraped_urls', 'UPDATE'),
    ('public.scraped_urls', 'DELETE'),
    ('public.scrape_logs', 'SELECT'),
    ('public.scrape_logs', 'INSERT'),
    ('public.scrape_logs', 'UPDATE'),
    ('public.scrape_logs', 'DELETE'),
    ('public.scraper_config', 'SELECT'),
    ('public.scraper_config', 'INSERT'),
    ('public.scraper_config', 'UPDATE'),
    ('public.notification_queue', 'SELECT'),
    ('public.notification_queue', 'INSERT'),
    ('public.notification_queue', 'UPDATE'),
    ('public.notification_queue', 'DELETE')
) as test_case(table_name, privilege_name);

select is(
  has_table_privilege('service_role', 'public.scraper_config', 'DELETE'),
  false,
  'service_role cannot delete public.scraper_config'
);

select is(
  has_sequence_privilege(
    test_case.role_name,
    test_case.sequence_name,
    'USAGE'
  ),
  false,
  format('%s cannot use %s', test_case.role_name, test_case.sequence_name)
)
from (
  values
    ('anon', 'public.scraping_sources_id_seq'),
    ('anon', 'public.scraper_config_id_seq'),
    ('authenticated', 'public.scraping_sources_id_seq'),
    ('authenticated', 'public.scraper_config_id_seq')
) as test_case(role_name, sequence_name);

select is(
  has_sequence_privilege(
    'service_role',
    target.sequence_name,
    'USAGE'
  ),
  true,
  format('service_role can use %s', target.sequence_name)
)
from (
  values
    ('public.scraping_sources_id_seq'),
    ('public.scraper_config_id_seq')
) as target(sequence_name);

select is(
  has_sequence_privilege(
    'service_role',
    test_case.sequence_name,
    test_case.privilege_name
  ),
  false,
  format(
    'service_role does not have unnecessary %s on %s',
    lower(test_case.privilege_name),
    test_case.sequence_name
  )
)
from (
  values
    ('public.scraping_sources_id_seq', 'SELECT'),
    ('public.scraping_sources_id_seq', 'UPDATE'),
    ('public.scraper_config_id_seq', 'SELECT'),
    ('public.scraper_config_id_seq', 'UPDATE')
) as test_case(sequence_name, privilege_name);

select is(
  exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) as acl
    where p.oid = to_regprocedure(target.function_name)
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee <> p.proowner
      and acl.grantee <> (
        select r.oid
        from pg_roles r
        where r.rolname = 'service_role'
      )
  ),
  false,
  format(
    'only the owner and service_role have direct execute ACLs on %s',
    target.function_name
  )
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
    ('public.scraped_urls'),
    ('public.scrape_logs'),
    ('public.scraper_config'),
    ('public.notification_queue')
) as target(table_name);

select * from finish();

rollback;
