begin;

alter table private.auto_apply_attempts
  add column previous_answers jsonb;

create function private.auto_apply_copyable_answers(review jsonb)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object(
    'label', field ->> 'label',
    'value', field ->> 'value'
  ) order by position)
  from jsonb_array_elements(review) with ordinality as entry(field, position)
  where not (field ? 'attachment' or field ? 'choices')
    and nullif(btrim(field ->> 'value'), '') is not null
    and nullif(btrim(field ->> 'label'), '') is not null;
$$;

revoke all on function private.auto_apply_copyable_answers(jsonb) from public, anon, authenticated;
commit;
