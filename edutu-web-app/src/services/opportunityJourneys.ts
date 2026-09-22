import { productApiRequest } from "./productApi";

export type OpportunityPublicStage =
  | "discover"
  | "pursuing"
  | "applied"
  | "outcome";

export type OpportunityJourneyState =
  | "shortlisted"
  | "pursuing"
  | "preparing"
  | "ready_to_apply"
  | "application_opened"
  | "applied"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "no_response"
  | "expired"
  | "archived";

export interface OpportunityJourneyView {
  journey: {
    id: string;
    opportunityId: string;
    state: OpportunityJourneyState;
    priority: "primary" | "secondary" | "none";
    version: number;
    eligibilityStatus: "eligible" | "likely" | "unclear" | "ineligible";
  };
  opportunity: Record<string, unknown>;
  tasks: Array<{
    id: string;
    title: string;
    status: "pending" | "in_progress" | "completed" | "skipped";
    required: boolean;
  }>;
  nextAction: { label: string; dueAt: string | null };
  progress: {
    completedRequired: number;
    totalRequired: number;
    percent: number;
  };
}

export async function listOpportunityJourneys(
  stage: OpportunityPublicStage,
  token: string,
): Promise<OpportunityJourneyView[]> {
  const data = await productApiRequest<unknown>(
    `/me/opportunity-journeys?stage=${encodeURIComponent(stage)}`,
    token,
  );

  return Array.isArray(data) ? (data as OpportunityJourneyView[]) : [];
}

export async function createOpportunityJourney(
  opportunityId: string,
  token: string,
): Promise<OpportunityJourneyView> {
  const idempotencyKey = `web-plan-${Date.now()}-${opportunityId}`;
  return productApiRequest<OpportunityJourneyView>(
    "/me/opportunity-journeys",
    token,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        opportunityId,
        action: "pursue",
        idempotencyKey,
      }),
    },
  );
}

export async function getOpportunityJourney(
  journeyId: string,
  token: string,
): Promise<OpportunityJourneyView> {
  return productApiRequest<OpportunityJourneyView>(
    `/me/opportunity-journeys/${encodeURIComponent(journeyId)}`,
    token,
  );
}

export async function updateJourneyTask(
  journeyId: string,
  taskId: string,
  input: {
    expectedVersion: number;
    status: "pending" | "in_progress" | "completed" | "skipped";
  },
  token: string,
): Promise<OpportunityJourneyView> {
  const idempotencyKey = `web-plan-task-${Date.now()}-${taskId}`;
  return productApiRequest<OpportunityJourneyView>(
    `/me/opportunity-journeys/${encodeURIComponent(journeyId)}/tasks/${encodeURIComponent(taskId)}`,
    token,
    {
      method: "PATCH",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        ...input,
        idempotencyKey,
      }),
    },
  );
}
