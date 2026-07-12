import AsyncStorage from '@react-native-async-storage/async-storage';
import { toSafeUUID } from '../utils/auth';
import { recordOpportunitySignal, type DismissReason } from './opportunitySignals';

const DISMISSED_OPPORTUNITIES_KEY = 'edutu_dismissed_opportunities';

/** Hard cap on remembered dismissals — oldest entries are evicted first (FIFO). */
const MAX_DISMISSED_IDS = 200;

function getStorageKey(userId: string): string {
  return `${DISMISSED_OPPORTUNITIES_KEY}:${toSafeUUID(userId)}`;
}

/**
 * Returns the ids of opportunities this user has dismissed, oldest first.
 * Storage failures degrade to an empty list — dismissals are best-effort.
 */
export async function getDismissedOpportunityIds(userId: string): Promise<string[]> {
  if (!userId) {
    return [];
  }

  try {
    const raw = await AsyncStorage.getItem(getStorageKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

/**
 * Records a dismissed opportunity id for the user. The set is capped at
 * MAX_DISMISSED_IDS with FIFO eviction; re-dismissing an id moves it to the
 * newest slot.
 */
export async function addDismissedOpportunityId(userId: string, opportunityId: string): Promise<void> {
  if (!userId || !opportunityId) {
    return;
  }

  try {
    const existing = await getDismissedOpportunityIds(userId);
    const next = existing.filter(id => id !== opportunityId);
    next.push(opportunityId);

    while (next.length > MAX_DISMISSED_IDS) {
      next.shift();
    }

    await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(next));
  } catch {
    // Ignore persistence failures — dismissals should never break the feed.
  }
}

/**
 * Full "not interested" flow: hides the opportunity locally (instant UX,
 * works offline) AND records a backend `dismiss` signal so the ranking
 * engine learns from it across devices. The typed reason routes server-side:
 * wrong_field (and no reason) = taste → −100 weight + category exclusion;
 * not_eligible / already_applied / deadline_too_soon only hide the item and
 * leave the user's category affinity untouched.
 */
export async function dismissOpportunity(
  userId: string,
  opportunityId: string,
  getAuthToken?: () => Promise<string | null | undefined>,
  context?: string,
  reason?: DismissReason,
): Promise<void> {
  await addDismissedOpportunityId(userId, opportunityId);
  void recordOpportunitySignal(
    {
      opportunityId,
      signalType: 'dismiss',
      ...(reason ? { reason } : {}),
      source: 'mobile',
      context: context ?? 'not_interested',
    },
    getAuthToken,
  );
}

export async function clearDismissedOpportunityIds(userId: string): Promise<void> {
  if (!userId) {
    return;
  }

  try {
    await AsyncStorage.removeItem(getStorageKey(userId));
  } catch {
    // Ignore persistence failures.
  }
}
