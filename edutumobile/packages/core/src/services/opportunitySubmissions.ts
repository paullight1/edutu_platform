import type { GetAuthToken } from './productApi';

export type OpportunitySubmissionStatus =
  | 'pending'
  | 'needs_info'
  | 'approved'
  | 'rejected';

export interface OpportunitySubmissionThreadEntry {
  role: 'admin' | 'user';
  message: string;
  at: string;
}

export interface OpportunitySubmission {
  id: string;
  title: string;
  organization: string | null;
  category: string | null;
  type: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  is_remote: boolean | null;
  eligibility: string | null;
  benefits: string | null;
  deadline: string | null;
  apply_url: string | null;
  source_url: string | null;
  image_url: string | null;
  status: OpportunitySubmissionStatus;
  admin_note: string | null;
  user_response: string | null;
  thread: OpportunitySubmissionThreadEntry[] | null;
  approved_opportunity_id: string | null;
  submitted_at: string;
  updated_at: string;
}

export interface SubmitOpportunityInput {
  title: string;
  organization?: string;
  category?: string;
  type?: string;
  summary?: string;
  description?: string;
  location?: string;
  isRemote?: boolean;
  eligibility?: string;
  benefits?: string;
  deadline?: string;
  applyUrl?: string;
  sourceUrl?: string;
}

function getApiBaseUrl() {
  return (process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com').replace(/\/$/, '');
}

async function authedFetch(
  path: string,
  getAuthToken: GetAuthToken,
  init: RequestInit = {},
) {
  const token = await getAuthToken();
  if (!token) throw new Error('You need to be signed in.');

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      (data && (data.message || data.error)) ||
      `Request failed (${response.status})`;
    throw new Error(Array.isArray(message) ? message.join(', ') : String(message));
  }

  return data;
}

export async function submitOpportunity(
  input: SubmitOpportunityInput,
  getAuthToken: GetAuthToken,
): Promise<OpportunitySubmission> {
  // Drop empty strings so optional Zod fields don't fail url/date validation.
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    body[key] = typeof value === 'string' ? value.trim() : value;
  }
  return authedFetch('/opportunity-submissions', getAuthToken, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchMySubmissions(
  getAuthToken: GetAuthToken,
): Promise<OpportunitySubmission[]> {
  const data = await authedFetch('/opportunity-submissions/mine', getAuthToken, {
    method: 'GET',
  });
  return Array.isArray(data) ? data : [];
}

export async function respondToSubmission(
  id: string,
  message: string,
  getAuthToken: GetAuthToken,
  patch?: Partial<SubmitOpportunityInput>,
): Promise<OpportunitySubmission> {
  return authedFetch(`/opportunity-submissions/${id}/respond`, getAuthToken, {
    method: 'PATCH',
    body: JSON.stringify({ message: message.trim(), patch }),
  });
}
