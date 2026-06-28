import { SupabaseClient } from '@supabase/supabase-js';
import { GetAuthToken, requestProductApi } from './productApi';
import { toSafeUUID } from '../utils/auth';

export type ApplicationStatus = 'draft' | 'submitted' | 'interview' | 'offer' | 'rejected' | 'withdrawn';

export interface AppliedOpportunity {
  id: string;
  opportunity_id: string;
  status: ApplicationStatus;
  submitted_at: string | null;
  title: string;
  organization: string;
  deadline: string | null;
  location: string;
  image: string | null;
  category: string;
}

export interface TrackApplicationInput {
  opportunityId: string;
  status?: ApplicationStatus;
  submittedAt?: string;
  metadata?: Record<string, unknown>;
}

function getUserLookupIds(userId: string): string[] {
  return Array.from(new Set([userId, toSafeUUID(userId)]));
}

export function normalizeApplicationStatus(value?: string | null): ApplicationStatus {
  if (value === 'draft' || value === 'submitted' || value === 'interview' || value === 'offer' || value === 'rejected' || value === 'withdrawn') {
    return value;
  }
  if (value === 'interested' || value === 'preparing' || value === 'archived') {
    return 'draft';
  }
  if (value === 'applied') {
    return 'submitted';
  }
  if (value === 'interviewing') {
    return 'interview';
  }
  if (value === 'accepted') {
    return 'offer';
  }
  return 'submitted';
}

function getApiRows(payload: any): any[] | null {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.applications)) return payload.applications;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  return null;
}

function normaliseApiApplication(row: any): AppliedOpportunity {
  const opportunity = row.opportunity || row.opportunities || row;
  const opportunityId = row.opportunityId || row.opportunity_id || opportunity.id;

  return {
    id: row.applicationId || row.application_id || row.id || opportunityId,
    opportunity_id: opportunityId,
    status: normalizeApplicationStatus(row.status),
    submitted_at: row.submittedAt || row.submitted_at || row.createdAt || row.created_at || null,
    title: opportunity.title || 'Opportunity',
    organization: opportunity.organization || 'Unknown organization',
    deadline: opportunity.deadline || opportunity.close_date || null,
    location: opportunity.location || 'Worldwide',
    image: opportunity.imageUrl || opportunity.image_url || opportunity.image || null,
    category: opportunity.category || 'Opportunity',
  };
}

export async function fetchTrackedApplications(
  supabase: SupabaseClient,
  userId: string,
  getAuthToken?: GetAuthToken,
): Promise<AppliedOpportunity[]> {
  const payload = await requestProductApi<any>('/me/applications', undefined, getAuthToken);
  const apiRows = getApiRows(payload);
  if (apiRows) {
    return apiRows.map(normaliseApiApplication).filter((application) => application.opportunity_id);
  }

  const { data: rows, error } = await supabase
    .from('opportunity_applications')
    .select('id, opportunity_id, status, submitted_at, created_at')
    .in('user_id', getUserLookupIds(userId))
    .order('submitted_at', { ascending: false });

  if (error) throw error;

  const uniqueRows = Array.from(
    new Map((rows || []).map((row: any) => [row.opportunity_id, row])).values()
  );
  const opportunityIds = uniqueRows.map((row: any) => row.opportunity_id);

  if (opportunityIds.length === 0) {
    return [];
  }

  const { data: opps, error: oppError } = await supabase
    .from('opportunities')
    .select('id, title, organization, deadline, close_date, location, image_url, category')
    .in('id', opportunityIds);

  if (oppError) throw oppError;

  return uniqueRows.map((row: any) => {
    const opp = (opps || []).find((item: any) => item.id === row.opportunity_id);
    return {
      id: row.id,
      opportunity_id: row.opportunity_id,
      status: normalizeApplicationStatus(row.status),
      submitted_at: row.submitted_at || row.created_at || null,
      title: opp?.title || 'Opportunity',
      organization: opp?.organization || 'Unknown organization',
      deadline: opp?.deadline || opp?.close_date || null,
      location: opp?.location || 'Worldwide',
      image: opp?.image_url || null,
      category: opp?.category || 'Opportunity',
    };
  });
}

export async function updateTrackedApplicationStatus(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string,
  status: ApplicationStatus,
  getAuthToken?: GetAuthToken,
): Promise<boolean> {
  const apiResult = await requestProductApi<any>(
    `/me/applications/${encodeURIComponent(applicationId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
    getAuthToken,
  );
  if (apiResult !== null) {
    return true;
  }

  const { error } = await supabase
    .from('opportunity_applications')
    .update({ status })
    .eq('id', applicationId)
    .in('user_id', getUserLookupIds(userId));

  return !error;
}

export async function trackOpportunityApplication(
  supabase: SupabaseClient,
  userId: string,
  input: TrackApplicationInput,
  getAuthToken?: GetAuthToken,
): Promise<boolean> {
  const submittedAt = input.submittedAt || new Date().toISOString();
  const status = input.status || 'submitted';
  const apiResult = await requestProductApi<any>(
    '/me/applications',
    {
      method: 'POST',
      body: JSON.stringify({
        opportunityId: input.opportunityId,
        status,
        metadata: input.metadata,
      }),
    },
    getAuthToken,
  );
  if (apiResult !== null) {
    return true;
  }

  const { error } = await supabase
    .from('opportunity_applications')
    .upsert({
      user_id: userId,
      opportunity_id: input.opportunityId,
      status,
      submitted_at: submittedAt,
      updated_at: new Date().toISOString(),
      metadata: input.metadata,
    }, { onConflict: 'user_id,opportunity_id' });

  return !error;
}
