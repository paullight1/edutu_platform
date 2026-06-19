import type {
  CommunityResource,
  CommunityRoadmapStage,
  CommunityStory,
  CommunityStoryDifficulty,
  CommunityStoryPrice,
  CommunityStoryQueryOptions,
} from '../types/community';
import { getApiBaseUrl } from '../lib/apiBaseUrl';

type BackendDifficulty = 'beginner' | 'intermediate' | 'advanced';
type BackendCategory =
  | 'scholarship'
  | 'career'
  | 'education'
  | 'skills'
  | 'business'
  | 'tech'
  | 'personal'
  | 'general';

export interface BackendRoadmapStep {
  id?: string;
  title: string;
  description: string;
  duration?: string;
  resources?: string[];
  relativeDueDays?: number;
  phase?: string;
  taskType?: string;
  calendarSyncEnabled?: boolean;
}

export interface BackendRoadmapResource {
  id?: string;
  title: string;
  url?: string;
  type?: 'link' | 'document' | 'video' | 'tool' | 'other';
}

export interface BackendRoadmap {
  id: string;
  title: string;
  slug?: string;
  description: string;
  category: BackendCategory | string;
  difficulty: BackendDifficulty | string;
  estimatedDuration?: string | null;
  estimated_duration?: string | null;
  targetAudience?: string | null;
  target_audience?: string | null;
  prerequisites?: string | null;
  outcomes?: string | null;
  coverImage?: string | null;
  cover_image?: string | null;
  opportunityId?: string | null;
  opportunity_id?: string | null;
  creatorProof?: Record<string, unknown> | null;
  creator_proof?: Record<string, unknown> | null;
  deadlineStrategy?: string | null;
  deadline_strategy?: string | null;
  communityId?: string | null;
  community_id?: string | null;
  calendarSyncEnabled?: boolean | null;
  calendar_sync_enabled?: boolean | null;
  creatorName?: string | null;
  creator_name?: string | null;
  isFeatured?: boolean | null;
  is_featured?: boolean | null;
  enrollmentCount?: number | null;
  enrollment_count?: number | null;
  ratingAvg?: number | null;
  rating_avg?: number | null;
  ratingCount?: number | null;
  rating_count?: number | null;
  satisfactionScore?: number | null;
  satisfaction_score?: number | null;
  status?: 'draft' | 'published' | 'archived' | string;
  steps?: BackendRoadmapStep[];
  resources?: BackendRoadmapResource[];
  relatedOpportunities?: string[];
  related_opportunities?: string[];
  createdAt?: string | null;
  created_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  publishedAt?: string | null;
  published_at?: string | null;
}

export interface CreateRoadmapInput {
  title: string;
  description: string;
  category: BackendCategory;
  difficulty: BackendDifficulty;
  estimatedDuration?: string;
  targetAudience?: string;
  prerequisites?: string;
  outcomes?: string;
  coverImage?: string;
  opportunityId?: string;
  creatorProof?: Record<string, unknown>;
  deadlineStrategy?: string;
  communityId?: string;
  calendarSyncEnabled?: boolean;
  steps: BackendRoadmapStep[];
  resources?: BackendRoadmapResource[];
  relatedOpportunities?: string[];
}

export interface RoadmapAdoptionResponse {
  id: string;
  roadmapId?: string;
  roadmap_id?: string;
  targetDeadline?: string | null;
  target_deadline?: string | null;
  calendarSyncEnabled?: boolean | null;
  calendar_sync_enabled?: boolean | null;
  adoptedPlan?: unknown;
  adopted_plan?: unknown;
  calendar?: {
    enabled: boolean;
    eventCount: number;
    filename: string;
    exportUrl: string;
  };
  reminderSchedule?: Array<Record<string, unknown>>;
  reminder_schedule?: Array<Record<string, unknown>>;
  communityAction?: {
    type: string;
    communityId: string;
    label: string;
    route: string;
    message?: string;
  } | null;
  community_action?: RoadmapAdoptionResponse['communityAction'];
}

export interface RoadmapCalendarExport {
  enrollmentId: string;
  roadmapId: string;
  filename: string;
  contentType: 'text/calendar';
  events: Array<{
    id: string;
    title: string;
    description?: string;
    startsAt: string;
    type: string;
  }>;
  ics: string;
}

