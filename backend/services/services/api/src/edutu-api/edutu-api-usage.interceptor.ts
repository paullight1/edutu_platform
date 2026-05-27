import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { EdutuApiUsageService } from "./edutu-api-usage.service";

@Injectable()
export class EdutuApiUsageInterceptor implements NestInterceptor {
  constructor(private readonly usageService: EdutuApiUsageService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap({
        next: () => {
          void this.record(request, response.statusCode, startedAt);
        },
        error: (error) => {
          const statusCode =
            typeof error?.getStatus === "function" ? error.getStatus() : 500;
          void this.record(request, statusCode, startedAt);
        },
      }),
    );
  }

  private async record(request: any, statusCode: number, startedAt: number) {
    const consumer = request.apiConsumer;
    const requestId = request.edutuRequestId;
    if (!consumer || !requestId) return;

    await this.usageService.recordUsageEvent({
      consumer,
      requestId,
      method: request.method || "GET",
      endpoint: this.endpointFor(request),
      statusCode,
      latencyMs: Date.now() - startedAt,
    });
  }

  private endpointFor(request: any) {
    return String(request.originalUrl || request.url || "").split("?")[0];
  }
}
