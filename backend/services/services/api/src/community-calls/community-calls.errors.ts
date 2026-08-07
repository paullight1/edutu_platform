import { HttpException, HttpStatus } from "@nestjs/common";

export type CommunityCallErrorCode =
  | "COMMUNITY_CALLS_DISABLED"
  | "CALL_NOT_FOUND"
  | "CALL_FORBIDDEN"
  | "CALL_NOT_SCHEDULED"
  | "CALL_OUTSIDE_START_WINDOW"
  | "CALL_ALREADY_LIVE"
  | "CALL_NOT_LIVE"
  | "CALL_FULL"
  | "CALL_INVALID_TRANSITION"
  | "CALL_IDEMPOTENCY_REQUIRED"
  | "CALL_MEMBERSHIP_REQUIRED"
  | "CALL_NOT_INVITED"
  | "MEDIA_UNAVAILABLE";

export class CommunityCallDomainError extends HttpException {
  readonly code: CommunityCallErrorCode;

  constructor(
    code: CommunityCallErrorCode,
    message: string,
    status: HttpStatus,
  ) {
    super({ code, message }, status);
    this.code = code;
  }
}

export const callError = {
  disabled: () =>
    new CommunityCallDomainError(
      "COMMUNITY_CALLS_DISABLED",
      "Community voice calls are not available yet.",
      HttpStatus.SERVICE_UNAVAILABLE,
    ),
  notFound: () =>
    new CommunityCallDomainError(
      "CALL_NOT_FOUND",
      "That scheduled call was not found.",
      HttpStatus.NOT_FOUND,
    ),
  forbidden: () =>
    new CommunityCallDomainError(
      "CALL_FORBIDDEN",
      "You are not allowed to manage this call.",
      HttpStatus.FORBIDDEN,
    ),
  membershipRequired: () =>
    new CommunityCallDomainError(
      "CALL_MEMBERSHIP_REQUIRED",
      "Join this group before joining its call.",
      HttpStatus.FORBIDDEN,
    ),
  notInvited: () =>
    new CommunityCallDomainError(
      "CALL_NOT_INVITED",
      "You were not included when this call started.",
      HttpStatus.FORBIDDEN,
    ),
  notScheduled: () =>
    new CommunityCallDomainError(
      "CALL_NOT_SCHEDULED",
      "Only a scheduled call can be started.",
      HttpStatus.CONFLICT,
    ),
  outsideStartWindow: () =>
    new CommunityCallDomainError(
      "CALL_OUTSIDE_START_WINDOW",
      "This call cannot be started outside its scheduled start window.",
      HttpStatus.CONFLICT,
    ),
  alreadyLive: () =>
    new CommunityCallDomainError(
      "CALL_ALREADY_LIVE",
      "This group already has a call starting or live.",
      HttpStatus.CONFLICT,
    ),
  notLive: () =>
    new CommunityCallDomainError(
      "CALL_NOT_LIVE",
      "This call is not live.",
      HttpStatus.CONFLICT,
    ),
  full: () =>
    new CommunityCallDomainError(
      "CALL_FULL",
      "This call has reached its participant limit.",
      HttpStatus.CONFLICT,
    ),
  invalidTransition: (message = "This call can no longer be changed.") =>
    new CommunityCallDomainError(
      "CALL_INVALID_TRANSITION",
      message,
      HttpStatus.CONFLICT,
    ),
  idempotencyRequired: () =>
    new CommunityCallDomainError(
      "CALL_IDEMPOTENCY_REQUIRED",
      "Provide a valid Idempotency-Key header for this request.",
      HttpStatus.BAD_REQUEST,
    ),
  mediaUnavailable: () =>
    new CommunityCallDomainError(
      "MEDIA_UNAVAILABLE",
      "Voice calling is temporarily unavailable. Please try again.",
      HttpStatus.SERVICE_UNAVAILABLE,
    ),
};