interface RoadmapListOptions {
  status?: 'draft' | 'published' | 'archived';
  category?: string;
  difficulty?: string;
  search?: string;
  featured?: boolean;
  limit?: number;
  offset?: number;
}

function buildHeaders(token?: string | null): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const apiBaseUrl = getApiBaseUrl('Roadmap API');
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...buildHeaders(token),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `Roadmap API request failed with ${response.status}`;
    try {
      const body = await response.json();
      message = body?.message || body?.error || message;
    } catch {
      const text = await response.text();
      if (text) message = text;
    }
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function toQuery(params: RoadmapListOptions) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const serialised = query.toString();
  return serialised ? `?${serialised}` : '';
}

export function toBackendCategory(category?: string): BackendCategory {
  const normalized = (category || '').trim().toLowerCase();
  if (['scholarship', 'career', 'education', 'skills', 'business', 'tech', 'personal', 'general'].includes(normalized)) {
    return normalized as BackendCategory;
  }
  if (['technology', 'programming', 'software'].includes(normalized)) return 'tech';
  if (['creative', 'lifestyle', 'health', 'finance'].includes(normalized)) return 'personal';
  return 'general';
}

export function toBackendDifficulty(difficulty?: string): BackendDifficulty {
  const normalized = (difficulty || '').trim().toLowerCase();
  if (normalized === 'advanced') return 'advanced';
  if (normalized === 'intermediate') return 'intermediate';
  return 'beginner';
}

function fromBackendDifficulty(difficulty?: string): CommunityStoryDifficulty {
  if (difficulty === 'advanced') return 'Advanced';
  if (difficulty === 'intermediate') return 'Intermediate';
  return 'Beginner';
}

function fromBackendCategory(category?: string): string {
  const labels: Record<string, string> = {
    scholarship: 'Scholarship',
    career: 'Career',
    education: 'Education',
    skills: 'Skills',
    business: 'Business',
    tech: 'Programming',
    personal: 'Personal',
    general: 'General',
  };
  return labels[(category || '').toLowerCase()] || 'General';
}

function readDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapResource(resource: BackendRoadmapResource, index: number): CommunityResource {
  const resourceType = resource.type === 'document' ? 'article' : resource.type === 'link' ? 'other' : resource.type;
  return {
    id: resource.id || `resource-${index}`,
    title: resource.title,
    url: resource.url || undefined,
    type: resourceType || 'other',
    cost: 'free',
  };
}

function mapStep(step: BackendRoadmapStep, index: number): CommunityRoadmapStage {
  return {
    id: step.id || `step-${index}`,
    title: step.title,
    description: step.description,
    duration: step.duration,
    milestone: step.phase,
    tasks: [],
    resourceIds: step.resources,
    checkpoint: step.taskType,
    relativeDueDays: step.relativeDueDays,
  };
}

