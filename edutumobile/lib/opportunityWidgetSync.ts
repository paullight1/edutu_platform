import { Platform } from 'react-native';
import type { Opportunity } from '../packages/core/src/types/opportunity';
import { getDeadlineBadge } from '../packages/core/src/utils/deadline';
import {
  syncOpportunityWidgetSnapshot,
  type OpportunityWidgetSnapshot,
  type OpportunityWidgetItem,
} from './mobileControl';
import { updateOpportunityWidget, type OpportunityWidgetProps } from '../widgets/OpportunityWidget';

// The native Android widget reads this file (from the app's documents dir) as
// its personalised, already-ranked source of truth. iOS uses expo-widgets'
// snapshot channel instead, so this is Android-only.
const ANDROID_WIDGET_ITEMS_FILE = 'edutu_widget_items.json';

type SyncOptions = NonNullable<Parameters<typeof syncOpportunityWidgetSnapshot>[0]>;

function formatWidgetDeadline(deadline?: string | null): string {
  const badge = getDeadlineBadge(deadline);
  // Widgets show "Open now" instead of "Deadline not listed" for empty slots.
  if (badge.level === 'none') return 'Open now';
  // A relative countdown is only useful when the deadline is actually near.
  // Beyond a month ("normal"), "40 days left" is noise — show the date instead.
  if (badge.level === 'normal' && badge.date) return badge.date;
  return badge.label;
}

/** Closing soon (today/tomorrow/critical/urgent) → the widget flags it red. */
function isDeadlineUrgent(deadline?: string | null): boolean {
  const badge = getDeadlineBadge(deadline);
  return (
    badge.isUrgent || badge.level === 'today' || badge.level === 'tomorrow'
  );
}

function firstRenderableItem(snapshot: OpportunityWidgetSnapshot): OpportunityWidgetItem | null {
  return snapshot.items.find((item) => Boolean(item.title)) ?? null;
}

function mapWidgetItem(item: OpportunityWidgetItem) {
  return {
    title: item.title,
    provider: item.organization || 'Edutu',
    deadline: formatWidgetDeadline(item.deadline),
    category: item.category || 'Opportunity',
    location: item.location || 'Global',
    match: item.match,
    urgent: isDeadlineUrgent(item.deadline),
    deepLink: item.deepLink,
  };
}

export function getOpportunityWidgetProps(snapshot: OpportunityWidgetSnapshot): OpportunityWidgetProps {
  const item = firstRenderableItem(snapshot);
  const items = snapshot.items.filter((snapshotItem) => Boolean(snapshotItem.title)).map(mapWidgetItem);

  return {
    title: item?.title || snapshot.title || snapshot.emptyText,
    provider: item?.organization || 'Edutu',
    deadline: formatWidgetDeadline(item?.deadline),
    category: item?.category || 'Opportunity',
    location: item?.location || 'Global',
    match: item?.match,
    urgent: isDeadlineUrgent(item?.deadline),
    deepLink: item?.deepLink || 'edutu://opportunities',
    items,
  };
}

/**
 * Persist the personalised, ranked snapshot where the native Android widget
 * provider reads it. Raw deadlines are kept (the native side formats + expiry-
 * checks them each render), and match scores travel through so the widget can
 * show "N% match" instead of a generic "Top pick".
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
    file.write(JSON.stringify(items));
  } catch {
    // Best effort — the native widget falls back to its own network fetch.
  }
}

export async function updateOpportunityWidgetFromSnapshot(snapshot: OpportunityWidgetSnapshot): Promise<void> {
  try {
    writeAndroidWidgetItems(snapshot);
    updateOpportunityWidget(getOpportunityWidgetProps(snapshot));
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
