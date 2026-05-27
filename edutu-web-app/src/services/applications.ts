import { supabase } from '../lib/supabaseClient';
import type { Opportunity } from '../types/opportunity';
import { isProductApiUnavailableError, productApiRequest } from './productApi';

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

type ProductApplicationStatus =
  | 'interested'
  | 'preparing'
  | 'applied'
  | 'interviewing'
  | 'accepted'
  | 'rejected'
  | 'archived';

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
      return 'preparing';
    case 'submitted':
      return 'applied';
    case 'under_review':
      return 'interviewing';
    case 'accepted':
    case 'rejected':
      return status;
  }
}

function toDatabaseStatus(status: ApplicationStatus): DatabaseApplicationStatus {
  switch (status) {
    case 'under_review':
      return 'interview';
    case 'accepted':
      return 'offer';
    default:
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

async function tryProductApi<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (isProductApiUnavailableError(error)) return null;
    throw error;
  }
}

export async function getApplications(userId: string, token?: string | null): Promise<ApplicationRecord[]> {
  if (token) {
    const apiApplications = await tryProductApi(async () => {
      const response = await productApiRequest<ApiApplicationRecord[] | { data?: ApiApplicationRecord[]; applications?: ApiApplicationRecord[]; items?: ApiApplicationRecord[] }>(
        '/me/applications',
        token
      );
      return extractApiRows(response).map((row) => mapApiApplication(row, userId));
    });

    if (apiApplications) return apiApplications;
  }

  const { data, error } = await supabase
    .from('opportunity_applications')
    .select('id, user_id, opportunity_id, status, submitted_at, created_at, notes, metadata')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching applications:', error);
    return [];
  }

  const rows = (data ?? []) as ApplicationRow[];
  if (rows.length === 0) return [];

  const opportunityIds = rows.map((row) => row.opportunity_id);
  const { data: opportunities, error: opportunityError } = await supabase
    .from('opportunities')
    .select('id, title, category')
    .in('id', opportunityIds);

  if (opportunityError) {
    console.error('Error fetching application opportunities:', opportunityError);
  }

  const opportunityMap = new Map(
    ((opportunities ?? []) as OpportunitySummary[]).map((opportunity) => [opportunity.id, opportunity])
  );

  return rows.map((row) => {
    const opportunity = opportunityMap.get(row.opportunity_id);
    return {
      id: row.id,
      user_id: row.user_id,
      opportunity_id: row.opportunity_id,
      opportunity_title:
        opportunity?.title ||
        row.metadata?.opportunity_title ||
        'Opportunity',
      opportunity_category:
        opportunity?.category ||
        row.metadata?.opportunity_category ||
        'General',
      status: toAppStatus(row.status),
      applied_at: row.submitted_at || row.created_at,
      notes: row.notes,
    };
  });
}

export async function addApplication(
  userId: string,
  opportunity: Pick<Opportunity, 'id' | 'title' | 'category'>,
  notes?: string,
  token?: string | null
): Promise<ApplicationRecord | null> {
  if (token) {
    const apiApplication = await tryProductApi(async () => {
      const response = await productApiRequest<ApiApplicationRecord | null>('/me/applications', token, {
        method: 'POST',
        body: JSON.stringify({
          opportunityId: opportunity.id,
          status: 'applied',
          notes: notes || null,
          opportunity,
        })
      });
      return response ? mapApiApplication(response, userId, opportunity) : mapApiApplication({}, userId, opportunity);
    });

    if (apiApplication) return apiApplication;
  }

  const { data, error } = await supabase
    .from('opportunity_applications')
    .upsert({
      user_id: userId,
      opportunity_id: opportunity.id,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      notes: notes || null,
      metadata: {
        opportunity_title: opportunity.title,
        opportunity_category: opportunity.category,
      },
    }, {
      onConflict: 'user_id,opportunity_id',
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding application:', error);
    return null;
  }

  const row = data as ApplicationRow;
  return {
    id: row.id,
    user_id: row.user_id,
    opportunity_id: row.opportunity_id,
    opportunity_title: opportunity.title,
    opportunity_category: opportunity.category,
    status: toAppStatus(row.status),
    applied_at: row.submitted_at || row.created_at,
    notes: row.notes,
  };
}

export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
  token?: string | null
): Promise<ApplicationRecord> {
  if (token) {
    const apiApplication = await tryProductApi(async () => {
      const response = await productApiRequest<ApiApplicationRecord>(
        `/me/applications/${encodeURIComponent(id)}`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: toProductStatus(status) })
        }
      );
      return mapApiApplication(response, '');
    });

    if (apiApplication) return apiApplication;
  }

  const { data, error } = await supabase
    .from('opportunity_applications')
    .update({ status: toDatabaseStatus(status) })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating application status:', error);
    throw error;
  }

  const row = data as ApplicationRow;
  return {
    id: row.id,
    user_id: row.user_id,
    opportunity_id: row.opportunity_id,
    opportunity_title: row.metadata?.opportunity_title || 'Opportunity',
    opportunity_category: row.metadata?.opportunity_category || 'General',
    status: toAppStatus(row.status),
    applied_at: row.submitted_at || row.created_at,
    notes: row.notes,
  };
}

export async function removeApplication(id: string, token?: string | null): Promise<void> {
  if (token) {
    const apiRemoved = await tryProductApi(async () => {
      await productApiRequest<void>(`/me/applications/${encodeURIComponent(id)}`, token, {
        method: 'DELETE'
      });
      return true;
    });

    if (apiRemoved) return;
  }

  const { error } = await supabase
    .from('opportunity_applications')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error removing application:', error);
    throw error;
  }
}
