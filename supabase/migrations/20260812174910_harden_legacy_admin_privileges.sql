begin;

alter table public.scraping_sources enable row level security;
alter table public.scraped_urls enable row level security;
alter table public.scrape_logs enable row level security;
alter table public.scraper_config enable row level security;
alter table public.notification_queue enable row level security;

drop policy if exists "Enable read access for authenticated users"
  on public.scraping_sources;
drop policy if exists "Enable all for service role"
  on public.scraping_sources;
drop policy if exists "service role manages scraper sources"
  on public.scraping_sources;

create policy "service role manages scraper sources"
  on public.scraping_sources
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "service role manages scraped urls"
  on public.scraped_urls;

create policy "service role manages scraped urls"
  on public.scraped_urls
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Enable read access for authenticated users"
  on public.scrape_logs;
drop policy if exists "Enable all for service role"
  on public.scrape_logs;
drop policy if exists "service role manages scrape logs"
  on public.scrape_logs;

create policy "service role manages scrape logs"
  on public.scrape_logs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "service role manages scraper config"
  on public.scraper_config;

create policy "service role manages scraper config"
  on public.scraper_config
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role manages notification queue"
  on public.notification_queue;
drop policy if exists "Admins can view notification queue"
  on public.notification_queue;
drop policy if exists "service role manages notification queue"
  on public.notification_queue;

create policy "service role manages notification queue"
  on public.notification_queue
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table
  public.scraping_sources,
  public.scraped_urls,
  public.scrape_logs,
  public.scraper_config,
  public.notification_queue
from anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.scraping_sources,
  public.scraped_urls,
  public.scrape_logs,
  public.notification_queue
to service_role;

grant select, insert, update on table public.scraper_config
to service_role;

revoke all on sequence
  public.scraping_sources_id_seq,
  public.scraper_config_id_seq
from public, anon, authenticated, service_role;

grant usage on sequence
  public.scraping_sources_id_seq,
  public.scraper_config_id_seq
to service_role;

create or replace function public.count_opportunities_by_source()
returns table(source text, count bigint)
language sql
security definer
set search_path = ''
as $$
  select
    coalesce(o.source, 'manual') as source,
    count(*)::bigint as count
  from public.opportunities as o
  group by o.source
  order by count desc;
$$;

create or replace function public.opportunity_admin_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total', count(*)::int,
    'active', count(*) filter (
      where o.status = 'active'
        and (o.close_date is null or o.close_date >= current_date)
    )::int,
    'expired', count(*) filter (
      where o.status = 'closed'
         or (o.close_date is not null and o.close_date < current_date)
    )::int,
    'missingDeadline', count(*) filter (
      where o.close_date is null and o.deadline is null
    )::int,
    'featured', count(*) filter (where o.is_featured = true)::int,
    'needsReview', count(*) filter (
      where o.status = 'pending_review'
         or (
           coalesce(o.metadata->>'needs_review', 'false') = 'true'
           and o.status not in ('active', 'rejected', 'closed')
         )
    )::int,
    'expiringSoon', count(*) filter (
      where o.close_date is not null
        and o.close_date >= current_date
        and o.close_date <= current_date + interval '7 days'
    )::int
  )
  from public.opportunities as o;
$$;

