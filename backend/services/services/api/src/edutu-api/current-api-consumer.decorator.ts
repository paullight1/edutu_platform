import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface ApiConsumerContext {
  id: string;
  name: string;
  plan: string;
  scopes: string[];
  monthlyQuota: number | null;
  requestId?: string;
  quota?: {
    limit: number | null;
    remaining: number | null;
    resetAt: string | null;
  };
}

export const CurrentApiConsumer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiConsumerContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.apiConsumer;
  },
);
