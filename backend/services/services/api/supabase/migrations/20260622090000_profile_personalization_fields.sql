alter table if exists public.profiles
  add column if not exists age integer,
  add column if not exists school text,
  add column if not exists country text,
  add column if not exists major text,
  add column if not exists degree text,
  add column if not exists cgpa numeric,
  add column if not exists grad_year integer,
  add column if not exists preferences jsonb not null default '{}'::jsonb,
  add column if not exists date_of_birth date,
  add column if not exists interested_countries text[],
  add column if not exists interests text[];

grant insert (
  age,
  school,
  country,
  major,
  degree,
  cgpa,
  grad_year,
  preferences,
  date_of_birth,
  interested_countries,
  interests
) on table public.profiles to authenticated;

grant update (
  age,
  school,
  country,
  major,
  degree,
  cgpa,
  grad_year,
  preferences,
  date_of_birth,
  interested_countries,
  interests
) on table public.profiles to authenticated;

grant insert, update, delete, truncate on table public.profiles to service_role;
