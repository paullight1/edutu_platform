begin;

-- The queue schedule is a timestamp without time zone, stored as UTC by
-- the API. Use the same clock for alerts from Auto Apply and its tracker.
alter function private.queue_auto_apply_action() set timezone = 'UTC';
alter function private.queue_application_lifecycle() set timezone = 'UTC';

commit;
