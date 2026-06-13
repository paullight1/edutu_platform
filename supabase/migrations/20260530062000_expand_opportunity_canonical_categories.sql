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
      'jobs'::text,
      'competitions'::text,
      'careers'::text,
      'leadership'::text,
      'global_programs'::text,
      'other'::text
    ])
  );
