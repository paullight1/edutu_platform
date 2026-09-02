-- Broad, evergreen entry points for a new member's first Community visit.
-- More specific regional and application-support rooms are seeded separately
-- in 20260809120000_seed_opportunity_communities.sql.

insert into public.community_groups (
  slug,
  name,
  description,
  owner_id,
  visibility,
  join_policy,
  cover_emoji,
  accent,
  member_count,
  message_count
)
values
  (
    'scholarship-opportunities-hub',
    'Scholarship Opportunities Hub',
    'Find fully funded undergraduate, master''s, PhD, and professional scholarships, compare eligibility, and get application feedback.',
    'system:edutu-curated',
    'public',
    'open',
    '🎓',
    '#F45B16',
    0,
    0
  ),
  (
    'global-opportunities-network',
    'Global Opportunities Network',
    'Track fellowships, grants, exchanges, internships, competitions, and leadership programmes open worldwide.',
    'system:edutu-curated',
    'public',
    'open',
    '🌍',
    '#F45B16',
    0,
    0
  )
on conflict (slug) do nothing;
