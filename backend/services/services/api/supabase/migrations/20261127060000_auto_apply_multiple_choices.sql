begin;
alter table private.auto_apply_attempts
  add column question_selection_mode text
    check (question_selection_mode in ('multiple_required', 'multiple_optional'));

create function private.auto_apply_choices_value_allowed(choices jsonb, answer text, selection_mode text)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  selections jsonb;
begin
  if selection_mode is null then
    return coalesce(choices ? answer, false);
  end if;
  if answer is null or length(answer) > 4000 or jsonb_typeof(choices) is distinct from 'array' then
    return false;
  end if;
  begin
    selections := answer::jsonb;
  exception when data_exception then
    return false;
  end;
  if jsonb_typeof(selections) is distinct from 'array' then
    return false;
  end if;
  if selection_mode = 'multiple_required' and jsonb_array_length(selections) = 0 then
    return false;
  end if;
  return not exists (
    select 1 from jsonb_array_elements(selections) as selected(value)
    where jsonb_typeof(value) <> 'string' or not (choices ? (value #>> '{}'))
  ) and (
    select count(distinct value) from jsonb_array_elements(selections) as selected(value)
  ) = jsonb_array_length(selections);
end;
$$;

revoke all on function private.auto_apply_choices_value_allowed(jsonb, text, text) from public, anon, authenticated;
commit;
