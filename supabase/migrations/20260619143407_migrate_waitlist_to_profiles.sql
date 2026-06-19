do $$
declare
  has_name boolean;
  has_id boolean;
  has_created_at boolean;
  name_expr text;
  id_expr text;
  created_at_expr text;
begin
  if to_regclass('public.waitlist') is null then
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'waitlist'
      and column_name = 'name'
  ) into has_name;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'waitlist'
      and column_name = 'id'
  ) into has_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'waitlist'
      and column_name = 'created_at'
  ) into has_created_at;

  name_expr := case
    when has_name then 'nullif(trim(coalesce(w.name::text, '''')), '''')'
    else 'null'
  end;

  id_expr := case
    when has_id then 'w.id::text'
    else 'null'
  end;

  created_at_expr := case
    when has_created_at then 'coalesce(w.created_at, now())'
    else 'now()'
  end;

  execute format($sql$
    update public.profiles p
    set
      full_name = coalesce(nullif(trim(p.full_name), ''), %1$s),
      creator_metadata = coalesce(p.creator_metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'source', 'waitlist',
          'waitlist_imported', true,
          'waitlist_id', %2$s,
          'migrated_to_admin_at', now()
        ),
      updated_at = now()
    from public.waitlist w
    where p.email is not null
      and w.email is not null
      and lower(trim(p.email)) = lower(trim(w.email))
      and trim(w.email) <> ''
  $sql$, name_expr, id_expr);

  execute format($sql$
    insert into public.profiles (
      user_id,
      email,
      full_name,
      role,
      creator_status,
      creator_metadata,
      created_at,
      updated_at
    )
    select
      'waitlist:' || md5(lower(trim(w.email))) as user_id,
      lower(trim(w.email)) as email,
      %1$s as full_name,
      'user' as role,
      'none' as creator_status,
      jsonb_build_object(
        'source', 'waitlist',
        'waitlist_imported', true,
        'waitlist_id', %2$s,
        'migrated_to_admin_at', now()
      ) as creator_metadata,
      %3$s as created_at,
      now() as updated_at
    from public.waitlist w
    where w.email is not null
      and trim(w.email) <> ''
      and position('@' in w.email) > 1
      and not exists (
        select 1
        from public.profiles p
        where p.email is not null
          and lower(trim(p.email)) = lower(trim(w.email))
      )
    on conflict (user_id) do update
    set
      email = excluded.email,
      full_name = coalesce(nullif(trim(public.profiles.full_name), ''), excluded.full_name),
      creator_metadata = coalesce(public.profiles.creator_metadata, '{}'::jsonb) ||
        excluded.creator_metadata,
      updated_at = now()
  $sql$, name_expr, id_expr, created_at_expr);

  drop table public.waitlist;
end $$;
