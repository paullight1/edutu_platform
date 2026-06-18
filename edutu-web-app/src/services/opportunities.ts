import type { Opportunity, OpportunityDifficulty } from '../types/opportunity';
import { getApiBaseUrl } from '../lib/apiBaseUrl';
import { syncOpportunityInventorySnapshot } from './analyticsAggregator';
import { updateOpportunitiesInN8n } from './n8nIntegration';

let cachedOpportunities: Opportunity[] | null = null;
const fallbackUpdatedAt = new Date().toISOString();

const fallbackOpportunities: Opportunity[] = [
  {
    id: 'fallback-chevening-masters',
    title: 'Chevening Masters Scholarship',
    organization: 'UK Foreign, Commonwealth & Development Office',
    category: 'Scholarships',
    deadline: '2026-11-05',
    location: 'United Kingdom',
    description: 'Full funding for a one-year master’s degree in the UK with tuition, travel, and living support.',
    requirements: ['Bachelor’s degree', 'Leadership experience', 'English proficiency'],
    benefits: ['Full tuition', 'Monthly stipend', 'Travel costs'],
    applicationProcess: ['Create a profile', 'Draft your essays', 'Submit references'],
    image: 'https://images.pexels.com/photos/267885/pexels-photo-267885.jpeg',
    match: 96,
    difficulty: 'Hard',
    lastUpdated: fallbackUpdatedAt
  },
  {
    id: 'fallback-daad-research',
    title: 'DAAD Research Fellowship',
    organization: 'German Academic Exchange Service',
    category: 'Fellowships',
    deadline: '2026-10-18',
    location: 'Germany',
    description: 'Short-term research support for graduate students and early-career researchers in German universities.',
    requirements: ['Research proposal', 'Academic transcript', 'Supervisor match'],
    benefits: ['Monthly funding', 'Research network access', 'Travel support'],
    applicationProcess: ['Pick a host lab', 'Prepare proposal', 'Submit supporting documents'],
    image: 'https://images.pexels.com/photos/1438072/pexels-photo-1438072.jpeg',
    match: 92,
    difficulty: 'Hard',
    lastUpdated: fallbackUpdatedAt
  },
  {
    id: 'fallback-global-tech-internship',
    title: 'Global Tech Internship',
    organization: 'International Innovation Lab',
    category: 'Internships',
    deadline: '2026-08-30',
    location: 'Remote',
    description: 'A remote internship for students who want hands-on experience with product, design, or software teams.',
    requirements: ['Portfolio or resume', 'Availability for 10-12 weeks', 'Strong communication'],
    benefits: ['Mentorship', 'Portfolio project', 'Weekly feedback'],
    applicationProcess: ['Apply online', 'Complete a short task', 'Join a chat interview'],
    image: 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg',
    match: 89,
    difficulty: 'Medium',
    lastUpdated: fallbackUpdatedAt
  },
  {
    id: 'fallback-mandela-leadership',
    title: 'Mandela Leadership Program',
    organization: 'Pan-African Fellowship Network',
    category: 'Programs',
    deadline: '2026-09-12',
    location: 'South Africa',
    description: 'A leadership development program for young changemakers building impact projects in their communities.',
    requirements: ['Community project idea', 'Short essay', 'Two references'],
    benefits: ['Leadership training', 'Mentor circles', 'Seed funding pitch day'],
    applicationProcess: ['Submit essays', 'Attend interview', 'Present your project'],
    image: 'https://images.pexels.com/photos/1181715/pexels-photo-1181715.jpeg',
    match: 90,
    difficulty: 'Medium',
    lastUpdated: fallbackUpdatedAt
  },
  {
    id: 'fallback-open-science-grant',
    title: 'Open Science Research Grant',
    organization: 'Global Research Collective',
    category: 'Grants',
    deadline: '2026-12-01',
    location: 'Global',
    description: 'Small grant support for student-led research, experiments, and open educational resources.',
    requirements: ['Research outline', 'Budget plan', 'Supervisor endorsement'],
    benefits: ['Seed funding', 'Publication support', 'Open science network'],
    applicationProcess: ['Prepare proposal', 'Upload budget', 'Wait for review'],
    image: 'https://images.pexels.com/photos/2280571/pexels-photo-2280571.jpeg',
    match: 84,
    difficulty: 'Easy',
    lastUpdated: fallbackUpdatedAt
  },
  {
    id: 'fallback-future-leaders-summer',
    title: 'Future Leaders Summer School',
    organization: 'Global Campus Alliance',
    category: 'Programs',
    deadline: '2026-07-20',
    location: 'Canada',
    description: 'A summer program for ambitious learners who want to build a stronger academic profile and global network.',
    requirements: ['CV', 'Motivation letter', 'Academic transcript'],
    benefits: ['Certificate of completion', 'Networking sessions', 'Career workshops'],
    applicationProcess: ['Apply with documents', 'Complete screening', 'Receive acceptance email'],
    image: 'https://images.pexels.com/photos/1595391/pexels-photo-1595391.jpeg',
    match: 87,
    difficulty: 'Medium',
    lastUpdated: fallbackUpdatedAt
  }
];

