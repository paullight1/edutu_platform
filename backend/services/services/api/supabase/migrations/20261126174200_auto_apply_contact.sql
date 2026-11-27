begin;
alter table private.auto_apply_profiles
  add column contact_name text not null default '' check (length(contact_name) <= 200),
  add column contact_email text not null default '' check (length(contact_email) <= 254);
commit;
