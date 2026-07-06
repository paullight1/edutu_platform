import { Platform } from 'react-native';
import type { Opportunity } from '../packages/core/src/types/opportunity';
import { getDeadlineBadge } from '../packages/core/src/utils/deadline';
import {
  syncOpportunityWidgetSnapshot,
  type OpportunityWidgetSnapshot,
  type OpportunityWidgetItem,
} from './mobileControl';
import {
  updateOpportunityWidgetTimeline,
  type OpportunityWidgetProps,
  type OpportunityWidgetTimelineEntry,
} from '../widgets/OpportunityWidget';

// The native Android widget reads this file (from the app's documents dir) as
// its personalised, already-ranked source of truth. iOS uses expo-widgets'
// timeline channel instead, so this is Android-only.
const ANDROID_WIDGET_ITEMS_FILE = 'edutu_widget_items.json';

// How many upcoming midnights get their own iOS timeline entry. Each entry
// re-renders the widget with countdown text recomputed for that day, so
// "3 days left" ticks down even when the app never runs. Two weeks covers
// every relative label we show ("Closes today" … "14 days left") before the
// background task or next app open replaces the timeline anyway.
const TIMELINE_DAYS = 14;

type SyncOptions = NonNullable<Parameters<typeof syncOpportunityWidgetSnapshot>[0]>;

function formatWidgetDeadline(deadline?: string | null, now?: Date): string {
  const badge = getDeadlineBadge(deadline, now);
  // Widgets show "Open now" instead of "Deadline not listed" for empty slots.
  if (badge.level === 'none') return 'Open now';
  // A relative countdown is only useful when the deadline is actually near.
  // Beyond a month ("normal"), "40 days left" is noise — show the date instead.
  if (badge.level === 'normal' && badge.date) return badge.date;
  return badge.label;
}

/** Closing soon (today/tomorrow/critical/urgent) → the widget flags it red. */
function isDeadlineUrgent(deadline?: string | null, now?: Date): boolean {
  const badge = getDeadlineBadge(deadline, now);
  return (
    badge.isUrgent || badge.level === 'today' || badge.level === 'tomorrow'
  );
}

/** Items whose deadline has passed as of `now` must not occupy a widget slot. */
function isExpired(item: OpportunityWidgetItem, now?: Date): boolean {
  return getDeadlineBadge(item.deadline, now).level === 'expired';
}

function renderableItems(snapshot: OpportunityWidgetSnapshot, now?: Date): OpportunityWidgetItem[] {
  return snapshot.items.filter((item) => Boolean(item.title) && !isExpired(item, now));
}

function mapWidgetItem(item: OpportunityWidgetItem, now?: Date) {
  return {
    title: item.title,
    provider: item.organization || 'Edutu',
    deadline: formatWidgetDeadline(item.deadline, now),
    category: item.category || 'Opportunity',
    location: item.location || 'Global',
    match: item.match,
    urgent: isDeadlineUrgent(item.deadline, now),
    deepLink: item.deepLink,
  };
}

export function getOpportunityWidgetProps(
  snapshot: OpportunityWidgetSnapshot,
  now: Date = new Date(),
): OpportunityWidgetProps {
  const renderable = renderableItems(snapshot, now);
  const item = renderable[0] ?? null;
  const items = renderable.map((renderableItem) => mapWidgetItem(renderableItem, now));

  return {
    title: item?.title || snapshot.title || snapshot.emptyText,
    provider: item?.organization || 'Edutu',
    deadline: formatWidgetDeadline(item?.deadline, now),
    category: item?.category || 'Opportunity',
    location: item?.location || 'Global',
    match: item?.match,
    urgent: isDeadlineUrgent(item?.deadline, now),
    deepLink: item?.deepLink || 'edutu://opportunities',
    items,
  };
}

/**
 * One entry for right now plus one per upcoming local midnight. WidgetKit
 * swaps entries on-device at each date, so deadline countdowns stay correct
 * ("2 days left" → "Closes tomorrow" → "Closes today") and expired items drop
 * off — all without network access or a background wake-up.
 */
export function getOpportunityWidgetTimeline(
  snapshot: OpportunityWidgetSnapshot,
  now: Date = new Date(),
): OpportunityWidgetTimelineEntry[] {
  const entries: OpportunityWidgetTimelineEntry[] = [
    { date: now, props: getOpportunityWidgetProps(snapshot, now) },
  ];

  // Relative labels only change day to day when an item has a parseable
  // deadline; a single entry is enough otherwise.
  const hasDatedDeadline = snapshot.items.some(
    (item) => getDeadlineBadge(item.deadline, now).daysLeft !== null,
  );
  if (!hasDatedDeadline) return entries;

  for (let day = 1; day <= TIMELINE_DAYS; day += 1) {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day);
    entries.push({ date: midnight, props: getOpportunityWidgetProps(snapshot, midnight) });
  }
  return entries;
}

/**
 * Persist the personalised, ranked snapshot where the native Android widget
 * provider reads it. Raw deadlines are kept (the native side formats + expiry-
 * checks them each render), and match scores travel through so the widget can
 * show "N% match" instead of a generic "Top pick". `syncedAt` lets the widget
 * judge staleness: it re-fetches its generic fallback once this list is a day
 * old and stops preferring it after a week.
 */
function writeAndroidWidgetItems(snapshot: OpportunityWidgetSnapshot): void {
  if (Platform.OS !== 'android') return;
  try {
    // Lazily required so the native module isn't pulled in on iOS or under
    // Jest (where it isn't available and would break module load).
    const { File, Paths } =
      require('expo-file-system') as typeof import('expo-file-system');
    const items = snapshot.items
      .filter((item) => Boolean(item.title))
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        title: item.title,
        organization: item.organization || 'Edutu',
        category: item.category || '',
        deadline: item.deadline || '',
        match: typeof item.match === 'number' ? Math.round(item.match) : 0,
      }));

    const file = new File(Paths.document, ANDROID_WIDGET_ITEMS_FILE);
    if (file.exists) {
      file.delete();
    }
    file.create();
    file.write(JSON.stringify({ syncedAt: Date.now(), items }));
  } catch {
    // Best effort — the native widget falls back to its own network fetch.
  }
}

export async function updateOpportunityWidgetFromSnapshot(snapshot: OpportunityWidgetSnapshot): Promise<void> {
  try {
    writeAndroidWidgetItems(snapshot);
    updateOpportunityWidgetTimeline(getOpportunityWidgetTimeline(snapshot));
  } catch {
    // Native widget updates are best-effort and must never block app startup or data loading.
  }
}

export async function syncAndUpdateOpportunityWidgetSnapshot(
  options: SyncOptions & { opportunities?: Opportunity[] } = {},
): Promise<OpportunityWidgetSnapshot> {
  const snapshot = await syncOpportunityWidgetSnapshot(options);
  await updateOpportunityWidgetFromSnapshot(snapshot);
  return snapshot;
}
