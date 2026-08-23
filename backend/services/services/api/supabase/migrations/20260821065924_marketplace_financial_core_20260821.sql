alter table public.marketplace_listings
  add column if not exists seller_id uuid,
  add column if not exists type text default 'course',
  add column if not exists price integer default 0,
  add column if not exists image_url text,
  add column if not exists preview_url text,
  add column if not exists event_date timestamp,
  add column if not exists event_end_date timestamp,
  add column if not exists event_location text,
  add column if not exists capacity integer,
  add column if not exists tags text[] default '{}',
  add column if not exists rating integer default 0,
  add column if not exists review_count integer default 0,
  add column if not exists enrollment_count integer default 0,
  add column if not exists is_featured boolean default false;

update public.marketplace_listings
set seller_id = public.clerk_id_to_uuid(user_id)::uuid
where seller_id is null and user_id is not null;

update public.marketplace_listings
set category = coalesce(nullif(trim(category), ''), 'general');

alter table public.marketplace_listings
  alter column user_id drop not null,
  alter column description drop not null,
  alter column category set default 'general',
  alter column category set not null,
  alter column status set default 'pending';

do $$
begin
  if exists (
    select 1 from public.marketplace_listings where seller_id is null
  ) then
    raise exception 'marketplace_listings contains rows without a resolvable seller_id';
  end if;
end
$$;

alter table public.marketplace_listings
  alter column seller_id set not null;

alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_price_nonnegative,
  add constraint marketplace_listings_price_nonnegative check (price >= 0),
  drop constraint if exists marketplace_listings_capacity_positive,
  add constraint marketplace_listings_capacity_positive check (capacity is null or capacity > 0);

create index if not exists marketplace_listings_seller_idx
  on public.marketplace_listings (seller_id, created_at desc);
create index if not exists marketplace_listings_status_category_idx
  on public.marketplace_listings (status, category, created_at desc);
create index if not exists marketplace_listings_featured_idx
  on public.marketplace_listings (is_featured, status, created_at desc);

create table if not exists public.marketplace_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  status text not null default 'active',
  credits_spent integer not null default 0,
  enrolled_at timestamp not null default now(),
  completed_at timestamp,
  constraint marketplace_enrollments_credits_nonnegative check (credits_spent >= 0),
  constraint marketplace_enrollments_user_listing_unique unique (user_id, listing_id)
);

create index if not exists marketplace_enrollments_user_idx
  on public.marketplace_enrollments (user_id, enrolled_at desc);
create index if not exists marketplace_enrollments_listing_idx
  on public.marketplace_enrollments (listing_id, enrolled_at desc);
create index if not exists marketplace_enrollments_status_idx
  on public.marketplace_enrollments (status, enrolled_at desc);

alter table public.marketplace_listings enable row level security;
alter table public.marketplace_enrollments enable row level security;

drop policy if exists "Users manage own listings" on public.marketplace_listings;
revoke all privileges on table public.marketplace_listings from anon, authenticated;
grant select, insert, update, delete on table public.marketplace_listings to service_role;

revoke all privileges on table public.marketplace_enrollments from anon, authenticated;
grant select, insert, update, delete on table public.marketplace_enrollments to service_role;

drop policy if exists credit_transactions_insert on public.credit_transactions;
drop policy if exists credit_transactions_admin_write on public.credit_transactions;
drop policy if exists credit_transactions_admin_delete on public.credit_transactions;
revoke all privileges on table public.credit_transactions from anon, authenticated;
grant select on table public.credit_transactions to authenticated;
grant select, insert, update, delete on table public.credit_transactions to service_role;
