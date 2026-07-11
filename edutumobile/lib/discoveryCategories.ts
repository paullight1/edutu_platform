import type { ImageSourcePropType } from 'react-native';
import type { DiscoveryCategoryIcon } from './discoveryCategoryIcons';

// Canonical discovery category ids. These match the backend canonical
// categories (opportunity-categorization.ts) and the Supabase
// `opportunity_categories` catalog table 1:1.
export type DiscoveryCategoryId =
  | 'scholarships'
  | 'internships'
  | 'programs'
  | 'fellowships'
  | 'grants'
  | 'graduate_programs'
  | 'bootcamps'
  | 'events';

export type DiscoveryCategory = {
  id: DiscoveryCategoryId;
  /** i18n key in the 'home' namespace */
  homeTitleKey: string;
  /** i18n key in the 'home' namespace */
  homeDescriptionKey: string;
  /** i18n key in the 'opps' namespace */
  oppsLabelKey: string;
  /** Shown if a translation is missing */
  fallbackTitle: string;
  icon: DiscoveryCategoryIcon;
  colors: [string, string];
  accent: string;
  /** Bundled background image; cards without one render a solid gradient. */
  image?: ImageSourcePropType;
};

const DISCOVERY_BACKGROUNDS = {
  scholarships: require('../assets/discovery/scholarships.png'),
  internships: require('../assets/discovery/internships.png'),
  programs: require('../assets/discovery/grants.png'),
  fellowships: require('../assets/discovery/fellowships.png'),
} as const;

export const DISCOVERY_CATEGORY_CATALOG: DiscoveryCategory[] = [
  {
    id: 'scholarships',
    homeTitleKey: 'home.discovery.scholarships.title',
    homeDescriptionKey: 'home.discovery.scholarships.description',
    oppsLabelKey: 'list.discovery.scholarships',
    fallbackTitle: 'Scholarships',
    icon: 'scholarship',
    colors: ['rgba(239,68,35,0.94)', 'rgba(153,27,27,0.82)'],
    accent: '#EF4423',
    image: DISCOVERY_BACKGROUNDS.scholarships,
  },
  {
    id: 'internships',
    homeTitleKey: 'home.discovery.internships.title',
    homeDescriptionKey: 'home.discovery.internships.description',
    oppsLabelKey: 'list.discovery.internships',
    fallbackTitle: 'Internships',
    icon: 'career',
    colors: ['rgba(37,99,235,0.92)', 'rgba(30,64,175,0.82)'],
    accent: '#2563EB',
    image: DISCOVERY_BACKGROUNDS.internships,
  },
  {
    id: 'programs',
    homeTitleKey: 'home.discovery.programs.title',
    homeDescriptionKey: 'home.discovery.programs.description',
    oppsLabelKey: 'list.discovery.programs',
    fallbackTitle: 'Programs',
    icon: 'grant',
    colors: ['rgba(16,185,129,0.92)', 'rgba(4,120,87,0.82)'],
    accent: '#10B981',
    image: DISCOVERY_BACKGROUNDS.programs,
  },
  {
    id: 'fellowships',
    homeTitleKey: 'home.discovery.fellowships.title',
    homeDescriptionKey: 'home.discovery.fellowships.description',
    oppsLabelKey: 'list.discovery.fellowships',
    fallbackTitle: 'Fellowships',
    icon: 'leadership',
    colors: ['rgba(124,58,237,0.92)', 'rgba(91,33,182,0.82)'],
    accent: '#7C3AED',
    image: DISCOVERY_BACKGROUNDS.fellowships,
  },
  {
    id: 'grants',
    homeTitleKey: 'home.discovery.grants.title',
    homeDescriptionKey: 'home.discovery.grants.description',
    oppsLabelKey: 'list.discovery.grants',
    fallbackTitle: 'Grants',
    icon: 'grant',
    colors: ['rgba(13,148,136,0.94)', 'rgba(15,118,110,0.86)'],
    accent: '#0D9488',
  },
  {
    id: 'graduate_programs',
    homeTitleKey: 'home.discovery.graduatePrograms.title',
    homeDescriptionKey: 'home.discovery.graduatePrograms.description',
    oppsLabelKey: 'list.discovery.graduatePrograms',
    fallbackTitle: 'Graduate Programs',
    icon: 'scholarship',
    colors: ['rgba(109,40,217,0.94)', 'rgba(76,29,149,0.86)'],
    accent: '#6D28D9',
  },
  {
    id: 'bootcamps',
    homeTitleKey: 'home.discovery.bootcamps.title',
    homeDescriptionKey: 'home.discovery.bootcamps.description',
    oppsLabelKey: 'list.discovery.bootcamps',
    fallbackTitle: 'Bootcamps',
    icon: 'training',
    colors: ['rgba(219,39,119,0.94)', 'rgba(157,23,77,0.86)'],
    accent: '#DB2777',
  },
  {
    id: 'events',
    homeTitleKey: 'home.discovery.events.title',
    homeDescriptionKey: 'home.discovery.events.description',
    oppsLabelKey: 'list.discovery.events',
    fallbackTitle: 'Events',
    icon: 'career',
    colors: ['rgba(14,165,233,0.94)', 'rgba(3,105,161,0.86)'],
    accent: '#0EA5E9',
  },
];

export const DEFAULT_HOME_CATEGORIES: DiscoveryCategoryId[] = [
  'scholarships',
  'internships',
  'programs',
  'fellowships',
];

const CATALOG_BY_ID = new Map(DISCOVERY_CATEGORY_CATALOG.map((c) => [c.id, c]));

export function getDiscoveryCategory(id: string | null | undefined): DiscoveryCategory | null {
  if (!id) return null;
  return CATALOG_BY_ID.get(normalizeDiscoveryCategoryId(id) as DiscoveryCategoryId) ?? null;
}

// Accepts legacy/loose values from deep links, widgets, and old builds.
export function normalizeDiscoveryCategoryId(raw: string | null | undefined): DiscoveryCategoryId | null {
  if (!raw) return null;
  const key = String(raw).toLowerCase().replace(/[\s-]+/g, '_');
  const legacy: Record<string, DiscoveryCategoryId> = {
    scholarship: 'scholarships',
    internship: 'internships',
    fellowship: 'fellowships',
    grant: 'grants',
    program: 'programs',
    programme: 'programs',
    programmes: 'programs',
    graduate_program: 'graduate_programs',
    bootcamp: 'bootcamps',
    event: 'events',
    training_conferences: 'events',
  };
  const id = (legacy[key] ?? key) as DiscoveryCategoryId;
  return CATALOG_BY_ID.has(id) ? id : null;
}

export function sanitizeHomeCategories(raw: unknown): DiscoveryCategoryId[] {
  if (!Array.isArray(raw)) return DEFAULT_HOME_CATEGORIES;
  const cleaned = raw
    .map((value) => normalizeDiscoveryCategoryId(typeof value === 'string' ? value : null))
    .filter((value): value is DiscoveryCategoryId => Boolean(value));
  const unique = Array.from(new Set(cleaned));
  return unique.length ? unique : DEFAULT_HOME_CATEGORIES;
}
