import { SetMetadata } from "@nestjs/common";

export type EdutuApiBillingClass = "free" | "credit";

export const EDUTU_API_BILLING_CLASS_KEY = "edutuApiBillingClass";
export const EdutuApiBilling = (billingClass: EdutuApiBillingClass) =>
  SetMetadata(EDUTU_API_BILLING_CLASS_KEY, billingClass);

const FREE_ENDPOINTS = new Set([
  "GET /v1/health",
  "GET /v1/usage",
  "GET /v1/categories",
]);

export function billingClassForEndpoint(
  method: string,
  path: string,
): EdutuApiBillingClass {
  const normalizedMethod = String(method || "GET")
    .trim()
    .toUpperCase();
  const normalizedPath = normalizePath(path);

  return FREE_ENDPOINTS.has(`${normalizedMethod} ${normalizedPath}`)
    ? "free"
    : "credit";
}

export function stableApiError(
  code: string,
  requestId: string,
  message: string,
): Record<string, unknown> {
  return { code, requestId, message };
}

export class EdutuApiBillingUnavailableError extends Error {
  readonly code = "billing_unavailable";

  constructor(message = "API billing is temporarily unavailable") {
    super(message);
    this.name = "EdutuApiBillingUnavailableError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function normalizePath(path: string): string {
  const withoutQuery = String(path || "").split(/[?#]/, 1)[0] || "/";
  if (withoutQuery.length <= 1) return withoutQuery;
  return withoutQuery.replace(/\/+$/, "");
}
