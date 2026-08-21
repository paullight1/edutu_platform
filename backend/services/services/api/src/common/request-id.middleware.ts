import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "x-request-id";
export const RESPONSE_REQUEST_ID_HEADER = "X-Edutu-Request-Id";
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export type RequestWithId = Request & { requestId?: string };

export function normalizeRequestId(value: unknown): string {
  if (typeof value === "string") {
    const candidate = value.trim();
    if (SAFE_REQUEST_ID.test(candidate)) return candidate;
  }
  return randomUUID();
}

export function requestIdMiddleware(
  request: RequestWithId,
  response: Response,
  next: NextFunction,
): void {
  const requestId = normalizeRequestId(request.headers[REQUEST_ID_HEADER]);
  request.requestId = requestId;
  request.headers[REQUEST_ID_HEADER] = requestId;
  response.setHeader(RESPONSE_REQUEST_ID_HEADER, requestId);
  next();
}
