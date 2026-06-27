import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../db";
import { apiConsumers } from "../db/schema";
import {
  apiKeyMatches,
  hashApiKey,
  safeEqualHash,
} from "../common/api-key-hash";
import { EDUTU_API_SCOPE_KEY } from "./api-scope.decorator";
import { EDUTU_API_PUBLIC_KEY } from "./edutu-api-public.decorator";
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

    const isPublic = this.reflector.getAllAndOverride<boolean>(
      EDUTU_API_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

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

    const rateLimit = this.usageService.reserveRateLimit(consumer);
    this.setRateLimitHeaders(response, rateLimit);
    if (!rateLimit.allowed) {
      response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      throw new HttpException(
        {
          message: "Rate limit exceeded",
          code: "rate_limit_exceeded",
          requestId,
          retryAfter: rateLimit.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
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
          code: "quota_exceeded",
          requestId,
          quota: consumer.quota,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const endpoint = String(request.originalUrl || request.url || "");
    const creditBalance = await this.usageService.reserveRequestCredit(
      consumer,
      endpoint,
    );
    if (creditBalance === null && !this.isCreditFreeEndpoint(endpoint)) {
      throw new HttpException(
        {
          message: "API credits exhausted",
          requestId,
          quota: consumer.quota,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    consumer.creditBalance = creditBalance;
    if (creditBalance !== null) {
      response.setHeader("X-Edutu-Credits-Remaining", String(creditBalance));
    }

    request.apiConsumer = consumer;
    return true;
  }

  private extractApiKey(
    headers: Record<string, string | string[] | undefined>,
  ) {
    const explicit = headers["x-edutu-api-key"] ?? headers["x-api-key"];
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
    const envConsumer = this.resolveEnvConsumer(apiKey);
    if (envConsumer) return envConsumer;

    // Prefix-indexed lookup. The stored keyPrefix is the public, non-secret
    // head of the key (everything before the final secret segment), so we can
    // find the candidate row in O(1) and then verify the secret with a
    // constant-time comparison. This avoids scanning/hashing every key.
    const keyPrefix = this.deriveKeyPrefix(apiKey);
    if (!keyPrefix) {
      throw new UnauthorizedException("Invalid or inactive Edutu API key");
    }

    const candidates = await db
      .select()
      .from(apiConsumers)
      .where(
        and(
          eq(apiConsumers.keyPrefix, keyPrefix),
          eq(apiConsumers.status, "active"),
        ),
      )
      .limit(5)
      .execute();

    const consumer = candidates.find(
      (candidate) =>
        Boolean(candidate.apiKeyHash) &&
        apiKeyMatches(apiKey, candidate.apiKeyHash),
    );

    if (!consumer) {
      throw new UnauthorizedException("Invalid or inactive Edutu API key");
    }

    const revokedAt = consumer.revokedAt ? new Date(consumer.revokedAt) : null;
    if (revokedAt && !Number.isNaN(revokedAt.getTime())) {
      throw new UnauthorizedException("Invalid or inactive Edutu API key");
    }

    const expiresAt = consumer.expiresAt ? new Date(consumer.expiresAt) : null;
    if (
      expiresAt &&
      !Number.isNaN(expiresAt.getTime()) &&
      expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException("Invalid or inactive Edutu API key");
    }

    const consumerContext: ApiConsumerContext = {
      id: consumer.id,
      name: consumer.name,
      plan: consumer.plan ?? "starter",
      scopes: consumer.allowedScopes ?? [],
      monthlyQuota: consumer.monthlyQuota,
      ownerUserId: consumer.ownerUserId ?? null,
      contactEmail: consumer.contactEmail ?? null,
      keyPrefix: consumer.keyPrefix ?? null,
      environment: consumer.environment ?? null,
      status: consumer.status ?? null,
      rateLimitPerMinute: consumer.rateLimitPerMinute ?? null,
      lastUsedAt: consumer.lastUsedAt
        ? new Date(consumer.lastUsedAt).toISOString()
        : null,
      revokedAt: consumer.revokedAt
        ? new Date(consumer.revokedAt).toISOString()
        : null,
      expiresAt: consumer.expiresAt
        ? new Date(consumer.expiresAt).toISOString()
        : null,
    };

    await db
      .update(apiConsumers)
      .set({
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(apiConsumers.id, consumer.id))
      .execute();

    return consumerContext;
  }

  private deriveKeyPrefix(apiKey: string): string | null {
    const separatorIndex = apiKey.lastIndexOf("_");
    if (separatorIndex <= 0) return null;
    return apiKey.slice(0, separatorIndex);
  }

  private resolveEnvConsumer(apiKey: string): ApiConsumerContext | null {
    const configuredKeys = (process.env.EDUTU_API_KEYS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const matched = configuredKeys.some((value) => {
      if (value.startsWith("sha256:")) {
        // Pre-hashed configured key (legacy plain SHA-256).
        return safeEqualHash(value.slice(7), hashApiKey(apiKey));
      }
      // Raw configured key: compare in hashed space to avoid timing leaks.
      return safeEqualHash(hashApiKey(value), hashApiKey(apiKey));
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

  private setRateLimitHeaders(
    response: any,
    rateLimit: {
      limit: number;
      remaining: number;
      resetAt: string;
    },
  ) {
    response.setHeader("X-RateLimit-Limit", String(rateLimit.limit));
    response.setHeader(
      "X-RateLimit-Remaining",
      String(Math.max(rateLimit.remaining, 0)),
    );
    response.setHeader("X-RateLimit-Reset", rateLimit.resetAt);
  }

  private isCreditFreeEndpoint(endpoint: string) {
    return /\/v1\/(usage|health)(?:\/|$)/i.test(endpoint);
  }
}
