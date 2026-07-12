import { type ClerkTokenGetter } from "../lib/clerkToken";
import { enqueueSignal } from "./signalQueue";

/**
 * Engagement signals mirrored to the backend recommender
 * (POST /opportunities/signals/batch). Signals persist to a localStorage
 * queue with batched, retried delivery (see signalQueue.ts) — parity with
 * mobile, and nothing is silently lost to an auth hiccup anymore.
 */

export type OpportunitySignalType =
  | "view"
  | "click"
  | "save"
  | "dismiss"
  | "apply"
  | "share"
  | "chat_like"
  | "chat_dislike"
  | "recommended_in_chat"
  // Served-but-not-clicked exposure ({surface, position} in details).
  | "impression"
  // Time actually spent reading a detail view ({seconds} in details).
  | "dwell"
  // Non-item browse intent — no opportunityId; payload rides in details.
  | "search"
  | "category_view";

/**
 * Typed "not interested" reasons. Each routes differently server-side:
 * wrong_field excludes the category (taste), the others only hide the item.
 */
export type DismissReason =
  | "not_eligible"
  | "wrong_field"
  | "already_applied"
  | "deadline_too_soon";

const NON_ITEM_SIGNAL_TYPES: OpportunitySignalType[] = ["search", "category_view"];

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

/** Local interaction vocabulary used by usePersonalization.trackInteraction. */
export type LocalInteractionType = "view" | "apply" | "bookmark" | "share";

export interface InteractionSignalOptions {
  value?: number;
  context?: string;
}

export interface MappedSignal {
  signalType: OpportunitySignalType;
  signalValue: number;
}

/**
 * Pure mapping from the app's local interaction vocabulary to backend signal
 * types + weights. Kept as data so the contract is testable at a glance:
 *   view (detail)  → view/2      view (elsewhere) → click/1
 *   bookmark       → save/3 (callers pass -1 to unsave)
 *   share          → share/2     apply            → apply/5
 */
export const INTERACTION_SIGNAL_MAP: Record<LocalInteractionType, MappedSignal> =
  {
    view: { signalType: "click", signalValue: 1 },
    bookmark: { signalType: "save", signalValue: 3 },
    share: { signalType: "share", signalValue: 2 },
    apply: { signalType: "apply", signalValue: 5 },
  };

export function mapInteractionToSignal(
  type: LocalInteractionType,
  options?: InteractionSignalOptions,
): MappedSignal | null {
  const base = INTERACTION_SIGNAL_MAP[type];
  if (!base) return null;

  if (type === "view" && options?.context === "detail") {
    return { signalType: "view", signalValue: 2 };
  }
  if (type === "bookmark") {
    return { ...base, signalValue: options?.value ?? base.signalValue };
  }
  return { ...base };
}

/**
 * Records one engagement signal. Queued locally with batched, retried
 * delivery — resolves false only for locally-invalid input; never throws.
 */
export async function recordOpportunitySignal(
  input: OpportunitySignalInput,
  getToken: ClerkTokenGetter,
): Promise<boolean> {
  if (!input?.signalType) return false;
  const isNonItem = NON_ITEM_SIGNAL_TYPES.includes(input.signalType);
  if (!input.opportunityId && !isNonItem) return false;

  enqueueSignal(
    {
      source: "web",
      ...input,
    },
    getToken,
  );
  return true;
}
