import type { Opportunity } from '../types/opportunity';
import { ProductApiError, productApiRequest } from './productApi';

// App-facing status now mirrors the backend pipeline 1:1 so the true
// draft → submitted → interview → offer journey is preserved (previously
// interview/offer were flattened into under_review/accepted).
export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  // Terminal: the org never replied and the user is closing the loop. Grouped
  // with rejected/withdrawn (never in the active pipeline).
  | 'no_response';
type DatabaseApplicationStatus = ApplicationStatus;

/** The active pipeline stages, in order, for kanban-style rendering. */
export const APPLICATION_PIPELINE: ApplicationStatus[] = [
  'draft',
  'submitted',
  'interview',
  'offer',
];

export interface ApplicationRecord {
  id: string;
  user_id: string;
  opportunity_id: string;
  opportunity_title: string;
  opportunity_category: string;
  status: ApplicationStatus;
  applied_at: string;
  notes: string | null;
  application_opened_at?: string | null;
  version?: number;
}

export interface ApplicationHistoryRecord {
  id: string;
  application_id: string;
  event_type: 'created' | 'status_change' | 'reflection' | 'note' | 'interview';
  previous_status: ApplicationStatus | null;
  next_status: ApplicationStatus | null;
  note: string | null;
  metadata: Record<string, unknown>;
  actor_user_id: string;
  created_at: string;
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
    application_opened_at?: string;
    opportunity_title?: string;
    opportunityTitle?: string;
    opportunity_category?: string;
    opportunityCategory?: string;
  } | null;
  opportunity?: Partial<Pick<Opportunity, 'id' | 'title' | 'category'>>;
};

function extractApiRows<T>(
  response:
    | T[]
    | { data?: T[]; applications?: T[]; items?: T[] }
    | null
    | undefined,
): T[] {
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
    case 'under_review':
      return 'interview';
    case 'accepted':
      return 'offer';
    case 'archived':
      return 'withdrawn';
    case 'ghosted':
      return 'no_response';
    case 'draft':
    case 'submitted':
    case 'interview':
    case 'offer':
    case 'rejected':
    case 'withdrawn':
    case 'no_response':
      return status;
    default:
      return 'submitted';
  }
}

function toProductStatus(status: ApplicationStatus): ProductApplicationStatus {
  return status;
}

function mapApiApplication(
  row: ApiApplicationRecord,
  fallbackUserId: string,
  fallbackOpportunity?: Pick<Opportunity, 'id' | 'title' | 'category'>,
): ApplicationRecord {
  const opportunity = row.opportunity ?? fallbackOpportunity;
  const opportunityId =
    row.opportunity_id ??
    row.opportunityId ??
    opportunity?.id ??
    fallbackOpportunity?.id ??
    '';

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
    application_opened_at:
      row.application_opened_at ?? row.metadata?.application_opened_at ?? null,
    version: row.version,
  };
}

function hasToken(token?: string | null): token is string {
  return Boolean(token?.trim());
}

export async function getApplications(
  userId: string,
  token?: string | null,
  options: { signal?: AbortSignal } = {},
): Promise<ApplicationRecord[]> {
  if (!hasToken(token)) {
    throw new ProductApiError('Sign in again to load your applications.', 401);
  }

  const response = await productApiRequest<
    | ApiApplicationRecord[]
    | {
        data?: ApiApplicationRecord[];
        applications?: ApiApplicationRecord[];
        items?: ApiApplicationRecord[];
      }
  >('/me/applications', token, {
    timeoutMs: 10_000,
    maxAttempts: 1,
    ...options,
  });
  return extractApiRows(response).map((row) => mapApiApplication(row, userId));
}

export interface AddApplicationOptions {
  notes?: string;
  status?: ApplicationStatus;
  openedExternally?: boolean;
}

export interface ApplicationPage {
  items: ApplicationRecord[];
  nextCursor: string | null;
  total: number;
  filteredTotal: number;
  counts: Partial<Record<ApplicationStatus, number>>;
}

export async function getApplicationOpportunityIds(
  token: string,
): Promise<string[]> {
  if (!hasToken(token))
    throw new ProductApiError('Sign in again to load your applications.', 401);
  const response = await productApiRequest<{ opportunityIds: string[] }>(
    '/me/applications/opportunity-ids',
    token,
    { timeoutMs: 10_000, maxAttempts: 1 },
  );
  return response.opportunityIds;
}

export async function recordApplicationEvent(
  id: string,
  event:
    | 'application_opened'
    | 'application_prompt_snoozed'
    | 'application_save_failed',
  token: string,
): Promise<void> {
  try {
    await productApiRequest(
      `/me/applications/${encodeURIComponent(id)}/events`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ eventId: crypto.randomUUID(), event }),
        timeoutMs: 5_000,
      },
    );
  } catch {
    /* Telemetry failure must never invent or block a saved status. */
  }
}