export function mapBackendRoadmapToCommunityStory(roadmap: BackendRoadmap): CommunityStory {
  const createdAt = readDate(roadmap.createdAt || roadmap.created_at) || new Date().toISOString();
  const updatedAt = readDate(roadmap.updatedAt || roadmap.updated_at) || createdAt;
  const enrollmentCount = Number(roadmap.enrollmentCount ?? roadmap.enrollment_count ?? 0);
  const rating = Number(roadmap.ratingAvg ?? roadmap.rating_avg ?? 0);
  const creatorProof = roadmap.creatorProof || roadmap.creator_proof || undefined;
  const deadlineStrategy = roadmap.deadlineStrategy || roadmap.deadline_strategy || undefined;
  const coverImage = roadmap.coverImage || roadmap.cover_image || '';
  const outcomes = typeof roadmap.outcomes === 'string'
    ? roadmap.outcomes.split(/\n|,/).map((item) => item.trim()).filter(Boolean)
    : [];

  return {
    id: roadmap.id,
    title: roadmap.title,
    summary: roadmap.description.slice(0, 180),
    story:
      typeof creatorProof?.story === 'string' && creatorProof.story.trim()
        ? creatorProof.story.trim()
        : roadmap.description,
    category: fromBackendCategory(roadmap.category),
    duration: roadmap.estimatedDuration || roadmap.estimated_duration || undefined,
    difficulty: fromBackendDifficulty(roadmap.difficulty),
    price: 'Free' as CommunityStoryPrice,
    successRate: Number(roadmap.satisfactionScore ?? roadmap.satisfaction_score ?? 0),
    image: coverImage,
    creator: {
      name: roadmap.creatorName || roadmap.creator_name || 'Edutu Creator',
      verified: Boolean(creatorProof?.verifiedScholar || creatorProof?.verified),
      title: typeof creatorProof?.title === 'string' ? creatorProof.title : undefined,
      email: typeof creatorProof?.email === 'string' ? creatorProof.email : undefined,
      avatar: typeof creatorProof?.avatar === 'string' ? creatorProof.avatar : undefined,
    },
    tags: roadmap.relatedOpportunities || roadmap.related_opportunities || [],
    outcomes,
    resources: (roadmap.resources || []).map(mapResource),
    roadmap: (roadmap.steps || []).map(mapStep),
    status: roadmap.status === 'published' ? 'approved' : roadmap.status === 'archived' ? 'hidden' : 'pending',
    type: 'roadmap',
    featured: Boolean(roadmap.isFeatured ?? roadmap.is_featured),
    createdAt,
    updatedAt,
    approvedAt: readDate(roadmap.publishedAt || roadmap.published_at),
    stats: {
      rating,
      users: enrollmentCount,
      successRate: Number(roadmap.satisfactionScore ?? roadmap.satisfaction_score ?? 0),
      saves: 0,
      adoptionCount: enrollmentCount,
      likes: 0,
      comments: Number(roadmap.ratingCount ?? roadmap.rating_count ?? 0),
    },
    lastUpdatedLabel: new Date(updatedAt).toLocaleDateString(),
    lastUpdatedTimestamp: new Date(updatedAt).getTime(),
    creatorProof,
    deadlineStrategy,
    communityId: roadmap.communityId || roadmap.community_id || undefined,
  };
}

export async function fetchRoadmaps(options: RoadmapListOptions = {}): Promise<BackendRoadmap[]> {
  return request<BackendRoadmap[]>(`/roadmaps${toQuery(options)}`);
}

export async function fetchRoadmapTemplates(options: RoadmapListOptions = {}): Promise<BackendRoadmap[]> {
  return request<BackendRoadmap[]>(`/roadmaps/templates${toQuery(options)}`);
}

export async function fetchRoadmap(id: string): Promise<BackendRoadmap> {
  return request<BackendRoadmap>(`/roadmaps/${encodeURIComponent(id)}`);
}

export async function fetchRoadmapCommunityStories(
  options: CommunityStoryQueryOptions = {},
): Promise<CommunityStory[]> {
  const status = Array.isArray(options.status) ? options.status[0] : options.status;
  const roadmaps = await fetchRoadmaps({
    status: status === 'pending' ? 'draft' : status === 'hidden' ? 'archived' : 'published',
    category: options.category ? toBackendCategory(options.category) : undefined,
    featured: options.featuredOnly,
    limit: options.limit,
    offset: 0,
  });

  return roadmaps.map(mapBackendRoadmapToCommunityStory);
}

export async function createRoadmap(input: CreateRoadmapInput, token?: string | null): Promise<BackendRoadmap> {
  return request<BackendRoadmap>(
    '/roadmaps/creator',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    token,
  );
}

export async function adoptRoadmap(
  roadmapId: string,
  input: { opportunityId?: string; targetOpportunityId?: string; targetDeadline?: string; calendarSyncEnabled?: boolean } = {},
  token?: string | null,
) {
  return request<RoadmapAdoptionResponse>(
    `/roadmaps/adopt/${encodeURIComponent(roadmapId)}`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    token,
  );
}

export async function fetchRoadmapCalendarExport(enrollmentId: string, token?: string | null) {
  return request<RoadmapCalendarExport>(
    `/roadmaps/enrollments/${encodeURIComponent(enrollmentId)}/calendar`,
    {},
    token,
  );
}
