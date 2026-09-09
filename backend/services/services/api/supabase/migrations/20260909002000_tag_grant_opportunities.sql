-- Keep the Cresciva integration contract explicit for existing Edutu records.
-- New scraper writes already use this exact lowercase tag.
update public.opportunities
set tags = array_append(
  array(
    select tag
    from unnest(coalesce(opportunities.tags, '{}'::text[])) as tag
    where lower(tag) <> 'grants'
  ),
  'grants'
)
where canonical_category = 'grants'
  and not ('grants' = any(coalesce(tags, '{}'::text[])));
