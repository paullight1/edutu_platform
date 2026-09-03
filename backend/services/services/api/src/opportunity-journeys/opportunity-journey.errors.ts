export type OpportunityJourneyDomainErrorCode =
  | "ACTIVE_PURSUIT_LIMIT_REACHED"
  | "PRIMARY_PURSUIT_EXISTS"
  | "JOURNEY_VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_JOURNEY_TRANSITION"
  | "APPLICATION_CONFIRMATION_REQUIRED"
  | "OUTCOME_UPDATE_REQUIRED"
  | "REQUIRED_TASKS_INCOMPLETE"
  | "REQUIRED_TASK_CANNOT_BE_SKIPPED"
  | "APPLICATION_NOT_OPENED"
  | "OPPORTUNITY_INELIGIBLE"
  | "OPPORTUNITY_EXPIRED"
  | "OPPORTUNITY_NOT_FOUND"
  | "JOURNEY_NOT_FOUND"
  | "TASK_NOT_FOUND"
  | "INTENT_REQUIRED"
  | "INVALID_USER_ID";

export class OpportunityJourneyDomainError extends Error {
  constructor(
    public readonly code: OpportunityJourneyDomainErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "OpportunityJourneyDomainError";
  }
}
