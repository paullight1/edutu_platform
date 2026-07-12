import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, throwError } from "rxjs";
import { catchError } from "rxjs/operators";
import { AI_METERED_KEY, AiMeteredAction } from "./ai-metered.decorator";
import { MonetizationService } from "./monetization.service";

/**
 * Global interceptor: routes tagged @AiMetered are charged BEFORE the handler
 * runs (402/429 when the user can't pay); if the handler then fails, the
 * debit is refunded so users never pay for a broken AI call.
 */
@Injectable()
export class AiMeteringInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly monetizationService: MonetizationService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const action = this.reflector.get<AiMeteredAction | undefined>(
      AI_METERED_KEY,
      context.getHandler(),
    );
    if (!action) return next.handle();

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined =
      request?.user?.id ?? request?.user?.sub ?? request?.user?.userId;

    const charge = await this.monetizationService.meter(userId ?? "", action);

    return next.handle().pipe(
      catchError((error) => {
        void this.monetizationService.refund(charge);
        return throwError(() => error);
      }),
    );
  }
}
