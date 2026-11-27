begin;

create function private.auto_apply_review_value_fits(field jsonb, value text)
returns boolean language sql immutable set search_path = '' as $$
  select case when field ? 'maxLength' then
    length(value) + length(regexp_replace(value, U&'[\0001-\FFFF]', '', 'g'))
      <= (field->>'maxLength')::integer
    else true end;
$$;
revoke all on function private.auto_apply_review_value_fits(jsonb, text) from public;

commit;
