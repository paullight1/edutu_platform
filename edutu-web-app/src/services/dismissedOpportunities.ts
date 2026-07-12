import type { ClerkTokenGetter } from "../lib/clerkToken";
import { recordOpportunitySignal, type DismissReason } from "./opportunitySignals";

/**
 * "Not interested" store (web twin of the mobile dismissedOpportunities
 * service): hides the opportunity locally for instant UX and records a
 * backend dismiss signal so the ranking engine learns across devices. The
 * typed reason routes server-side — wrong_field is taste (category
 * exclusion), the rest only hide the item.
 */

const STORAGE_KEY_PREFIX = "edutu:dismissedOpportunities:v1";
const MAX_DISMISSED_IDS = 200;

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

export function getDismissedOpportunityIds(userId: string | null | undefined): string[] {
  if (!userId) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function addDismissedOpportunityId(userId: string, opportunityId: string): void {
  if (!userId || !opportunityId) return;
  try {
    const next = getDismissedOpportunityIds(userId).filter((id) => id !== opportunityId);
    next.push(opportunityId);
    while (next.length > MAX_DISMISSED_IDS) next.shift();
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // Dismissals never break the feed.
  }
}

export function dismissOpportunity(
  userId: string,
  opportunityId: string,
  getToken: ClerkTokenGetter,
  context?: string,
  reason?: DismissReason,
): void {
  addDismissedOpportunityId(userId, opportunityId);
  void recordOpportunitySignal(
    {
      opportunityId,
      signalType: "dismiss",
      ...(reason ? { reason } : {}),
      context: context ?? "not_interested",
    },
    getToken,
  );
}
