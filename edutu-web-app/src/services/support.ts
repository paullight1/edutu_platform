import { getApiBaseUrl } from '../lib/apiBaseUrl';
import { getLocalDevAuthHeaders } from '../lib/localDevAuthHeaders';

export type SupportRequestType = 'support' | 'bug';

export interface SupportRequestInput {
  type: SupportRequestType;
  name?: string;
  email: string;
  subject: string;
  message: string;
  /** Optional diagnostic context (app, url, userAgent, userId, …). */
  context?: Record<string, string>;
}

/**
 * Sends a support request / bug report to the backend, which emails it to the
 * Edutu support inbox. Works for signed-out users — the auth token is attached
 * only when one is available, and the submitter's email travels in the body.
 */
export async function submitSupportRequest(
  input: SupportRequestInput,
  token?: string | null
): Promise<void> {
  const apiBaseUrl = getApiBaseUrl('Support API');

  const response = await fetch(`${apiBaseUrl}/support`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getLocalDevAuthHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const data = (await response.json()) as { message?: unknown };
      if (typeof data?.message === 'string') detail = data.message;
    } catch {
      // Non-JSON error body — fall back to a generic message below.
    }
    throw new Error(detail || `Support request failed (${response.status})`);
  }
}
