import { getApiBaseUrl } from "../lib/apiBaseUrl";
import { getLocalDevAuthHeaders } from "../lib/localDevAuthHeaders";
import { fetchWithTimeout, retry } from "../lib/retry";

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

export type OpportunityPublicStage =
  | "discover"
  | "pursuing"
  | "applied"
  | "outcome";

export type OpportunityJourneyActionKey =
  | "activate"
  | "continue_task"
  | "open_application"
  | "confirm_application"
  | "update_outcome"
  | "review_learning";

export interface OpportunityIntentView {
  id?: string;
  persisted: boolean;
  source: "inferred" | "explicit";
  goalKey: string;
  opportunityTypes: string[];
  locations: string[];
  remotePreference: "required" | "preferred" | "neutral" | "excluded";
  actionHorizonDays: 30 | 90 | 180 | 365;
  weeklyHours: number;
  readinessMode: "apply_now" | "prepare";
}

export interface OpportunityNextActionView {
  key: OpportunityJourneyActionKey;
  label: string;
  taskId: string | null;
  dueAt: string | null;
}

export interface OpportunityJourneyTaskView {
  id: string;
  taskType: string;
  title: string;
  description: string | null;
  position: number;
  status: "pending" | "in_progress" | "completed" | "skipped";
  dueAt: string | null;
  required: boolean;
  source: "template" | "user" | "ai";
}

export interface OpportunityJourneyView {
  journey: {
    id: string;
    opportunityId: string;
    state: OpportunityJourneyState;
    priority: "primary" | "secondary" | "none";
    eligibilityStatus: "eligible" | "likely" | "unclear" | "ineligible";
    eligibilityConfidence: string | number;
    version: number;
    nextActionAt: string | null;
    committedAt: string | null;
    applyLinkOpenedAt: string | null;
    appliedAt: string | null;
    closedAt: string | null;
    outcome: string | null;
  };
  opportunity: Record<string, unknown>;
  tasks: OpportunityJourneyTaskView[];
  nextAction: OpportunityNextActionView;
  progress: {
    completedRequired: number;
    totalRequired: number;
    percent: number;
  };
}

export interface IntentRecommendationView extends Record<string, unknown> {
  id: string;
  title: string;
  matchScore: number | null;
  matchReasons: string[];
  matchRisks: string[];
  eligibilityStatus: "eligible" | "likely" | "unclear" | "ineligible";
  eligibilityReasons: string[];
  eligibilityBlockers: string[];
  estimatedEffortHours: number;
  deadline: string | null;
  daysUntilDeadline: number | null;
}

export interface OpportunityHomeResponse {
  generatedAt: string;
  intent: OpportunityIntentView;
  nextAction: OpportunityNextActionView | null;
  activePursuits: OpportunityJourneyView[];
  recommendations: IntentRecommendationView[];
  degraded: boolean;
  degradedReasons: string[];
  limits: {
    recommendationDefault: 3;
    recommendationMaximum: 5;
    primaryActiveMaximum: 1;
    secondaryActiveMaximum: 2;
  };
}

export interface OpportunityJourneyMutationIdentity {
  expectedVersion: number;
  idempotencyKey: string;
}

export interface OpportunityIntentInput {
  goalKey: string;
  opportunityTypes: string[];
  locations: string[];
  remotePreference: "required" | "preferred" | "neutral" | "excluded";
  actionHorizonDays: 30 | 90 | 180 | 365;
  weeklyHours: number;
  readinessMode: "apply_now" | "prepare";
}

export interface OpportunityJourneyErrorBody {
  code?: string;
  message?: string;
  currentJourney?: OpportunityJourneyView["journey"];
  [key: string]: unknown;
}

