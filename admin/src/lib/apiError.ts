export type AdminApiFailureCategory =
  | "configuration"
  | "authentication"
  | "authorization"
  | "timeout"
  | "network"
  | "http"
  | "invalid-response";

export class AdminApiError extends Error {
  readonly category: AdminApiFailureCategory;
  readonly status?: number;
  readonly requestId: string;
  readonly targetOrigin: string;
  readonly elapsedMs: number;

  constructor(input: {
    message: string;
    category: AdminApiFailureCategory;
    status?: number;
    requestId: string;
    targetOrigin: string;
    elapsedMs: number;
  }) {
    super(input.message);
    this.name = "AdminApiError";
    this.category = input.category;
    this.status = input.status;
    this.requestId = input.requestId;
    this.targetOrigin = input.targetOrigin;
    this.elapsedMs = input.elapsedMs;
  }
}
