import { SetMetadata } from "@nestjs/common";

// Keys into pricing.aiCosts in admin settings — the admin controls the credit
// price of every metered action without a deploy.
export type AiMeteredAction =
  | "chatMessage"
  | "roadmapGeneration"
  | "copilotKit"
  | "copilotAssist"
  | "cvAi"
  | "voicePerMinute";

export const AI_METERED_KEY = "ai_metered_action";

/**
 * Marks a route as a billable AI action. The global AiMeteringInterceptor
 * enforces, in order: Pro fair-use caps (Pro users pay nothing until the
 * daily abuse ceiling), free-tier daily allowance (chat only), then a
 * server-side credit debit from profiles.credits via the credit_transactions
 * ledger. Throws 402/429 before the handler runs when the user can't pay.
 */
export const AiMetered = (action: AiMeteredAction) =>
  SetMetadata(AI_METERED_KEY, action);
