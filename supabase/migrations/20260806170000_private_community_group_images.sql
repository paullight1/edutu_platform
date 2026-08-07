-- Group profile images reuse the private `community-assets` bucket. The
-- canonical row stores only Edutu's stable, membership-gated resource URL;
-- short-lived Supabase signed URLs are resolved at read time.

alter table public.community_groups
  add column if not exists cover_image_resource_url text;

comment on column public.community_groups.cover_image_resource_url is
  'Stable Edutu API resource URL for a private community-assets image; never a storage signed URL.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_groups_cover_image_resource_url_length'
      and conrelid = 'public.community_groups'::regclass
  ) then
    alter table public.community_groups
      add constraint community_groups_cover_image_resource_url_length
      check (
        cover_image_resource_url is null
        or char_length(cover_image_resource_url) <= 2048
      );
  end if;
end
$$;
