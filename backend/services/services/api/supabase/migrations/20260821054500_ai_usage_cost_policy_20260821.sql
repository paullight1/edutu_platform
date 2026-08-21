-- Provider-aware AI cost accounting.
--
-- Application telemetry historically priced only by bare model name, which
-- caused namespaced OpenRouter fallback models such as
-- `deepseek/deepseek-chat` to be recorded as $0. The database is the final
-- accounting boundary: known provider/model pairs are recalculated here and
-- unknown pricing remains NULL (unpriced), never fake-zero cost.

create or replace function public.apply_ai_usage_cost_policy()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  input_tokens numeric := 0;
  output_tokens numeric := 0;
  input_price numeric := null;
  output_price numeric := null;
begin
  input_tokens := coalesce(
    new.prompt_tokens,
    case
      when new.completion_tokens is null then new.total_tokens
      else 0
    end,
    0
  );
  output_tokens := coalesce(new.completion_tokens, 0);

  if lower(new.provider) = 'deepseek' and lower(new.model) = 'deepseek-chat' then
    input_price := 0.27;
    output_price := 1.10;
  elsif lower(new.provider) = 'openrouter' and lower(new.model) = 'deepseek/deepseek-chat' then
    input_price := 0.27;
    output_price := 1.10;
  elsif lower(new.provider) = 'gemini' and lower(new.model) = 'text-embedding-004' then
    input_price := 0.01;
    output_price := 0;
  elsif lower(new.provider) = 'gemini' and lower(new.model) = 'gemini-2.0-flash' then
    input_price := 0.10;
    output_price := 0.40;
  end if;

  if input_price is null or output_price is null then
    new.estimated_cost_usd := null;
  else
    new.estimated_cost_usd :=
      ((input_tokens * input_price) + (output_tokens * output_price)) / 1000000.0;
  end if;

  return new;
end;
$$;

drop trigger if exists ai_usage_events_cost_policy on public.ai_usage_events;
create trigger ai_usage_events_cost_policy
before insert or update of provider, model, prompt_tokens, completion_tokens, total_tokens
on public.ai_usage_events
for each row
execute function public.apply_ai_usage_cost_policy();

revoke all on function public.apply_ai_usage_cost_policy() from public;
revoke all on function public.apply_ai_usage_cost_policy() from anon;
revoke all on function public.apply_ai_usage_cost_policy() from authenticated;

comment on function public.apply_ai_usage_cost_policy() is
  'Normalizes provider/model AI usage cost estimates; unknown pricing is NULL, not zero.';
