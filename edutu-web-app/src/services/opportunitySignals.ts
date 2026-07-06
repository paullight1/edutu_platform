import { getProductApiToken, type ClerkTokenGetter } from "../lib/clerkToken";
import { productApiRequest } from "./productApi";

/**
 * Engagement signals mirrored to the backend recommender
 * (POST /opportunities/signals). The server folds these into the hybrid
 * scoring engine, so parity with mobile matters more than perfect delivery —
 * every call here is fire-and-forget-safe and never throws.
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
  | "recommended_in_chat";

export interface OpportunitySignalInput {
  opportunityId: string;
  signalType: OpportunitySignalType;
  signalValue?: number;
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
 * Send one engagement signal to the backend. Resolves true when accepted,
 * false on any failure (missing token, network, API error) — never throws.
 */
export async function recordOpportunitySignal(
  input: OpportunitySignalInput,
  getToken: ClerkTokenGetter,
): Promise<boolean> {
  try {
    if (!input?.opportunityId || !input.signalType) return false;

    const token = await getProductApiToken(getToken);
    if (!token) return false;

    await productApiRequest<unknown>("/opportunities/signals", token, {
      method: "POST",
      body: JSON.stringify({
        source: "web",
        signalValue: 1,
        ...input,
      }),
    });
    return true;
  } catch {
    // Signals are best-effort; personalization degrades gracefully.
    return false;
  }
}
