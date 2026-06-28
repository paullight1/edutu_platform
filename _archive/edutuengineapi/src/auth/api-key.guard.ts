import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Reflector } from "@nestjs/core";

import { ApiKeyStore } from "./api-key.store.js";
import { IS_PUBLIC_ROUTE } from "./public.decorator.js";
import { EDUTU_ENGINE_API_SCOPE_KEY } from "./api-scope.decorator.js";
import type { ApiConsumerContext } from "./current-api-consumer.decorator.js";

type HeaderBag = Record<string, string | string[] | undefined>;

export function extractApiKeyFromHeaders(headers: HeaderBag): string | undefined {
  const apiKeyHeader = headers["x-edutu-api-key"] ?? headers["x-api-key"];
  const explicitToken = Array.isArray(apiKeyHeader)
    ? apiKeyHeader[0]
    : apiKeyHeader;
  if (explicitToken && explicitToken.trim()) return explicitToken.trim();

  const authorizationHeader = headers.authorization;
  const authorization = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;
  if (!authorization) return undefined;

  const [, token] = authorization.split(" ");
  if (authorization.toLowerCase().startsWith("bearer ") && token?.trim()) {
    return token.trim();
  }

  return undefined;
}

export function getConfiguredEngineApiKeys(): string[] {
  return (process.env.EDUTU_ENGINE_API_KEYS || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

function getRequestIdFromHeaders(headers: HeaderBag) {
  const candidate = headers["x-request-id"];
  if (Array.isArray(candidate)) {
    return candidate[0]?.trim() || randomUUID();
  }

  if (candidate && /^[a-zA-Z0-9_.:-]{8,80}$/.test(candidate.trim())) {
    return candidate.trim();
  }

  return randomUUID();
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyStore: ApiKeyStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<{
        headers: HeaderBag;
        method: string;
        originalUrl: string;
        url: string;
        apiConsumer?: ApiConsumerContext;
        requestId?: string;
      }>();
    const response = context.switchToHttp().getResponse<{
      setHeader: (name: string, value: string) => void;
    }>();

    const requestId = getRequestIdFromHeaders(request.headers);
    request.requestId = requestId;
    response.setHeader("X-Edutu-Request-Id", requestId);

    const incomingKey = extractApiKeyFromHeaders(request.headers);
    if (!incomingKey) {
      throw new UnauthorizedException("Missing Edutu Engine API key");
    }

    const configuredKeys = getConfiguredEngineApiKeys();
    if (incomingKey && configuredKeys.length === 0) {
      throw new UnauthorizedException("No API keys are configured");
    }

    const consumer = await this.apiKeyStore.resolveConsumer(incomingKey);
    if (!consumer) {
      throw new UnauthorizedException("Invalid Edutu Engine API key");
    }

    const requiredScope = this.reflector.getAllAndOverride<string>(
      EDUTU_ENGINE_API_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredScope && !this.hasScope(consumer.scopes, requiredScope)) {
      throw new ForbiddenException(`API key missing required scope: ${requiredScope}`);
    }

    consumer.requestId = requestId;
    const endpoint = request.originalUrl || request.url || "";
    const budget = await this.apiKeyStore.reserveProjectBudget(
      consumer,
      String(endpoint),
    );

    this.setRateHeaders(response, budget);
    if (!budget.allowed) {
      throw new HttpException(
        {
          message: "Monthly quota exhausted. Please top-up credits or upgrade your plan.",
          code: "quota_exhausted",
          requestId,
          budget,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    request.apiConsumer = consumer;
    return true;
  }

  private hasScope(scopes: string[], requiredScope: string) {
    return scopes.includes("*") || scopes.includes(requiredScope);
  }

  private setRateHeaders(response: { setHeader: (name: string, value: string) => void }, budget: { monthlyLimit: number | null; monthlyRemaining: number | null; monthlyResetAt: string | null; creditsRemaining: number | null; rateLimit: number | null; rateRemaining: number | null; }) {
    response.setHeader("X-Edutu-RateLimit-Per-Minute", String(budget.rateLimit ?? "unlimited"));
    response.setHeader(
      "X-Edutu-RateLimit-Remaining",
      String(budget.rateRemaining ?? "unlimited"),
    );
    response.setHeader(
      "X-Edutu-Quota-Limit",
      budget.monthlyLimit === null ? "unlimited" : String(budget.monthlyLimit),
    );
    response.setHeader(
      "X-Edutu-Quota-Remaining",
      budget.monthlyRemaining === null ? "unlimited" : String(budget.monthlyRemaining),
    );
    if (budget.monthlyResetAt) {
      response.setHeader("X-Edutu-Quota-Reset", budget.monthlyResetAt);
    }
    if (budget.creditsRemaining !== null) {
      response.setHeader(
        "X-Edutu-Credits-Remaining",
        String(budget.creditsRemaining),
      );
    }
  }
}