export function getFallbackOpportunities(): Opportunity[] {
  return fallbackOpportunities;
}

interface FetchOptions {
  signal?: AbortSignal;
  force?: boolean;
  userId?: string;
  limit?: number;
  offset?: number;
  status?: string;
  category?: string;
}

type BackendOpportunityRow = Record<string, any>;

function normaliseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    const normalised = normaliseStringArray(value);
    if (normalised.length > 0) {
      return normalised;
    }
  }

  return [];
}

function normaliseDifficulty(value: unknown): OpportunityDifficulty {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'easy' || raw === 'beginner') {
    return 'Easy';
  }
  if (raw === 'hard' || raw === 'advanced') {
    return 'Hard';
  }
  return 'Medium';
}

function extractOpportunityRows(payload: unknown): BackendOpportunityRow[] {
  if (Array.isArray(payload)) {
    return payload as BackendOpportunityRow[];
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const source = payload as Record<string, unknown>;
  const data = source.data ?? source.opportunities ?? source.items ?? source.results;

  if (Array.isArray(data)) {
    return data as BackendOpportunityRow[];
  }

  return [];
}

function normaliseOpportunity(row: BackendOpportunityRow): Opportunity {
  const metadata = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, any>;
  const rawDifficulty =
    row.difficulty ??
    metadata.difficulty ??
    metadata.difficulty_level ??
    metadata.level;
  const rawMatch =
    row.match ??
    metadata.match_score ??
    metadata.matchScore ??
    row.quality_score ??
    row.qualityScore ??
    0;

  return {
    id: String(row.id ?? row.opportunity_id ?? row.external_id ?? crypto.randomUUID()),
    title: String(row.title ?? row.name ?? 'Untitled opportunity'),
    organization: String(row.organization ?? row.provider ?? row.source_name ?? 'Community Provider'),
    category: String(row.category ?? row.canonical_category ?? 'General'),
    deadline: row.close_date ?? row.deadline ?? row.application_deadline ?? null,
    location: String(
      row.location ??
        row.target_region ??
        (row.is_remote ? 'Remote' : ''),
    ),
    description: String(
      row.description ??
        row.summary ??
        metadata.summary ??
        'No description provided.',
    ),
    requirements: pickStringArray(row.requirements, metadata.requirements, metadata.eligibility),
    benefits: pickStringArray(row.benefits, metadata.benefits),
    applicationProcess: pickStringArray(
      row.application_process,
      metadata.application_process,
      metadata.applicationProcess,
    ),
    image:
      row.image ??
      row.image_url ??
      row.cover_image ??
      row.imageUrl ??
      metadata.image ??
      metadata.image_url ??
      null,
    match: Number.isFinite(Number(rawMatch)) ? Number(rawMatch) : 0,
    difficulty: normaliseDifficulty(rawDifficulty),
    applicants: row.applicants ?? metadata.applicants,
    successRate: row.success_rate ?? metadata.success_rate,
    applyUrl: row.application_url ?? row.applyUrl ?? row.apply_url ?? row.url ?? metadata.applyUrl,
    lastUpdated: row.updated_at ?? row.updatedAt ?? row.updated ?? new Date().toISOString(),
    source: row.source,
    externalId: row.external_id,
    tags: normaliseStringArray(row.tags ?? metadata.tags),
    isRemote: row.is_remote ?? row.isRemote,
    featured: row.is_featured ?? row.featured,
    stipend: row.stipend,
    currency: row.currency,
    eligibility: row.eligibility ?? metadata.eligibility,
    openDate: row.open_date ?? row.openDate ?? null,
    createdAt: row.created_at ?? row.createdAt,
    createdBy: row.created_by ?? row.createdBy,
    viewCount: row.view_count ?? row.viewCount,
    applyCount: row.apply_count ?? row.applyCount,
    bookmarkCount: row.bookmark_count ?? row.bookmarkCount,
  };
}

function buildBackendUrl(path: string, params?: URLSearchParams): string {
  const apiBaseUrl = getApiBaseUrl('Opportunities API');
  const query = params && params.toString() ? `?${params.toString()}` : '';
  return `${apiBaseUrl}${path}${query}`;
}

async function requestStaticOpportunitySnapshot(options: FetchOptions = {}): Promise<Opportunity[]> {
  const response = await fetch('/data/opportunities.json', {
    method: 'GET',
    signal: options.signal,
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Opportunity snapshot request failed with ${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  const rows = extractOpportunityRows(payload);

  return rows.map(normaliseOpportunity);
}

async function requestOpportunityList(options: FetchOptions = {}): Promise<Opportunity[]> {
  const params = new URLSearchParams();
  params.set('limit', String(Math.min(Math.max(Number(options.limit) || 100, 1), 100)));

  if (typeof options.offset === 'number' && Number.isFinite(options.offset) && options.offset > 0) {
    params.set('offset', String(Math.floor(options.offset)));
  }

  params.set('status', options.status || 'active');

  if (options.category) {
    params.set('category', options.category);
  }

  const response = await fetch(buildBackendUrl('/opportunities', params), {
    method: 'GET',
    signal: options.signal,
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const message = `Opportunity API request failed with ${response.status}`;
    throw new Error(message);
  }

  const payload = await response.json().catch(() => null);
  const rows = extractOpportunityRows(payload);

  return rows.map(normaliseOpportunity);
}

export async function fetchOpportunities(options: FetchOptions = {}): Promise<Opportunity[]> {
  const { force } = options;

  if (!force && cachedOpportunities) {
    return cachedOpportunities;
  }

  try {
    const normalised = await requestOpportunityList(options);
    const resolvedOpportunities = normalised.length > 0 ? normalised : await requestStaticOpportunitySnapshot(options);
    cachedOpportunities = resolvedOpportunities;

    if (resolvedOpportunities.length > 0) {
      void (async () => {
        try {
          await syncOpportunityInventorySnapshot(resolvedOpportunities);
          if (options.userId) {
            await updateOpportunitiesInN8n(resolvedOpportunities, options.userId);
          }
        } catch (err) {
          console.error('Failed to sync opportunity analytics or update n8n:', err);
        }
      })();
    }

    return resolvedOpportunities;
  } catch (error) {
    console.error('Error fetching opportunities from backend:', error);

    try {
      const snapshotOpportunities = await requestStaticOpportunitySnapshot(options);
      cachedOpportunities = snapshotOpportunities;
      return snapshotOpportunities;
    } catch (snapshotError) {
      console.error('Error loading static opportunity snapshot:', snapshotError);
    }

    if (cachedOpportunities) {
      return cachedOpportunities;
    }

    throw error;
  }
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  if (cachedOpportunities) {
    const cached = cachedOpportunities.find((opportunity) => opportunity.id === id);
    if (cached) {
      return cached;
    }
  }

  try {
    const response = await fetch(buildBackendUrl(`/opportunities/${encodeURIComponent(id)}`), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      try {
        const snapshot = await requestStaticOpportunitySnapshot();
        return snapshot.find((opportunity) => opportunity.id === id) ?? null;
      } catch {
        return null;
      }
    }

    const payload = await response.json().catch(() => null);
    if (!payload) {
      try {
        const snapshot = await requestStaticOpportunitySnapshot();
        return snapshot.find((opportunity) => opportunity.id === id) ?? null;
      } catch {
        return null;
      }
    }

    const row = extractOpportunityRows(payload)[0] ?? (Array.isArray(payload) ? payload[0] : payload);
    if (!row || typeof row !== 'object') {
      return null;
    }

    const opportunity = normaliseOpportunity(row as BackendOpportunityRow);
    cachedOpportunities = cachedOpportunities
      ? cachedOpportunities.map((item) => (item.id === opportunity.id ? opportunity : item))
      : [opportunity];

    return opportunity;
  } catch {
    try {
      const snapshot = await requestStaticOpportunitySnapshot();
      return snapshot.find((opportunity) => opportunity.id === id) ?? null;
    } catch {
      return null;
    }
  }
}

export function clearOpportunitiesCache() {
  cachedOpportunities = null;
}
