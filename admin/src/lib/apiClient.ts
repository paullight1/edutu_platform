export type AdminApiFailureCategory =
  | "configuration"
  | "authentication"
  | "authorization"
  | "timeout"
  | "network"
  | "http"
  | "invalid-response";

export interface AdminApiRequestInit extends RequestInit {
  timeoutMs?: number;
}

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

// Deliberately incomplete RED-phase scaffold. The tests define the client
// contract; the next commit supplies authenticated request behavior.
export async function getAdminAuthHeaders(
  _extraHeaders?: HeadersInit,
): Promise<Record<string, string>> {
  return {};
}

export async function adminApiJson<T>(
  _path: string,
  _init: AdminApiRequestInit = {},
): Promise<T> {
  throw new AdminApiError({
    message: "Admin API client is not implemented",
    category: "network",
    requestId: "not-implemented",
    targetOrigin: "",
    elapsedMs: 0,
  });
}
