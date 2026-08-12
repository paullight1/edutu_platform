-- Authorization belongs to the server-owned profiles.role column (or verified
-- provider app metadata), never to a profile JSON document writable by users.
-- Keep ordinary preference writes available while rejecting authorization-shaped
-- keys from PostgREST's anon/authenticated roles.

begin;

-- Be explicit even though earlier profile-hardening migrations used a column
-- allowlist: later grants must never make role writable by a client role.
revoke insert (role), update (role)
on table public.profiles
from anon, authenticated;

grant insert (role), update (role)
on table public.profiles
to service_role;

-- Remove stale client-controlled authorization values before enforcing the
-- guard. This prevents a normal preference save from being blocked by an old
-- role/admin value copied back from the client.
update public.profiles
set preferences = preferences - array['role', 'admin', 'is_admin', 'isAdmin']
where preferences ?| array['role', 'admin', 'is_admin', 'isAdmin'];

create or replace function public.profiles_reject_client_authorization_metadata()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if current_user in ('anon', 'authenticated')
    and new.preferences ?| array['role', 'admin', 'is_admin', 'isAdmin'] then
    raise exception using
      errcode = '42501',
      message = 'Profile authorization metadata is managed by the server';
  end if;

  return new;
end;
$$;

revoke all on function public.profiles_reject_client_authorization_metadata()
from public;
grant execute on function public.profiles_reject_client_authorization_metadata()
to anon, authenticated, service_role;

drop trigger if exists profiles_reject_client_authorization_metadata
on public.profiles;
create trigger profiles_reject_client_authorization_metadata
before insert or update of preferences on public.profiles
for each row
execute function public.profiles_reject_client_authorization_metadata();

-- Client-facing admin policies must not trust a value under preferences. The
-- backend service role remains the authorization boundary for admin actions;
-- removing an old policy is therefore fail-closed for direct Data API calls.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select p.polname
    from pg_policy as p
    where p.polrelid = 'public.profiles'::regclass
      and (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~*
          $pattern$preferences\s*(->>|#>>)\s*'?((role)|(admin)|(is_admin)|(isAdmin))'?$pattern$
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~*
          $pattern$preferences\s*(->>|#>>)\s*'?((role)|(admin)|(is_admin)|(isAdmin))'?$pattern$
      )
  loop
    execute format('drop policy if exists %I on public.profiles', policy_row.polname);
  end loop;
end;
$$;

commit;