export async function getApplicationPage(
  userId: string,
  token: string,
  options: {
    cursor?: string | null;
    q?: string;
    status?: ApplicationStatus;
    limit?: number;
    signal?: AbortSignal;
    confirmationDue?: boolean;
  } = {},
): Promise<ApplicationPage> {
  const params = new URLSearchParams();
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.q) params.set('q', options.q);
  if (options.status) params.set('status', options.status);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.confirmationDue) params.set('confirmationDue', 'true');
  const response = await productApiRequest<
    Omit<ApplicationPage, 'items'> & { items: ApiApplicationRecord[] }
  >(`/me/applications/page?${params}`, token, {
    signal: options.signal,
    timeoutMs: 10_000,
    maxAttempts: 1,
  });
  return {
    ...response,
    items: response.items.map((row) => mapApiApplication(row, userId)),
  };
}

export async function getApplication(
  id: string,
  userId: string,
  token: string,
): Promise<ApplicationRecord> {
  const response = await productApiRequest<ApiApplicationRecord>(
    `/me/applications/${encodeURIComponent(id)}`,
    token,
    { timeoutMs: 10_000, maxAttempts: 1 },
  );
  return mapApiApplication(response, userId);
}

export async function addApplication(
  userId: string,
  opportunity: Pick<Opportunity, 'id' | 'title' | 'category'>,
  options: AddApplicationOptions = {},
  token?: string | null,
): Promise<ApplicationRecord> {
  if (!hasToken(token)) {
    throw new ProductApiError('Sign in again to record your application.', 401);
  }

  const intendedStatus = options.status ?? 'draft';
  const notes = options.notes;
  const response = await productApiRequest<ApiApplicationRecord | null>(
    '/me/applications',
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        opportunityId: opportunity.id,
        status: toProductStatus(intendedStatus),
        notes: notes || null,
        metadata: {
          opportunity_title: opportunity.title,
          opportunity_category: opportunity.category,
          ...(options.openedExternally
            ? { application_opened_at: new Date().toISOString() }
            : {}),
        },
      }),
    },
  );
  if (!response?.id)
    throw new ProductApiError(
      'Your application could not be saved. Please try again.',
      502,
    );
  const record = mapApiApplication(response, userId, opportunity);
  if (options.openedExternally)
    void recordApplicationEvent(record.id, 'application_opened', token);
  window.dispatchEvent(
    new CustomEvent('edutu:applications-changed', {
      detail: { userId, application: record },
    }),
  );
  return record;
}

export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
  token?: string | null,
  expectedVersion?: number,
): Promise<ApplicationRecord> {
  if (!hasToken(token)) {
    throw new Error('A signed-in session is required to update applications.');
  }

  const response = await productApiRequest<ApiApplicationRecord>(
    `/me/applications/${encodeURIComponent(id)}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status: toProductStatus(status),
        expectedVersion,
      }),
    },
  );
  if (!response?.id)
    throw new ProductApiError(
      'Your application status could not be saved. Please try again.',
      502,
    );
  return mapApiApplication(response, '');
}

export async function getApplicationHistory(
  id: string,
  token?: string | null,
): Promise<ApplicationHistoryRecord[]> {
  if (!hasToken(token)) return [];
  return productApiRequest<ApplicationHistoryRecord[]>(
    `/me/applications/${encodeURIComponent(id)}/history`,
    token,
    { timeoutMs: 10_000, maxAttempts: 1 },
  );
}

export async function addApplicationReflection(
  id: string,
  reflection: string,
  token?: string | null,
): Promise<ApplicationHistoryRecord> {
  if (!hasToken(token)) {
    throw new Error('A signed-in session is required to save a reflection.');
  }
  return productApiRequest<ApplicationHistoryRecord>(
    `/me/applications/${encodeURIComponent(id)}/reflections`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ reflection }),
    },
  );
}

/**
 * The size of the user's reusable "answer bank" — the essay drafts saved
 * across every application kit. Used to reframe a rejection/no_response
 * closure around the asset that survives it. Best-effort: any failure (no
 * session, network, unavailable route) resolves to 0 so the caller simply
 * omits the line rather than blocking or erroring the closure panel.
 */
export async function fetchAnswerBankCount(
  token?: string | null,
): Promise<number> {
  if (!hasToken(token)) return 0;
  try {
    const response = await productApiRequest<{
      answers?: unknown[];
      count?: number;
    }>('/copilot/answers', token);
    if (typeof response?.count === 'number') return response.count;
    return Array.isArray(response?.answers) ? response.answers.length : 0;
  } catch {
    return 0;
  }
}

export async function removeApplication(
  id: string,
  token?: string | null,
): Promise<void> {
  if (!hasToken(token)) {
    throw new Error('A signed-in session is required to remove applications.');
  }

  await productApiRequest<void>(
    `/me/applications/${encodeURIComponent(id)}`,
    token,
    {
      method: 'DELETE',
    },
  );
}
