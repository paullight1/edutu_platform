-- Preserve the raw Clerk/Supabase auth subject as the canonical billing key.
-- Only deterministic legacy UUIDs and existing provider mappings are recorded;
-- ambiguous identities remain operator review cases.

begin;

create table if not exists public.billing_identity_aliases (
  id uuid primary key default gen_random_uuid(),
  canonical_user_id text not null,
  legacy_user_id uuid,
  provider text,
  environment text,
  provider_customer_id text,
  source text not null,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (legacy_user_id is not null or provider_customer_id is not null),
  check (
    provider_customer_id is null
    or (provider is not null and environment is not null)
  ),
  unique (canonical_user_id, legacy_user_id),
  unique (provider, environment, provider_customer_id),
  foreign key (provider) references public.billing_providers (provider),
  foreign key (environment) references public.billing_environments (environment)
);

create unique index if not exists billing_identity_aliases_legacy_uuid_unique
  on public.billing_identity_aliases (legacy_user_id)
  where legacy_user_id is not null;
create index if not exists billing_identity_aliases_canonical_user_idx
  on public.billing_identity_aliases (canonical_user_id);

-- This is an exact, deterministic legacy transform for already-existing raw
-- profile subjects. No contact attribute or provider payload participates.
do $$
begin
  if to_regclass('public.profiles') is not null
     and to_regprocedure('public.clerk_id_to_uuid(text)') is not null then
    execute $sql$
      insert into public.billing_identity_aliases
        (canonical_user_id, legacy_user_id, source)
      select
        p.user_id::text,
        public.clerk_id_to_uuid(p.user_id::text),
        'deterministic_clerk_uuid'
      from public.profiles p
      where p.user_id::text ~ '^user_'
      on conflict do nothing
    $sql$;
  end if;
end;
$$;

-- An existing provider-customer mapping is authoritative evidence of the
-- relationship. Mirror it without changing either source record.
insert into public.billing_identity_aliases (
  canonical_user_id,
  provider,
  environment,
  provider_customer_id,
  source
)
select
  user_id,
  provider,
  environment,
  provider_customer_id,
  'provider_customer_mapping'
from public.billing_provider_customers
on conflict (provider, environment, provider_customer_id) do nothing;

alter table public.billing_identity_aliases enable row level security;
revoke all on table public.billing_identity_aliases from public;
revoke all on table public.billing_identity_aliases from anon, authenticated;
grant select, insert, update, delete on table public.billing_identity_aliases
  to service_role;

commit;
