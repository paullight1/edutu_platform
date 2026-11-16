import type { Opportunity, OpportunityCanonicalCategory } from '../types/opportunity';

export const OPPORTUNITY_CATEGORY_DEFINITIONS: Array<{
  id: Exclude<OpportunityCanonicalCategory, 'other'>;
  label: string;
}> = [
  { id: 'scholarships', label: 'Scholarships' },
  { id: 'internships', label: 'Internships' },
  { id: 'programs', label: 'Programs' },
  { id: 'fellowships', label: 'Fellowships' },
  { id: 'grants', label: 'Grants' },
  { id: 'graduate_programs', label: 'Graduate Programs' },
  { id: 'bootcamps', label: 'Bootcamps' },
  { id: 'events', label: 'Events' },
];

const CATEGORY_ALIASES: Record<string, OpportunityCanonicalCategory> = {
  scholarship: 'scholarships', scholarships: 'scholarships', scholar: 'scholarships', scholars: 'scholarships',
  bursary: 'scholarships', bursaries: 'scholarships', studentship: 'scholarships',
  internship: 'internships', internships: 'internships', intern: 'internships',
  career: 'internships', careers: 'internships', job: 'internships', jobs: 'internships',
  trainee: 'internships', trainees: 'internships', apprenticeship: 'internships', apprenticeships: 'internships',
  fellowship: 'fellowships', fellowships: 'fellowships', leadership: 'fellowships', residency: 'fellowships',
  program: 'programs', programs: 'programs', programme: 'programs', programmes: 'programs',
  global_program: 'programs', global_programs: 'programs', leadership_program: 'programs', leadership_programs: 'programs',
  grant: 'grants', grants: 'grants', microgrant: 'grants', microgrants: 'grants',
  graduate_program: 'graduate_programs', graduate_programs: 'graduate_programs', graduate_programme: 'graduate_programs',
  graduate_programmes: 'graduate_programs', masters: 'graduate_programs', master: 'graduate_programs', msc: 'graduate_programs',
  mba: 'graduate_programs', phd: 'graduate_programs', doctoral: 'graduate_programs', doctorate: 'graduate_programs', postgraduate: 'graduate_programs',
  bootcamp: 'bootcamps', bootcamps: 'bootcamps', accelerator: 'bootcamps', accelerators: 'bootcamps', incubator: 'bootcamps', incubators: 'bootcamps',
  event: 'events', events: 'events', conference: 'events', conferences: 'events', summit: 'events', summits: 'events',
  workshop: 'events', workshops: 'events', webinar: 'events', webinars: 'events', forum: 'events', forums: 'events', expo: 'events', expos: 'events',
  training_conference: 'events', training_conferences: 'events',
  competition: 'programs', competitions: 'programs', challenge: 'programs', challenges: 'programs', contest: 'programs', contests: 'programs',
  other: 'other', general: 'other',
};

type Rule = {
  id: Exclude<OpportunityCanonicalCategory, 'other'>;
  label: string;
  field: 'title' | 'body';
  weight: number;
  pattern: RegExp;
};