export class OpportunityJourneyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: OpportunityJourneyErrorBody,
  ) {
    super(message);
    this.name = "OpportunityJourneyApiError";
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

function boundedRecommendationLimit(value = 3): number {
  return Math.min(Math.max(Math.trunc(value || 3), 1), 5);
}

async function opportunityJourneyRequest<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const apiBaseUrl = getApiBaseUrl("Opportunity Journey API");

  const attempt = async (): Promise<T> => {
    const response = await fetchWithTimeout(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
        ...getLocalDevAuthHeaders(),
        ...(options.headers ?? {}),
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as OpportunityJourneyErrorBody;
      throw new OpportunityJourneyApiError(
        body.message ?? `Opportunity journey request failed with ${response.status}`,
        response.status,
        body,
      );
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  };

  return retry(attempt, {
    maxAttempts: 3,
    baseDelay: 500,
    maxDelay: 2_000,
    shouldRetry: (error) =>
      !(error instanceof OpportunityJourneyApiError) || error.status >= 500,
  });
}

export function createOpportunityJourneyIdempotencyKey(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`;
}

export function getOpportunityHome(
  token: string,
  recommendationLimit = 3,
): Promise<OpportunityHomeResponse> {
  const limit = boundedRecommendationLimit(recommendationLimit);
  return opportunityJourneyRequest(
    `/me/opportunity-home?recommendationLimit=${limit}`,
    token,
  );
}

export function getOpportunityIntent(
  token: string,
): Promise<OpportunityIntentView> {
  return opportunityJourneyRequest("/me/opportunity-intent", token);
}

export function saveOpportunityIntent(
  token: string,
  input: OpportunityIntentInput,
  idempotencyKey: string,
): Promise<OpportunityIntentView> {
  return opportunityJourneyRequest("/me/opportunity-intent", token, {
    method: "PUT",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function listOpportunityJourneys(
  token: string,
  stage: OpportunityPublicStage,
): Promise<OpportunityJourneyView[]> {
  return opportunityJourneyRequest(
    `/me/opportunity-journeys?stage=${encodeURIComponent(stage)}`,
    token,
  );
}

export function getOpportunityJourney(
  token: string,
  journeyId: string,
): Promise<OpportunityJourneyView> {
  return opportunityJourneyRequest(
    `/me/opportunity-journeys/${encodeURIComponent(journeyId)}`,
    token,
  );
}

export function createOpportunityJourney(
  token: string,
  input: {
    opportunityId: string;
    action: "shortlist" | "pursue";
    priority?: "primary" | "secondary";
    intentId?: string;
    idempotencyKey: string;
  },
): Promise<OpportunityJourneyView> {
  return opportunityJourneyRequest("/me/opportunity-journeys", token, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

function journeyMutation(
  token: string,
  journeyId: string,
  suffix: string,
  method: "PATCH" | "POST",
  input: Record<string, unknown>,
): Promise<OpportunityJourneyView> {
  return opportunityJourneyRequest(
    `/me/opportunity-journeys/${encodeURIComponent(journeyId)}/${suffix}`,
    token,
    { method, body: JSON.stringify(input) },
  );
}

export function transitionOpportunityJourney(
  token: string,
  journeyId: string,
  input: OpportunityJourneyMutationIdentity & { state: OpportunityJourneyState },
) {
  return journeyMutation(token, journeyId, "transition", "PATCH", input);
}

export function setOpportunityJourneyPriority(
  token: string,
  journeyId: string,
  input: OpportunityJourneyMutationIdentity & {
    priority: "primary" | "secondary";
  },
) {
  return journeyMutation(token, journeyId, "priority", "PATCH", input);
}

export function updateOpportunityJourneyTask(
  token: string,
  journeyId: string,
  taskId: string,
  input: OpportunityJourneyMutationIdentity & {
    status: "pending" | "in_progress" | "completed" | "skipped";
  },
) {
  return opportunityJourneyRequest(
    `/me/opportunity-journeys/${encodeURIComponent(journeyId)}/tasks/${encodeURIComponent(taskId)}`,
    token,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function markOpportunityApplicationOpened(
  token: string,
  journeyId: string,
  input: OpportunityJourneyMutationIdentity,
) {
  return journeyMutation(token, journeyId, "application-opened", "POST", input);
}

export function confirmOpportunityApplication(
  token: string,
  journeyId: string,
  input: OpportunityJourneyMutationIdentity,
) {
  return journeyMutation(
    token,
    journeyId,
    "application-confirmed",
    "POST",
    input,
  );
}

export function recordOpportunityJourneyOutcome(
  token: string,
  journeyId: string,
  input: OpportunityJourneyMutationIdentity & {
    outcome: "offer" | "rejected" | "withdrawn" | "no_response" | "expired";
  },
) {
  return journeyMutation(token, journeyId, "outcome", "POST", input);
}
