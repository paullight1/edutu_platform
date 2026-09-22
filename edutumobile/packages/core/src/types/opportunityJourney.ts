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
  "discover" | "pursuing" | "applied" | "outcome";

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
  syncStatus?: "synced" | "pending";
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

export interface OpportunityJourneyReadResult<T> {
  data: T | null;
  isStale: boolean;
  source: "network" | "snapshot" | "none";
}

export interface OpportunityJourneyMutationResult<T> {
  data: T | null;
  queued: boolean;
  idempotencyKey: string;
}

export interface QueuedOpportunityJourneyWrite {
  id: string;
  userId: string;
  path: string;
  method: "POST" | "PUT" | "PATCH";
  body: Record<string, unknown>;
  idempotencyKey: string;
  expectedVersion?: number;
  createdAt: string;
  attempts: number;
}
