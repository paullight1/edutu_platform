/**
 * Stable ordering for Edutu's curated opportunity communities.
 *
 * These slugs are also used by the seed migration, so the mobile discovery
 * surface can keep the curated communities featured without adding a client-
 * only ranking field to the community API.
 */
export const FEATURED_DISCOVERY_SLUGS = [
  'sop-studio',
  'africa-opportunity-circle',
  'us-applications-lab',
] as const;

export const CURATED_DISCOVERY_SLUGS = [
  ...FEATURED_DISCOVERY_SLUGS,
  'uk-study-funding-desk',
  'asia-scholarships-exchange',
  'europe-erasmus-funding',
  'early-career-launchpad',
  'fellowships-leadership',
  'stem-funding-network',
  'application-review-room',
] as const;

const COVER_QUERY = '?auto=format&fit=crop&w=240&q=82';

/** Public editorial covers for the curated rooms. User-uploaded covers still
 * take precedence through `coverImageResourceUrl`; these are only the stable
 * fallback images for catalogue groups that have no uploaded cover. */
const COMMUNITY_COVER_URLS: Record<string, string> = {
  'sop-studio': `https://images.unsplash.com/photo-1455390582262-044cdead277a${COVER_QUERY}`,
  'africa-opportunity-circle': `https://images.unsplash.com/photo-1529156069898-49953e39b3ac${COVER_QUERY}`,
  'us-applications-lab': `https://images.unsplash.com/photo-1523050854058-8df90110c9f1${COVER_QUERY}`,
  'uk-study-funding-desk': `https://images.unsplash.com/photo-1513635269975-59663e0ac1ad${COVER_QUERY}`,
  'asia-scholarships-exchange': `https://images.unsplash.com/photo-1528360983277-13d401cdc186${COVER_QUERY}`,
  'europe-erasmus-funding': `https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1${COVER_QUERY}`,
  'early-career-launchpad': `https://images.unsplash.com/photo-1551836022-d5d88e9218df${COVER_QUERY}`,
  'fellowships-leadership': `https://images.unsplash.com/photo-1543269865-cbf427effbad${COVER_QUERY}`,
  'stem-funding-network': `https://images.unsplash.com/photo-1518770660439-4636190af475${COVER_QUERY}`,
  'application-review-room': `https://images.unsplash.com/photo-1450101499163-c8848c66ca85${COVER_QUERY}`,
  'testing-cddd4c': `https://images.unsplash.com/photo-1499750310107-5fef28a66643${COVER_QUERY}`,
};

export function getCommunityGroupCoverUrl(slug: string): string | null {
  return COMMUNITY_COVER_URLS[slug] ?? null;
}

const CURATED_ORDER = new Map<string, number>(
  CURATED_DISCOVERY_SLUGS.map((slug, index) => [slug, index]),
);

export function sortDiscoveryRows<T extends { group: { slug: string; messageCount: number; memberCount: number; createdAt: string } }>(
  rows: T[],
): T[] {
  return rows.slice().sort((a, b) => {
    const curatedA = CURATED_ORDER.get(a.group.slug);
    const curatedB = CURATED_ORDER.get(b.group.slug);
    if (curatedA !== undefined || curatedB !== undefined) {
      if (curatedA === undefined) return 1;
      if (curatedB === undefined) return -1;
      return curatedA - curatedB;
    }
    return (
      b.group.messageCount - a.group.messageCount ||
      b.group.memberCount - a.group.memberCount ||
      b.group.createdAt.localeCompare(a.group.createdAt)
    );
  });
}
