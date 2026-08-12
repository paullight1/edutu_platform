-- Curated public communities for the Community discovery surfaces.
-- These are standing opportunity-support rooms, not provider-owned groups.
-- The owner id is a reserved Edutu catalogue identity; users can join through
-- the normal community API, while moderation remains an Edutu-owned action.

insert into public.community_groups (
  id,
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
    'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a101',
    'sop-studio',
    'SOP Studio',
    'SOP guides, personal statements, and application reviews for scholarships and graduate programmes.',
    'system:edutu-curated', 'public', 'open', '✍️', '#2563EB', 0, 0
  ),
  (
    'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a102',
    'africa-opportunity-circle',
    'Africa Opportunity Circle',
    'Scholarships, internships, grants, and fellowships across Africa.',
    'system:edutu-curated', 'public', 'open', '🌍', '#0F766E', 0, 0
  ),
  (
    'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a103',
    'us-applications-lab',
    'US Applications Lab',
    'US university, scholarship, and internship applications for international students.',
    'system:edutu-curated', 'public', 'open', '🇺🇸', '#1D4ED8', 0, 0
  ),
  (
    'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a104',
    'uk-study-funding-desk',
    'UK Study & Funding Desk',
    'Chevening, Commonwealth, university funding, and UK graduate applications.',
    'system:edutu-curated', 'public', 'open', '🇬🇧', '#7C3AED', 0, 0
  ),
  (
    'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a105',
    'asia-scholarships-exchange',
    'Asia Scholarships Exchange',
    'Scholarships and funded study options across Japan, Korea, China, Singapore, and beyond.',
    'system:edutu-curated', 'public', 'open', '🌏', '#C2410C', 0, 0
  ),
  (
    'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a106',
    'europe-erasmus-funding',
    'Europe, Erasmus & Funding',
    'Erasmus+, DAAD, and funded study routes across Europe.',
    'system:edutu-curated', 'public', 'open', '🇪🇺', '#0369A1', 0, 0
  ),
  (
    'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a107',
    'early-career-launchpad',
    'Early Career Launchpad',
    'Entry-level jobs, internships, graduate schemes, and career preparation.',
    'system:edutu-curated', 'public', 'open', '🚀', '#B45309', 0, 0
  ),
  (
    'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a108',
    'fellowships-leadership',
    'Fellowships & Leadership',
    'Leadership fellowships, policy programmes, and global civic opportunities.',
    'system:edutu-curated', 'public', 'open', '🧭', '#4338CA', 0, 0
  ),
  (
    'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a109',
    'stem-funding-network',
    'STEM Funding Network',
    'STEM scholarships, research placements, labs, and technical internships.',
    'system:edutu-curated', 'public', 'open', '🔬', '#047857', 0, 0
  ),
  (
    'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a110',
    'application-review-room',
    'Application Review Room',
    'Peer feedback on CVs, essays, portfolios, and interview preparation.',
    'system:edutu-curated', 'public', 'open', '📝', '#BE123C', 0, 0
  )
on conflict (slug) do nothing;
