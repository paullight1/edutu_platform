-- The opportunity journey event ledger is append-only, including for the
-- backend service role. Corrections are recorded as new events rather than by
-- mutating historical evidence.

create or replace function public.prevent_opportunity_journey_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'opportunity journey events are immutable';
end;
$$;

drop trigger if exists opportunity_journey_events_immutable
  on public.opportunity_journey_events;

create trigger opportunity_journey_events_immutable
before update or delete on public.opportunity_journey_events
for each row execute function public.prevent_opportunity_journey_event_mutation();
