import type { Opportunity } from '../types/opportunity';
import { productApiRequest } from './productApi';

export type ApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'accepted' | 'rejected';
type DatabaseApplicationStatus = 'draft' | 'submitted' | 'interview' | 'offer' | 'rejected' | 'withdrawn';

export interface ApplicationRecord {
  id: string;
  user_id: string;
  opportunity_id: string;
  opportunity_title: string;
  opportunity_category: string;
  status: ApplicationStatus;
  applied_at: string;
  notes: string | null;
}

interface ApplicationRow {
  id: string;
  user_id: string;
  opportunity_id: string;
  status: DatabaseApplicationStatus;
  submitted_at: string | null;
  created_at: string;
  notes: string | null;
  metadata?: {
    opportunity_title?: string;
    opportunity_category?: string;
  } | null;
}

interface OpportunitySummary {
  id: string;
  title: string | null;
  category: string | null;
}

type ProductApplicationStatus = DatabaseApplicationStatus;

type ApiApplicationRecord = Partial<ApplicationRecord> & {
  userId?: string;
  opportunityId?: string;
  opportunityTitle?: string;
  opportunityCategory?: string;
  appliedAt?: string;
  submittedAt?: string | null;
  submitted_at?: string | null;
  createdAt?: string;
  created_at?: string;
  metadata?: {
    opportunity_title?: string;
    opportunityTitle?: string;
    opportunity_category?: string;
    opportunityCategory?: string;
  } | null;
  opportunity?: Partial<Pick<Opportunity, 'id' | 'title' | 'category'>>;
};

function extractApiRows<T>(response: T[] | { data?: T[]; applications?: T[]; items?: T[] } | null | undefined): T[] {
  if (Array.isArray(response)) return response;
  return response?.applications ?? response?.items ?? response?.data ?? [];
}

function toAppStatus(status: string): ApplicationStatus {
  switch (status) {
    case 'interested':
    case 'preparing':
      return 'draft';
    case 'applied':
      return 'submitted';
    case 'interviewing':
    case 'interview':
      return 'under_review';
    case 'accepted':
    case 'offer':
      return 'accepted';
    case 'archived':
    case 'withdrawn':
      return 'rejected';
    case 'draft':
    case 'submitted':
    case 'rejected':
      return status;
    default:
      return 'submitted';
  }
}

function toProductStatus(status: ApplicationStatus): ProductApplicationStatus {
  switch (status) {
    case 'draft':
      return 'draft';
    case 'submitted':
      return 'submitted';
    case 'under_review':
      return 'interview';
    case 'accepted':
      return 'offer';
    case 'rejected':
      return status;
  }
}

function mapApiApplication(
  row: ApiApplicationRecord,
  fallbackUserId: string,
  fallbackOpportunity?: Pick<Opportunity, 'id' | 'title' | 'category'>
): ApplicationRecord {
  const opportunity = row.opportunity ?? fallbackOpportunity;
  const opportunityId = row.opportunity_id ?? row.opportunityId ?? opportunity?.id ?? fallbackOpportunity?.id ?? '';

  return {
    id: row.id ?? `${fallbackUserId}:${opportunityId}`,
    user_id: row.user_id ?? row.userId ?? fallbackUserId,
    opportunity_id: opportunityId,
    opportunity_title:
      row.opportunity_title ??
      row.opportunityTitle ??
      row.metadata?.opportunity_title ??
      row.metadata?.opportunityTitle ??
      opportunity?.title ??
      'Opportunity',
    opportunity_category:
      row.opportunity_category ??
      row.opportunityCategory ??
      row.metadata?.opportunity_category ??
      row.metadata?.opportunityCategory ??
      opportunity?.category ??
      'General',
    status: toAppStatus(row.status ?? 'applied'),
    applied_at:
      row.applied_at ??
      row.appliedAt ??
      row.submitted_at ??
      row.submittedAt ??
      row.created_at ??
      row.createdAt ??
      new Date().toISOString(),
    notes: row.notes ?? null,
  };
}

function hasToken(token?: string | null): token is string {
  return Boolean(token?.trim());
}

export async function getApplications(userId: string, token?: string | null): Promise<ApplicationRecord[]> {
  if (!hasToken(token)) {
    return [];
  }

  const response = await productApiRequest<ApiApplicationRecord[] | { data?: ApiApplicationRecord[]; applications?: ApiApplicationRecord[]; items?: ApiApplicationRecord[] }>(
    '/me/applications',
    token
  );
  return extractApiRows(response).map((row) => mapApiApplication(row, userId));
}

export interface AddApplicationOptions {
  notes?: string;
  status?: ApplicationStatus;
}

export async function addApplication(
  userId: string,
  opportunity: Pick<Opportunity, 'id' | 'title' | 'category'>,
  options: AddApplicationOptions = {},
  token?: string | null
): Promise<ApplicationRecord | null> {
  if (!hasToken(token)) {
    return null;
  }

  const intendedStatus = options.status ?? 'draft';
  const notes = options.notes;
  const response = await productApiRequest<ApiApplicationRecord | null>('/me/applications', token, {
    method: 'POST',
    body: JSON.stringify({
      opportunityId: opportunity.id,
      status: toProductStatus(intendedStatus),
      notes: notes || null,
      metadata: {
        opportunity_title: opportunity.title,
        opportunity_category: opportunity.category,
      },
    })
  });
  const record = response
    ? mapApiApplication(response, userId, opportunity)
    : mapApiApplication({}, userId, opportunity);
  return { ...record, status: intendedStatus };
}

export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
  token?: string | null
): Promise<ApplicationRecord> {
  if (!hasToken(token)) {
    throw new Error('A signed-in session is required to update applications.');
  }

  const response = await productApiRequest<ApiApplicationRecord>(
    `/me/applications/${encodeURIComponent(id)}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({ status: toProductStatus(status) })
    }
  );
  return mapApiApplication(response, '');
}

export async function removeApplication(id: string, token?: string | null): Promise<void> {
  if (!hasToken(token)) {
    throw new Error('A signed-in session is required to remove applications.');
  }

  await productApiRequest<void>(`/me/applications/${encodeURIComponent(id)}`, token, {
    method: 'DELETE'
  });
}
