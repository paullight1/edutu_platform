import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { eq } from "drizzle-orm";
import { createHash, randomUUID, timingSafeEqual } from "crypto";
import { db } from "../db";
import { apiConsumers } from "../db/schema";
import { EDUTU_API_SCOPE_KEY } from "./api-scope.decorator";
import type { ApiConsumerContext } from "./current-api-consumer.decorator";
import { EdutuApiUsageService } from "./edutu-api-usage.service";

@Injectable()
export class EdutuApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usageService: EdutuApiUsageService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const requestId = this.resolveRequestId(request.headers);
    request.edutuRequestId = requestId;
    response.setHeader("X-Edutu-Request-Id", requestId);

    const apiKey = this.extractApiKey(request.headers);

    if (!apiKey) {
      throw new UnauthorizedException("Missing Edutu API key");
    }

    const consumer = await this.resolveConsumer(apiKey);
    const scope = this.reflector.getAllAndOverride<string>(
      EDUTU_API_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (scope && !this.hasScope(consumer.scopes, scope)) {
      throw new UnauthorizedException(`API key missing scope: ${scope}`);
    }

    const quota = await this.usageService.reserveMonthlyQuota(consumer);
    consumer.requestId = requestId;
    consumer.quota = {
      limit: quota.limit,
      remaining: quota.remaining,
      resetAt: quota.resetAt,
    };

    this.setQuotaHeaders(response, quota);

    if (!quota.allowed) {
      throw new HttpException(
        {
          message: "Edutu API monthly quota exceeded",
          requestId,
          quota: consumer.quota,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    request.apiConsumer = consumer;
    return true;
  }

  private extractApiKey(
    headers: Record<string, string | string[] | undefined>,
  ) {
    const explicit = headers["x-edutu-api-key"];
    if (typeof explicit === "string" && explicit.trim()) {
      return explicit.trim();
    }

    const authorization = headers.authorization;
    if (typeof authorization === "string") {
      const [scheme, token] = authorization.split(" ");
      if (scheme?.toLowerCase() === "bearer" && token) {
        return token.trim();
      }
    }

    return null;
  }

  private resolveRequestId(
    headers: Record<string, string | string[] | undefined>,
  ) {
    const incoming = headers["x-request-id"];
    if (
      typeof incoming === "string" &&
      /^[a-zA-Z0-9_.:-]{8,80}$/.test(incoming)
    ) {
      return incoming;
    }

    return randomUUID();
  }

  private async resolveConsumer(apiKey: string): Promise<ApiConsumerContext> {
    const apiKeyHash = this.hashApiKey(apiKey);
    const envConsumer = this.resolveEnvConsumer(apiKey, apiKeyHash);
    if (envConsumer) return envConsumer;

    const [consumer] = await db
      .select()
      .from(apiConsumers)
      .where(eq(apiConsumers.apiKeyHash, apiKeyHash))
      .limit(1)
      .execute();

    if (!consumer || consumer.status !== "active") {
      throw new UnauthorizedException("Invalid or inactive Edutu API key");
    }

    return {
      id: consumer.id,
      name: consumer.name,
      plan: consumer.plan ?? "starter",
      scopes: consumer.allowedScopes ?? [],
      monthlyQuota: consumer.monthlyQuota,
    };
  }

  private resolveEnvConsumer(
    apiKey: string,
    apiKeyHash: string,
  ): ApiConsumerContext | null {
    const configuredKeys = (process.env.EDUTU_API_KEYS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const matched = configuredKeys.some((value) => {
      const configuredHash = value.startsWith("sha256:")
        ? value.slice(7)
        : this.hashApiKey(value);

      return this.safeEqual(configuredHash, apiKeyHash);
    });

    if (!matched) return null;

    return {
      id: "env",
      name: "Environment API key",
      plan: "internal",
      scopes: ["*"],
      monthlyQuota: null,
    };
  }

  private hasScope(scopes: string[], requiredScope: string) {
    return scopes.includes("*") || scopes.includes(requiredScope);
  }

  private hashApiKey(apiKey: string) {
    return createHash("sha256").update(apiKey).digest("hex");
  }

  private safeEqual(a: string, b: string) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }

  private setQuotaHeaders(
    response: any,
    quota: {
      limit: number | null;
      remaining: number | null;
      resetAt: string | null;
    },
  ) {
    if (quota.limit === null) {
      response.setHeader("X-Edutu-Quota-Limit", "unlimited");
      return;
    }

    response.setHeader("X-Edutu-Quota-Limit", String(quota.limit));
    response.setHeader("X-Edutu-Quota-Remaining", String(quota.remaining ?? 0));
    if (quota.resetAt) {
      response.setHeader("X-Edutu-Quota-Reset", quota.resetAt);
    }
  }
}