const RULES: Rule[] = [
  { id: 'scholarships', label: 'scholarship/bursary funding', field: 'title', weight: 96, pattern: /\b(scholarship|scholars?|bursar(?:y|ies)|studentship|tuition waiver|financial aid)\b/i },
  { id: 'scholarships', label: 'student funding', field: 'body', weight: 22, pattern: /\b(tuition|financial aid|study support|fully funded|partially funded|education funding|student funding)\b/i },
  { id: 'grants', label: 'direct grant funding', field: 'title', weight: 94, pattern: /\b(grant|grants|seed funding|microgrant|innovation fund|research funding)\b/i },
  { id: 'grants', label: 'project/business funding', field: 'body', weight: 24, pattern: /\b(project funding|research grant|business grant|startup funding|seed capital|innovation funding|award funding)\b/i },
  { id: 'internships', label: 'internship/trainee role', field: 'title', weight: 94, pattern: /\b(internship|intern|trainee|apprentice|apprenticeship|industrial attachment|work placement)\b/i },
  { id: 'internships', label: 'early-career work experience', field: 'body', weight: 24, pattern: /\b(entry[- ]level|early career|graduate trainee|paid placement|work experience|vacancy|employment role)\b/i },
  { id: 'fellowships', label: 'fellowship/residency', field: 'title', weight: 94, pattern: /\b(fellowship|fellow|residency|resident fellow)\b/i },
  { id: 'fellowships', label: 'leadership/mentorship cohort', field: 'body', weight: 23, pattern: /\b(leadership fellowship|leadership cohort|mentorship cohort|ambassador program|changemaker)\b/i },
  { id: 'graduate_programs', label: 'masters/PhD/postgraduate study', field: 'title', weight: 95, pattern: /\b(master'?s|msc|m\.sc|mba|phd|ph\.d|doctoral|doctorate|postgraduate|graduate school|graduate studies)\b/i },
  { id: 'graduate_programs', label: 'graduate degree admission', field: 'body', weight: 25, pattern: /\b(graduate degree|degree program|higher degree|post[- ]graduate study|admission for graduates)\b/i },
  { id: 'bootcamps', label: 'bootcamp/accelerator/incubator', field: 'title', weight: 95, pattern: /\b(bootcamp|coding bootcamp|accelerator|incubator)\b/i },
  { id: 'bootcamps', label: 'intensive skills training', field: 'body', weight: 24, pattern: /\b(intensive training|cohort[- ]based training|skills intensive|career accelerator|startup accelerator)\b/i },
  { id: 'events', label: 'conference/summit/workshop event', field: 'title', weight: 98, pattern: /\b(event|conference|summit|workshop|webinar|forum|expo|hackathon|career fair)\b/i },
  { id: 'events', label: 'delegate/attendee activity', field: 'body', weight: 26, pattern: /\b(delegate|delegates|attendee|speaker application|youth ambassador|registration|call for abstracts)\b/i },
  { id: 'programs', label: 'structured leadership/exchange program', field: 'title', weight: 72, pattern: /\b(leadership|exchange|mentorship|training|global|professional development)\s+(program|programme|track|cohort)\b/i },
  { id: 'programs', label: 'general structured program', field: 'body', weight: 16, pattern: /\b(program|programme|fellowship track|learning track|initiative|cohort)\b/i },
];

function normalizeText(value: unknown): string {
  if (!value) return '';
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(' ');
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(normalizeText).filter(Boolean).join(' ');
  return String(value).toLowerCase();
}

function normalizeKey(value: unknown): string {
  return normalizeText(value).trim().replace(/[&/]+/g, ' ').replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export function normalizeOpportunityCategory(value: unknown): OpportunityCanonicalCategory | null {
  return CATEGORY_ALIASES[normalizeKey(value)] ?? null;
}

function categoryFromSource(opportunity: Record<string, any>): OpportunityCanonicalCategory | null {
  const category = normalizeOpportunityCategory(opportunity.category);
  if (category && category !== 'other') return category;
  const typeKey = normalizeKey(opportunity.type);
  return typeKey === 'scholarship' ? null : normalizeOpportunityCategory(opportunity.type);
}

function buildText(opportunity: Partial<Opportunity> & Record<string, any>) {
  return {
    title: normalizeText(opportunity.title),
    body: normalizeText([
      opportunity.description, opportunity.summary, opportunity.aiSummary, opportunity.ai_summary,
      opportunity.eligibilityCriteria, opportunity.fundingType, opportunity.targetRegion,
      opportunity.tags, opportunity.aiTags, opportunity.ai_tags, opportunity.requirements,
      opportunity.benefits, opportunity.skills, opportunity.location, opportunity.organization,
      opportunity.metadata,
    ]),
  };
}

export function categorizeOpportunity(
  opportunity: Partial<Opportunity> & Record<string, any>,
): OpportunityCanonicalCategory {
  const stored = normalizeOpportunityCategory(opportunity.canonicalCategory || opportunity.canonical_category);
  if (stored && stored !== 'other' && (opportunity.classification_locked === true || opportunity.classificationLocked === true)) {
    return stored;
  }

  const source = categoryFromSource(opportunity);
  const text = buildText(opportunity);
  const scores = new Map<OpportunityCanonicalCategory, number>();
  const priority: OpportunityCanonicalCategory[] = ['scholarships', 'grants', 'graduate_programs', 'internships', 'fellowships', 'bootcamps', 'events', 'programs', 'other'];

  if (source) scores.set(source, 88);
  for (const rule of RULES) {
    if (rule.pattern.test(text[rule.field])) scores.set(rule.id, (scores.get(rule.id) ?? 0) + rule.weight);
  }
  if (/\b(scholarship|scholars?|bursar(?:y|ies)|studentship)\b/i.test(text.title)) scores.set('scholarships', (scores.get('scholarships') ?? 0) + 18);
  if (/\b(grant|microgrant|seed funding)\b/i.test(text.title)) scores.set('grants', (scores.get('grants') ?? 0) + 16);

  const winner = [...scores.entries()].filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1] || priority.indexOf(a[0]) - priority.indexOf(b[0]))[0];
  return winner?.[0] ?? 'other';
}

export function matchesOpportunityCategory(
  opportunity: Partial<Opportunity> & Record<string, any>,
  category: OpportunityCanonicalCategory | null | undefined,
): boolean {
  if (!category || category === 'other') return true;
  return categorizeOpportunity(opportunity) === category;
}
