import { SupabaseClient } from '@supabase/supabase-js';
import { GetAuthToken, requestProductApi } from './productApi';
import { toSafeUUID } from '../utils/auth';

export type ApplicationStatus = 'draft' | 'submitted' | 'interview' | 'offer' | 'rejected' | 'withdrawn' | 'no_response';

/** The active forward stages of an application, in order. Terminal states
 * (rejected/withdrawn) are intentionally excluded. Used to render the pipeline
 * stepper and to compute the next "Advance" stage. */
export const APPLICATION_PIPELINE: ApplicationStatus[] = ['draft', 'submitted', 'interview', 'offer'];

/** Returns the next forward pipeline stage, or null when there is none
 * (already at 'offer', or in a terminal state like rejected/withdrawn). */
export function getNextApplicationStage(status: ApplicationStatus): ApplicationStatus | null {
  const index = APPLICATION_PIPELINE.indexOf(status);
  if (index === -1 || index >= APPLICATION_PIPELINE.length - 1) {
    return null;
  }
  return APPLICATION_PIPELINE[index + 1];
}

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
  autoApply?: {
    id: string;
    state: string;
    receipt?: string | null;
    receiptStatus?: 'confirmed' | 'self_reported' | 'pending' | 'sending' | null;
  };
}

export interface TrackApplicationInput {
  opportunityId: string;
  status?: ApplicationStatus;
  submittedAt?: string;
  metadata?: Record<string, unknown>;
}

interface ApplicationConfirmationRecord {
  id: string;
  status: ApplicationStatus;
  version: number;
}

export async function openTrackedApplication(opportunityId: string, getToken: GetAuthToken) {
  const record = await requestProductApi<ApplicationConfirmationRecord>('/me/applications', {
    method: 'POST',
    body: JSON.stringify({
      opportunityId,
      status: 'draft',
      metadata: { application_opened_at: new Date().toISOString() },
    }),
  }, getToken, 10_000);
  return record?.id && typeof record.version === 'number' ? record : null;
}

export async function confirmTrackedApplication(record: ApplicationConfirmationRecord, getToken: GetAuthToken) {
  if (record.status !== 'draft') return true;
  const saved = await requestProductApi<ApplicationConfirmationRecord>(`/me/applications/${encodeURIComponent(record.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'submitted', expectedVersion: record.version }),
  }, getToken, 10_000);
  return saved?.status === 'submitted';
}

function getUserLookupIds(userId: string): string[] {
  return Array.from(new Set([userId, toSafeUUID(userId)]));
}

export function normalizeApplicationStatus(value?: string | null): ApplicationStatus {
  if (value === 'draft' || value === 'submitted' || value === 'interview' || value === 'offer' || value === 'rejected' || value === 'withdrawn' || value === 'no_response') {
    return value;
  }
  if (value === 'interested' || value === 'preparing' || value === 'archived') {
    return 'draft';
  }
  // Legacy alias for the terminal "org never replied" state.
  if (value === 'ghosted') {
    return 'no_response';
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
  const attempt = row.auto_apply;
  const receiptStatus = attempt?.receiptStatus || attempt?.receipt_status;
  const normalizedReceiptStatus = receiptStatus === 'confirmed' || receiptStatus === 'self_reported' ||
    receiptStatus === 'pending' || receiptStatus === 'sending' ? receiptStatus : null;
  const autoApply = typeof attempt?.id === 'string'
    && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(attempt.id)
    && typeof attempt.state === 'string'
    ? { id: attempt.id, state: attempt.state,
      receipt: typeof attempt.receipt === 'string' ? attempt.receipt : null,
      receiptStatus: normalizedReceiptStatus }
    : undefined;

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
    ...(autoApply ? { autoApply } : {}),
  };
}

export async function fetchTrackedApplications(getAuthToken: GetAuthToken): Promise<AppliedOpportunity[]> {
  const payload = await requestProductApi<unknown>(
    '/me/applications', undefined, getAuthToken, undefined, { throwOnError: true },
  );
  const rows = getApiRows(payload);
  if (!rows) throw new Error('Invalid application list response');
  return rows.map(normaliseApiApplication).filter((application) => application.opportunity_id);
}

export async function updateTrackedApplicationStatus(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string,
  status: ApplicationStatus,
  getAuthToken?: GetAuthToken,
  // Optional one-line takeaway (e.g. after a rejection). The backend attaches
  // it to the outcome signal it records for the ranking engine.
  reflection?: string,
): Promise<boolean> {
  const apiResult = await requestProductApi<any>(
    `/me/applications/${encodeURIComponent(applicationId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        ...(reflection?.trim() ? { reflection: reflection.trim() } : {}),
      }),
    },
    getAuthToken,
    undefined,
    status === 'submitted' ? { throwOnError: true } : undefined,
  );
  if (apiResult !== null) {
    return true;
  }

  if (status === 'submitted') return false;

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
    }, { onConflict: 'user_id,opportunity_id', ignoreDuplicates: status === 'draft' });

  return !error;
}
