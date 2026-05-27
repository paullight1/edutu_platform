alter table public.opportunities
  add column if not exists canonical_category text not null default 'other';

alter table public.opportunities
  drop constraint if exists opportunities_canonical_category_check;

alter table public.opportunities
  add constraint opportunities_canonical_category_check
  check (canonical_category in ('scholarships', 'careers', 'leadership', 'global_programs', 'other'));

create index if not exists opportunities_canonical_category_idx
  on public.opportunities (canonical_category);

update public.opportunities
set canonical_category = case
  when lower(coalesce(category, '') || ' ' || coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || array_to_string(coalesce(tags, '{}'::text[]), ' '))
    similar to '%(scholarship|scholar|grant|bursary|tuition|financial aid|fully funded|funding|stipend|award)%'
    then 'scholarships'
  when lower(coalesce(category, '') || ' ' || coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || array_to_string(coalesce(tags, '{}'::text[]), ' '))
    similar to '%(career|internship|intern|job|employment|vacancy|graduate trainee|trainee|apprenticeship)%'
    then 'careers'
  when lower(coalesce(category, '') || ' ' || coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || array_to_string(coalesce(tags, '{}'::text[]), ' '))
    similar to '%(leadership|leader|fellowship|fellow|mentorship|mentor|ambassador|volunteer|changemaker|civic|social impact)%'
    then 'leadership'
  when lower(coalesce(category, '') || ' ' || coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || array_to_string(coalesce(tags, '{}'::text[]), ' '))
    similar to '%(global|international|worldwide|abroad|exchange|conference|summit|bootcamp|accelerator|program|programme|remote)%'
    then 'global_programs'
  else canonical_category
end
where canonical_category = 'other';
