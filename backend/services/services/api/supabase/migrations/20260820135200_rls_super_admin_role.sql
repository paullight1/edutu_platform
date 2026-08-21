-- Align database RLS admin recognition with the platform role hierarchy.
-- super_admin is the highest privileged role and must satisfy policies that
-- already allow admin/moderator. support_agent deliberately remains excluded:
-- support access is mediated through scoped backend/admin routes rather than
-- broad direct-Supabase administrative policies.

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where user_id::text = private.current_user_id()
      and role in ('super_admin', 'admin', 'moderator')
  )
$$;
