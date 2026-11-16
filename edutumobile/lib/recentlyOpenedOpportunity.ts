import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Opportunity } from '@edutu/core/src/types/opportunity';

const STORAGE_PREFIX = '@edutu_recently_opened_opportunity:v1:';

export type RecentlyOpenedOpportunity = Pick<
  Opportunity,
  'id' | 'title' | 'deadline'
> & {
  image?: Opportunity['image'];
  openedAt: string;
};

type Listener = (opportunity: RecentlyOpenedOpportunity | null) => void;

const memoryCache = new Map<string, RecentlyOpenedOpportunity | null>();
const listeners = new Map<string, Set<Listener>>();

function scopeKey(userId?: string | null): string {
  return userId || 'guest';
}

function storageKey(userId?: string | null): string {
  return `${STORAGE_PREFIX}${scopeKey(userId)}`;
}

function isRecentlyOpenedOpportunity(value: unknown): value is RecentlyOpenedOpportunity {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RecentlyOpenedOpportunity>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.title === 'string' &&
    candidate.title.length > 0 &&
    typeof candidate.openedAt === 'string'
  );
}

function publish(userId: string | null | undefined, opportunity: RecentlyOpenedOpportunity | null) {
  const scope = scopeKey(userId);
  memoryCache.set(scope, opportunity);
  listeners.get(scope)?.forEach((listener) => listener(opportunity));
}

export async function getRecentlyOpenedOpportunity(
  userId?: string | null,
): Promise<RecentlyOpenedOpportunity | null> {
  const scope = scopeKey(userId);
  if (memoryCache.has(scope)) return memoryCache.get(scope) ?? null;

  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const opportunity = isRecentlyOpenedOpportunity(parsed) ? parsed : null;
    publish(userId, opportunity);
    return opportunity;
  } catch {
    publish(userId, null);
    return null;
  }
}

export function noteRecentlyOpenedOpportunity(
  opportunity: Opportunity,
  userId?: string | null,
): void {
  if (!opportunity.id || !opportunity.title) return;

  const snapshot: RecentlyOpenedOpportunity = {
    id: opportunity.id,
    title: opportunity.title,
    deadline: opportunity.deadline,
    image: opportunity.image ?? null,
    openedAt: new Date().toISOString(),
  };

  publish(userId, snapshot);
  void AsyncStorage.setItem(storageKey(userId), JSON.stringify(snapshot)).catch(() => undefined);
}

export function subscribeToRecentlyOpenedOpportunity(
  userId: string | null | undefined,
  listener: Listener,
): () => void {
  const scope = scopeKey(userId);
  const scopeListeners = listeners.get(scope) ?? new Set<Listener>();
  scopeListeners.add(listener);
  listeners.set(scope, scopeListeners);

  return () => {
    scopeListeners.delete(listener);
    if (scopeListeners.size === 0) listeners.delete(scope);
  };
}
