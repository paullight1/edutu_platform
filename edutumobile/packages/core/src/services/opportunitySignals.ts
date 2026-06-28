const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com';

export type OpportunitySignalType =
  | 'view'
  | 'click'
  | 'save'
  | 'dismiss'
  | 'apply'
  | 'chat_like'
  | 'chat_dislike'
  | 'recommended_in_chat';

export interface OpportunitySignalInput {
  opportunityId: string;
  signalType: OpportunitySignalType;
  signalValue?: number;
  source?: string;
  context?: string;
  details?: Record<string, unknown>;
}

export async function recordOpportunitySignal(
  input: OpportunitySignalInput,
  getAuthToken?: () => Promise<string | null | undefined>,
): Promise<boolean> {
  if (!API_BASE_URL || !getAuthToken || !input.opportunityId) {
    return false;
  }

  try {
    const token = await getAuthToken();
    if (!token) {
      return false;
    }

    const response = await fetch(`${API_BASE_URL}/opportunities/signals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        signalValue: 1,
        source: 'mobile',
        ...input,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}
