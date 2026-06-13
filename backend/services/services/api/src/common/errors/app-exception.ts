import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export interface AppExceptionResponse {
  errorCode: ErrorCode;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
}

export class AppException extends HttpException {
  public readonly errorCode: ErrorCode;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    errorCode: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    metadata?: Record<string, unknown>,
  ) {
    const body: AppExceptionResponse = {
      errorCode,
      message,
      timestamp: new Date().toISOString(),
      ...(metadata && { metadata }),
    };
    super(body, status);
    this.errorCode = errorCode;
    this.metadata = metadata;
  }

  static notFound(
    errorCode: ErrorCode,
    message = 'Resource not found',
  ): AppException {
    return new AppException(errorCode, message, HttpStatus.NOT_FOUND);
  }

  static unauthorized(
    errorCode: ErrorCode = ErrorCode.UNAUTHORIZED,
    message = 'Authentication required',
  ): AppException {
    return new AppException(errorCode, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(
    errorCode: ErrorCode = ErrorCode.FORBIDDEN,
    message = 'Access denied',
  ): AppException {
    return new AppException(errorCode, message, HttpStatus.FORBIDDEN);
  }

  static validationFailed(
    errorCode: ErrorCode = ErrorCode.VALIDATION_ERROR,
    message = 'Validation failed',
    metadata?: Record<string, unknown>,
  ): AppException {
    return new AppException(errorCode, message, HttpStatus.BAD_REQUEST, metadata);
  }

  static rateLimited(
    message = 'Too many requests',
    retryAfterSeconds?: number,
  ): AppException {
    return new AppException(
      ErrorCode.RATE_LIMIT_EXCEEDED,
      message,
      HttpStatus.TOO_MANY_REQUESTS,
      retryAfterSeconds ? { retryAfterSeconds } : undefined,
    );
  }

  static internal(
    errorCode: ErrorCode = ErrorCode.INTERNAL_ERROR,
    message = 'Internal server error',
  ): AppException {
    return new AppException(
      errorCode,
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
