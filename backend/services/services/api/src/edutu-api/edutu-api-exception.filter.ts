import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { stableApiError } from "./edutu-api-billing-policy";

const RAW_API_KEY_PATTERN = /\bedu_(?:test|live)_[a-z0-9-]+_[a-z0-9-]+\b/gi;
const API_KEY_HASH_PATTERN = /\b[a-f0-9]{64}\b/gi;
const SENSITIVE_FIELD_PATTERN = /^(?:raw_?key|api_?key|api_?key_?hash)$/i;

@Catch()
export class EdutuApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload =
      exception instanceof HttpException ? exception.getResponse() : null;
    const body = this.toErrorBody(payload, status, request.edutuRequestId);

    if (!response.headersSent) {
      response.status(status).json(body);
    }
  }

  private toErrorBody(payload: unknown, status: number, requestId?: string) {
    const defaultMessage =
      status >= 500
        ? "The Edutu API could not process this request"
        : "The Edutu API request was invalid";

    if (typeof payload === "string") {
      return {
        error: {
          message: this.redactString(payload),
          status,
        },
        requestId,
      };
    }

    if (payload && typeof payload === "object") {
      const source = payload as Record<string, unknown>;
      return {
        error: {
          message:
            typeof source.message === "string"
              ? this.redactString(source.message)
              : defaultMessage,
          status,
          code: typeof source.code === "string" ? source.code : undefined,
          details: this.redact(source.errors ?? source.error),
          quota: this.redact(source.quota),
          retryAfter:
            typeof source.retryAfter === "number"
              ? source.retryAfter
              : undefined,
        },
        requestId: source.requestId ?? requestId,
      };
    }

    const fallback = stableApiError(
      status >= 500 ? "internal_error" : "invalid_request",
      requestId ?? "",
      defaultMessage,
    );

    return {
      error: {
        message: defaultMessage,
        status,
        code: fallback.code,
      },
      requestId: requestId ?? undefined,
    };
  }

  private redact(value: unknown): unknown {
    if (typeof value === "string") return this.redactString(value);
    if (Array.isArray(value)) return value.map((item) => this.redact(item));
    if (!value || typeof value !== "object") return value;

    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_FIELD_PATTERN.test(key))
        .map(([key, item]) => [key, this.redact(item)]),
    );
  }

  private redactString(value: string) {
    return value
      .replace(RAW_API_KEY_PATTERN, "[REDACTED_API_KEY]")
      .replace(API_KEY_HASH_PATTERN, "[REDACTED_API_KEY_HASH]");
  }
}
