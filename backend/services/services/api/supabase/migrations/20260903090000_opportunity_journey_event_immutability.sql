-- The opportunity journey event ledger is append-only, including for the
-- backend service role. Corrections are recorded as new events rather than by
-- mutating historical evidence.
--
-- Events must also survive a future hard-delete or retention cleanup of the
-- parent journey. Replace the original cascade with SET NULL before adding the
-- immutability trigger.

alter table public.opportunity_journey_events
  drop constraint if exists opportunity_journey_events_journey_id_fkey;

alter table public.opportunity_journey_events
  add constraint opportunity_journey_events_journey_id_fkey
  foreign key (journey_id)
  references public.user_opportunity_journeys(id)
  on delete set null;

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