create or replace function public.get_signup_trends(days_back integer default 30)
returns table (
  signup_date date,
  signup_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    p.created_at::date as signup_date,
    count(*) as signup_count
  from public.profiles as p
  where p.created_at >= current_date - days_back
  group by p.created_at::date
  order by p.created_at::date;
end;
$$;

create or replace function public.get_opportunity_performance(
  days_back integer default 30
)
returns table (
  opportunity_id uuid,
  title text,
  category text,
  view_count bigint,
  apply_count bigint,
  bookmark_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    o.id as opportunity_id,
    o.title,
    o.category,
    count(*) filter (where oc.click_type = 'view') as view_count,
    count(*) filter (where oc.click_type = 'apply') as apply_count,
    count(*) filter (where oc.click_type = 'bookmark') as bookmark_count
  from public.opportunities as o
  left join public.opportunity_clicks as oc
    on o.id = oc.opportunity_id
   and oc.created_at >= current_date - days_back
  group by o.id, o.title, o.category
  order by count(*) filter (where oc.click_type = 'view') desc;
end;
$$;

create or replace function public.get_support_metrics(days_back integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'total_tickets', count(*),
    'open_tickets', count(*) filter (
      where st.status in ('open', 'in_progress')
    ),
    'resolved_tickets', count(*) filter (where st.status = 'resolved'),
    'avg_resolution_hours', coalesce(
      avg(extract(epoch from (st.updated_at - st.created_at)) / 3600)
        filter (where st.status = 'resolved'),
      0
    ),
    'by_category', (
      select jsonb_object_agg(category_counts.category, category_counts.cnt)
      from (
        select category_source.category, count(*) as cnt
        from public.support_tickets as category_source
        where category_source.created_at >= current_date - days_back
        group by category_source.category
      ) as category_counts
    ),
    'by_priority', (
      select jsonb_object_agg(priority_counts.priority, priority_counts.cnt)
      from (
        select priority_source.priority, count(*) as cnt
        from public.support_tickets as priority_source
        where priority_source.created_at >= current_date - days_back
        group by priority_source.priority
      ) as priority_counts
    )
  )
  into result
  from public.support_tickets as st
  where st.created_at >= current_date - days_back;

  return result;
end;
$$;

create or replace function public.generate_user_recommendations(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_prefs public.user_personalization%rowtype;
  opp record;
  match_score numeric;
  reasons jsonb;
begin
  select up.*
  into user_prefs
  from public.user_personalization as up
  where up.user_id = p_user_id;

  if not found then
    return;
  end if;

  delete from public.user_opportunity_recommendations as recommendation
  where recommendation.user_id = p_user_id
    and recommendation.expires_at < now();

  for opp in
    select o.*
    from public.opportunities as o
    where o.close_date is null or o.close_date > current_date
  loop
    match_score := 0;
    reasons := '[]'::jsonb;

    if opp.category = any(user_prefs.preferred_categories) then
      match_score := match_score + 30;
      reasons := reasons || jsonb_build_object(
        'type', 'category', 'weight', 30
      );
    end if;

    if opp.tags && user_prefs.interests then
      match_score := match_score + 25;
      reasons := reasons || jsonb_build_object(
        'type', 'interests', 'weight', 25
      );
    end if;

    if opp.is_remote
      or opp.location = any(user_prefs.preferred_locations)
    then
      match_score := match_score + 15;
      reasons := reasons || jsonb_build_object(
        'type', 'location', 'weight', 15
      );
    end if;

    if match_score >= 20 then
      insert into public.user_opportunity_recommendations (
        user_id,
        opportunity_id,
        match_score,
        match_reasons
      )
      values (p_user_id, opp.id, match_score, reasons)
      on conflict (user_id, opportunity_id) do update
      set match_score = excluded.match_score,
          match_reasons = excluded.match_reasons,
          generated_at = now(),
          expires_at = now() + interval '7 days';
    end if;
  end loop;
end;
$$;

-- CREATE OR REPLACE preserves existing ACL entries. Enforce an explicit
-- allowlist across only these six functions by removing every direct EXECUTE
-- grant except the owner's implicit/direct access and service_role. CASCADE is
-- intentional: a grant delegated by an unexpected grantee is unauthorized too.
do $$
declare
  acl_row record;
begin
  for acl_row in
    select distinct
      p.oid::regprocedure as function_identity,
      acl.grantee,
      grantee_role.rolname as grantee_name
    from pg_proc as p
    join pg_namespace as n
      on n.oid = p.pronamespace
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) as acl
    left join pg_roles as grantee_role
      on grantee_role.oid = acl.grantee
    where n.nspname = 'public'
      and p.oid in (
        'public.count_opportunities_by_source()'::regprocedure,
        'public.opportunity_admin_stats()'::regprocedure,
        'public.get_signup_trends(integer)'::regprocedure,
        'public.get_opportunity_performance(integer)'::regprocedure,
        'public.get_support_metrics(integer)'::regprocedure,
        'public.generate_user_recommendations(uuid)'::regprocedure
      )
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee <> p.proowner
      and acl.grantee <> (
        select r.oid
        from pg_roles as r
        where r.rolname = 'service_role'
      )
  loop
    execute format(
      'revoke execute on function %s from %s cascade',
      acl_row.function_identity,
      case
        when acl_row.grantee = 0 then 'public'
        else format('%I', acl_row.grantee_name)
      end
    );
  end loop;
end;
$$;

grant execute on function public.count_opportunities_by_source()
to service_role;
grant execute on function public.opportunity_admin_stats()
to service_role;
grant execute on function public.get_signup_trends(integer)
to service_role;
grant execute on function public.get_opportunity_performance(integer)
to service_role;
grant execute on function public.get_support_metrics(integer)
to service_role;
grant execute on function public.generate_user_recommendations(uuid)
to service_role;

commit;
