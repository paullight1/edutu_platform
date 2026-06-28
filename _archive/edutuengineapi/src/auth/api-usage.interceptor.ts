import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";

import { ApiKeyStore } from "./api-key.store.js";

@Injectable()
export class ApiUsageInterceptor implements NestInterceptor {
  constructor(private readonly apiKeyStore: ApiKeyStore) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<{
      apiConsumer?: { id: string; projectId: string };
      requestId?: string;
      method?: string;
      originalUrl?: string;
      url?: string;
    }>();
    const response = context.switchToHttp().getResponse<{
      statusCode: number;
    }>();

    return next.handle().pipe(
      tap({
        next: () => {
          void this.recordEvent(
            request,
            response.statusCode,
            startedAt,
          );
        },
        error: (error) => {
          const statusCode =
            typeof error?.getStatus === "function"
              ? error.getStatus()
              : 500;
          void this.recordEvent(request, statusCode, startedAt);
        },
      }),
    );
  }

  private async recordEvent(
    request: {
      apiConsumer?: {
        id: string;
        projectId: string;
      };
      requestId?: string;
      method?: string;
      originalUrl?: string;
      url?: string;
    },
    statusCode: number,
    startedAt: number,
  ) {
    if (!request.apiConsumer?.id || !request.requestId) {
      return;
    }

    await this.apiKeyStore.recordUsageEvent({
      projectId: request.apiConsumer.projectId,
      requestId: request.requestId,
      method: request.method || "GET",
      endpoint: this.endpointFor(request),
      statusCode,
      latencyMs: Date.now() - startedAt,
    });
  }

  private endpointFor(
    request: {
      originalUrl?: string;
      url?: string;
    },
  ) {
    const rawEndpoint = request.originalUrl || request.url || "";
    return String(rawEndpoint).split("?")[0];
  }
}
