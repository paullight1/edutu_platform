import { enqueueSignal } from './signalQueue';

export type OpportunitySignalType =
  | 'view'
  | 'click'
  | 'save'
  | 'dismiss'
  | 'apply'
  | 'share'
  | 'chat_like'
  | 'chat_dislike'
  | 'recommended_in_chat'
  // Served-but-not-clicked exposure ({surface, position} in details).
  | 'impression'
  // Time actually spent reading a detail screen ({seconds} in details).
  | 'dwell'
  // Non-item browse intent — no opportunityId; payload rides in details.
  | 'search'
  | 'category_view';

/**
 * Typed "not interested" reasons. Each routes differently server-side:
 * wrong_field excludes the category (taste), the others only hide the item.
 */
export type DismissReason =
  | 'not_eligible'
  | 'wrong_field'
  | 'already_applied'
  | 'deadline_too_soon';

export interface OpportunitySignalInput {
  /** Required for every signal type except search/category_view. */
  opportunityId?: string;
  signalType: OpportunitySignalType;
  signalValue?: number;
  reason?: DismissReason;
  source?: string;
  context?: string;
  details?: Record<string, unknown>;
}

const NON_ITEM_SIGNAL_TYPES: OpportunitySignalType[] = ['search', 'category_view'];

/**
 * Records a behavioral signal for the recommendation engine. Signals are
 * persisted to a local queue and delivered in batches with retry (see
 * signalQueue.ts) — a dropped connection or auth hiccup no longer silently
 * loses them. Returns false only for locally-invalid input.
 */
export async function recordOpportunitySignal(
  input: OpportunitySignalInput,
  getAuthToken?: () => Promise<string | null | undefined>,
): Promise<boolean> {
  const isNonItem = NON_ITEM_SIGNAL_TYPES.includes(input.signalType);
  if (!input.opportunityId && !isNonItem) {
    return false;
  }

  await enqueueSignal(
    {
      source: 'mobile',
      ...input,
    },
    getAuthToken,
  );

  return true;
}
