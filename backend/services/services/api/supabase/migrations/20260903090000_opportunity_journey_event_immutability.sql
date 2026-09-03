-- The opportunity journey event ledger is append-only, including for the
-- backend service role. Corrections are recorded as new events rather than by
-- mutating historical evidence.
--
-- Events survive a future hard-delete or retention cleanup of the parent
-- journey. PostgreSQL implements ON DELETE SET NULL as an update on the child,
-- so the trigger permits only that narrow referential detach while rejecting
-- every content mutation and all direct deletes.

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
  if tg_op = 'UPDATE'
    and old.journey_id is not null
    and new.journey_id is null
    and (
      old.id,
      old.user_id,
      old.intent_id,
      old.opportunity_id,
      old.event_type,
      old.source,
      old.idempotency_key,
      old.metadata,
      old.created_at
    ) is not distinct from (
      new.id,
      new.user_id,
      new.intent_id,
      new.opportunity_id,
      new.event_type,
      new.source,
      new.idempotency_key,
      new.metadata,
      new.created_at
    )
  then
    return new;
  end if;

  raise exception 'opportunity journey events are immutable';
end;
$$;

drop trigger if exists opportunity_journey_events_immutable
  on public.opportunity_journey_events;

create trigger opportunity_journey_events_immutable
before update or delete on public.opportunity_journey_events
for each row execute function public.prevent_opportunity_journey_event_mutation();
