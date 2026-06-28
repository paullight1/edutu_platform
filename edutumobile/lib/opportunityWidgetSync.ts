import type { Opportunity } from '../packages/core/src/types/opportunity';
import {
  syncOpportunityWidgetSnapshot,
  type OpportunityWidgetSnapshot,
  type OpportunityWidgetItem,
} from './mobileControl';
import { updateOpportunityWidget, type OpportunityWidgetProps } from '../widgets/OpportunityWidget';

type SyncOptions = NonNullable<Parameters<typeof syncOpportunityWidgetSnapshot>[0]>;

function formatWidgetDeadline(deadline?: string | null): string {
  if (!deadline) {
    return 'Open now';
  }

  const deadlineTime = Date.parse(deadline);
  if (!Number.isFinite(deadlineTime)) {
    return deadline;
  }

  const days = Math.ceil((deadlineTime - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) {
    return 'Deadline passed';
  }

  if (days === 0) {
    return 'Due today';
  }

  if (days === 1) {
    return 'Due tomorrow';
  }

  if (days <= 30) {
    return `${days} days left`;
  }

  return new Date(deadlineTime).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
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
    deepLink: item?.deepLink || 'edutu://opportunities',
    items,
  };
}

export async function updateOpportunityWidgetFromSnapshot(snapshot: OpportunityWidgetSnapshot): Promise<void> {
  try {
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
