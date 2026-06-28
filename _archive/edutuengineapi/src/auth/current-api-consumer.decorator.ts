import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface ApiConsumerContext {
  id: string;
  projectId: string;
  name: string;
  plan: string;
  keyPrefix: string | null;
  scopes: string[];
  environment: "test" | "live" | "unknown";
  monthlyQuota: number | null;
  rateLimitPerMinute: number | null;
  ownerAccountId: string | null;
  requestId?: string;
  remainingQuota?: number | null;
  quotaLimit?: number | null;
  quotaResetAt?: string | null;
  creditsBalance?: number | null;
  status: "active" | "revoked" | "expired";
}

export const CurrentApiConsumer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ApiConsumerContext | undefined => {
    const request = context
      .switchToHttp()
      .getRequest<{ apiConsumer?: ApiConsumerContext }>();
    return request.apiConsumer;
  },
);
