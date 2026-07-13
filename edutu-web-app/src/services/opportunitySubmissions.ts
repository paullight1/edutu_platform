import { productApiRequest } from './productApi';

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

export type SubmitOpportunityInput = {
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
};

function cleanBody(input: Record<string, unknown>) {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    body[key] = typeof value === 'string' ? value.trim() : value;
  }
  return body;
}

export async function submitOpportunity(
  input: SubmitOpportunityInput,
  token: string,
): Promise<OpportunitySubmission> {
  return productApiRequest<OpportunitySubmission>('/opportunity-submissions', token, {
    method: 'POST',
    body: JSON.stringify(cleanBody(input)),
  });
}

export async function fetchMySubmissions(
  token: string,
): Promise<OpportunitySubmission[]> {
  const data = await productApiRequest<OpportunitySubmission[]>(
    '/opportunity-submissions/mine',
    token,
    { method: 'GET' },
  );
  return Array.isArray(data) ? data : [];
}

export async function respondToSubmission(
  id: string,
  message: string,
  token: string,
  patch?: Partial<SubmitOpportunityInput>,
): Promise<OpportunitySubmission> {
  return productApiRequest<OpportunitySubmission>(
    `/opportunity-submissions/${id}/respond`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({ message: message.trim(), patch }),
    },
  );
}
