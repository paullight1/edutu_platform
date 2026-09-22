import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl, requestProductApi, type GetAuthToken } from './productApi';
import type { OpportunityJourneyReadResult, OpportunityJourneyView, OpportunityPublicStage } from '../types/opportunityJourney';

/** Read side of PR #98's journey contract; account/stage snapshots work offline. */
export async function listOpportunityJourneys(input: {
  userId: string;
  stage: OpportunityPublicStage;
  getAuthToken: GetAuthToken;
}): Promise<OpportunityJourneyReadResult<OpportunityJourneyView[]>> {
  const key = `opportunity-journey:snapshot:v1:${input.userId}:stage:${input.stage}`;
  try {
    const data = await requestProductApi<OpportunityJourneyView[]>(
      `/me/opportunity-journeys?stage=${encodeURIComponent(input.stage)}`,
      {}, input.getAuthToken,
    );
    if (Array.isArray(data)) {
      // Storage trouble must not discard a successful network response.
      void AsyncStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), data })).catch(() => {});
      return { data, isStale: false, source: 'network' };
    }
  } catch {
    // Use this account's last successful stage snapshot if offline.
  }
  try {
    const raw = await AsyncStorage.getItem(key);
    const cached = raw ? JSON.parse(raw).data : null;
    if (Array.isArray(cached)) return { data: cached, isStale: true, source: 'snapshot' };
  } catch {
    // Missing/corrupt storage is an unavailable read, never a false empty plan.
  }
  return { data: null, isStale: false, source: 'none' };
}

export class OpportunityJourneyApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = 'OpportunityJourneyApiError';
  }
}

export function createJourneyRequestKey() {
  return `mobile-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function getOpportunityJourney(input: {
  userId: string; journeyId: string; getAuthToken: GetAuthToken;
}): Promise<OpportunityJourneyReadResult<OpportunityJourneyView>> {
  const key = `opportunity-journey:snapshot:v1:${input.userId}:journey:${input.journeyId}`;
  const data = await requestProductApi<OpportunityJourneyView>(
    `/me/opportunity-journeys/${encodeURIComponent(input.journeyId)}`, {}, input.getAuthToken,
  );
  if (data?.journey?.id === input.journeyId) {
    void AsyncStorage.setItem(key, JSON.stringify(data)).catch(() => {});
    return { data, isStale: false, source: 'network' };
  }
  try {
    const raw = await AsyncStorage.getItem(key);
    const cached = raw ? JSON.parse(raw) : null;
    if (cached?.journey?.id === input.journeyId) return { data: cached, isStale: true, source: 'snapshot' };
  } catch { /* An unavailable snapshot is not an empty journey. */ }
  return { data: null, isStale: false, source: 'none' };
}

/** Writes never fall back to local success. Keep the key when retrying a request. */
export async function mutateOpportunityJourney(input: {
  userId?: string;
  getAuthToken: GetAuthToken;
  journeyId?: string;
  action?: 'transition' | 'priority' | `tasks/${string}` | 'application-opened' | 'application-confirmed' | 'outcome';
  body: Record<string, unknown> & { idempotencyKey: string };
}): Promise<OpportunityJourneyView> {
  const controller = new AbortController();
  let authTimeout: ReturnType<typeof setTimeout> | undefined;
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const token = await Promise.race([
      input.getAuthToken(),
      new Promise<null>((resolve) => { authTimeout = setTimeout(() => resolve(null), 10000); }),
    ]);
    if (!token) throw new OpportunityJourneyApiError(401, 'Please sign in again to update your plan.');
    const path = input.journeyId
      ? `/${encodeURIComponent(input.journeyId)}/${input.action}` : '';
    const method = input.action === 'transition' || input.action === 'priority' || input.action?.startsWith('tasks/') ? 'PATCH' : 'POST';
    const response = await fetch(`${getApiBaseUrl()}/me/opportunity-journeys${path}`, {
      method, signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input.body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new OpportunityJourneyApiError(response.status,
      typeof data?.message === 'string' ? data.message : 'Your plan could not be updated. Please retry.', data?.code);
    if (!data?.journey?.id) throw new Error('The server did not confirm this update. Refresh your plan before trying again.');
    if (input.userId) {
      // Keep the offline detail consistent with the last acknowledged save.
      // Storage failures never turn a committed server update into a failure.
      await AsyncStorage.setItem(`opportunity-journey:snapshot:v1:${input.userId}:journey:${data.journey.id}`, JSON.stringify(data)).catch(() => {});
    }
    return data as OpportunityJourneyView;
  } finally {
    clearTimeout(timeout);
    clearTimeout(authTimeout);
  }
}
