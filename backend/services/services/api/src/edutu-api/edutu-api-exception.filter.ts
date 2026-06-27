import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";

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
          message: payload,
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
              ? source.message
              : defaultMessage,
          status,
          code: typeof source.code === "string" ? source.code : undefined,
          details: source.errors ?? source.error ?? undefined,
          quota: source.quota ?? undefined,
          retryAfter:
            typeof source.retryAfter === "number"
              ? source.retryAfter
              : undefined,
        },
        requestId: source.requestId ?? requestId,
      };
    }

    return {
      error: {
        message: defaultMessage,
        status,
      },
      requestId,
    };
  }
}
