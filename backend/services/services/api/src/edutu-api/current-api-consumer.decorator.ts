import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface ApiConsumerContext {
  id: string;
  name: string;
  plan: string;
  scopes: string[];
  monthlyQuota: number | null;
  ownerUserId?: string | null;
  contactEmail?: string | null;
  keyPrefix?: string | null;
  environment?: string | null;
  status?: string | null;
  rateLimitPerMinute?: number | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  expiresAt?: string | null;
  creditBalance?: number | null;
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
