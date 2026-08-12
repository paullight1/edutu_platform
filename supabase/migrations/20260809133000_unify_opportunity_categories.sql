-- The mobile discovery surface and the classifier now share one eight-category
-- vocabulary. Normalize legacy labels before replacing the old constraint so
-- existing rows remain valid and searchable.
update public.opportunities
set
  category = case canonical_category
    when 'careers' then 'Internships'
    when 'jobs' then 'Internships'
    when 'leadership' then 'Fellowships'
    when 'global_programs' then 'Programs'
    when 'competitions' then 'Programs'
    when 'training_conferences' then 'Events'
    else category
  end,
  canonical_category = case canonical_category
    when 'careers' then 'internships'
    when 'jobs' then 'internships'
    when 'leadership' then 'fellowships'
    when 'global_programs' then 'programs'
    when 'competitions' then 'programs'
    when 'training_conferences' then 'events'
    else canonical_category
  end
where canonical_category in (
  'careers',
  'jobs',
  'leadership',
  'global_programs',
  'competitions',
  'training_conferences'
);

alter table public.opportunities
  drop constraint if exists opportunities_canonical_category_check;

alter table public.opportunities
  add constraint opportunities_canonical_category_check
  check (
    canonical_category = any (array[
      'scholarships'::text,
      'internships'::text,
      'programs'::text,
      'fellowships'::text,
      'grants'::text,
      'graduate_programs'::text,
      'bootcamps'::text,
      'events'::text,
      'other'::text
    ])
  );
