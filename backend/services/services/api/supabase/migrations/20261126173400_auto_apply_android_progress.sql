begin;
alter table private.auto_apply_live_activities
  add column platform text not null default 'ios' check (platform in ('ios','android'));
commit;
