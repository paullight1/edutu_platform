import { createHash } from "node:crypto";

export const OPPORTUNITY_JOURNEY_EVENT_TYPES = [
  "intent_created",
  "intent_updated",
  "journey_shortlisted",
  "journey_activated",
  "journey_preparing",
  "journey_ready",
  "application_opened",
  "application_confirmed",
  "journey_interview",
  "journey_outcome",
  "journey_archived",
  "journey_restored",
  "task_created",
  "task_started",
  "task_completed",
  "task_skipped",
] as const;

export type OpportunityJourneyEventType =
  (typeof OPPORTUNITY_JOURNEY_EVENT_TYPES)[number];

export type OpportunityJourneyEventSource =
  | "web"
  | "mobile"
  | "backend"
  | "migration";

export interface OpportunityJourneyEventInput {
  eventType: string;
  source: OpportunityJourneyEventSource;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function hashOpportunityJourneyMutation(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function eventMetadataWithMutationHash(
  metadata: Record<string, unknown> | undefined,
  mutation: unknown,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    mutationHash: hashOpportunityJourneyMutation(mutation),
  };
}

export function readMutationHash(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  return typeof metadata?.mutationHash === "string"
    ? metadata.mutationHash
    : null;
}
