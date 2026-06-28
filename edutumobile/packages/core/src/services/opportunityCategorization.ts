import type { Opportunity, OpportunityCanonicalCategory } from '../types/opportunity';

export const OPPORTUNITY_CATEGORY_DEFINITIONS: Array<{
  id: Exclude<OpportunityCanonicalCategory, 'other'>;
  label: string;
}> = [
  { id: 'scholarships', label: 'Scholarships' },
  { id: 'careers', label: 'Careers' },
  { id: 'leadership', label: 'Leadership' },
  { id: 'global_programs', label: 'Global Programs' },
  { id: 'training_conferences', label: 'Training & Conferences' },
];

const CATEGORY_KEYWORDS: Record<Exclude<OpportunityCanonicalCategory, 'other'>, string[]> = {
  scholarships: [
    'scholarship',
    'scholarships',
    'scholar',
    'scholars',
    'grant',
    'grants',
    'bursary',
    'bursaries',
    'tuition',
    'financial aid',
    'fully funded',
    'funded',
    'funding',
    'stipend',
    'award',
  ],
  careers: [
    'career',
    'careers',
    'internship',
    'internships',
    'intern',
    'job',
    'jobs',
    'employment',
    'vacancy',
    'vacancies',
    'role',
    'roles',
    'graduate trainee',
    'trainee',
    'apprenticeship',
    'apprentice',
  ],
  leadership: [
    'leadership',
    'leader',
    'leaders',
    'fellowship',
    'fellowships',
    'fellow',
    'mentorship',
    'mentor',
    'ambassador',
    'volunteer',
    'community',
    'changemaker',
    'civic',
    'social impact',
  ],
  global_programs: [
    'global',
    'international',
    'worldwide',
    'abroad',
    'exchange',
    'conference',
    'summit',
    'bootcamp',
    'accelerator',
    'program',
    'programme',
    'remote',
  ],
  training_conferences: [
    'training',
    'trainings',
    'workshop',
    'workshops',
    'seminar',
    'seminars',
    'conference',
    'conferences',
    'masterclass',
    'master class',
    'webinar',
    'short course',
    'professional development',
    'retreat',
  ],
};

function normalizeText(value: unknown): string {
  if (!value) return '';
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(' ');
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(normalizeText).filter(Boolean).join(' ');
  return String(value).toLowerCase();
}

function buildCategorizationText(opportunity: Partial<Opportunity> & Record<string, any>): string {
  return [
    opportunity.canonicalCategory,
    opportunity.canonical_category,
    opportunity.category,
    opportunity.title,
    opportunity.organization,
    opportunity.location,
    opportunity.description,
    opportunity.aiSummary,
    opportunity.ai_summary,
    opportunity.refined_summary,
    opportunity.eligibilityCriteria,
    opportunity.fundingType,
    opportunity.targetRegion,
    opportunity.tags,
    opportunity.aiTags,
    opportunity.ai_tags,
    opportunity.requirements,
    opportunity.benefits,
    opportunity.skills,
    opportunity.metadata,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');
}

function keywordScore(text: string, keywords: string[]): number {
  return keywords.reduce((score, keyword) => {
    const normalized = keyword.toLowerCase();
    if (!text.includes(normalized)) return score;
    return score + (normalized.includes(' ') ? 2 : 1);
  }, 0);
}

export function categorizeOpportunity(opportunity: Partial<Opportunity> & Record<string, any>): OpportunityCanonicalCategory {
  const stored = normalizeText(opportunity.canonicalCategory || opportunity.canonical_category).replace(/-/g, '_');
  if (stored === 'scholarships' || stored === 'careers' || stored === 'leadership' || stored === 'global_programs' || stored === 'training_conferences') {
    return stored;
  }

  const text = buildCategorizationText(opportunity);
  const scores = OPPORTUNITY_CATEGORY_DEFINITIONS.map((category) => ({
    id: category.id,
    score: keywordScore(text, CATEGORY_KEYWORDS[category.id]),
  })).filter((item) => item.score > 0);

  if (!scores.length) return 'other';

  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const priority: OpportunityCanonicalCategory[] = ['scholarships', 'careers', 'leadership', 'global_programs', 'training_conferences', 'other'];
    return priority.indexOf(a.id) - priority.indexOf(b.id);
  });

  return scores[0].id;
}

export function matchesOpportunityCategory(
  opportunity: Partial<Opportunity> & Record<string, any>,
  category: OpportunityCanonicalCategory | null | undefined,
): boolean {
  if (!category || category === 'other') return true;
  return categorizeOpportunity(opportunity) === category;
}
