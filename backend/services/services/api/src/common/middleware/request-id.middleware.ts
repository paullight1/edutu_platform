import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { billingClassForEndpoint } from "../../edutu-api/edutu-api-billing-policy";
import { logSafeObservability } from "../../edutu-api/edutu-api-usage.service";

function generateUUID(): string {
  // Simple UUID v4 generation without external dependencies
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Extend Express Request to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      edutuRequestId?: string;
    }
  }
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestIdMiddleware.name);

  use(req: Request, res: Response, next: NextFunction): void {
    const supplied = req.headers["x-request-id"];
    const requestId =
      typeof supplied === "string" && /^[a-zA-Z0-9._:-]{1,128}$/.test(supplied)
        ? supplied
        : generateUUID();

    req.requestId = requestId;
    req.edutuRequestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    res.once("finish", () => {
      const endpoint = String(req.originalUrl || req.url || "").split("?")[0];
      if (!endpoint.startsWith("/v1/")) return;
      const statusCode = Number(res.statusCode) || 500;
      const consumer = (req as Request & { apiConsumer?: { id?: string } })
        .apiConsumer;
      logSafeObservability(this.logger, "api_http_response", {
        requestId,
        consumerId: consumer?.id,
        method: req.method,
        endpoint,
        billingClass: consumer
          ? billingClassForEndpoint(req.method, endpoint)
          : "unknown",
        statusCode,
        statusClass: `${Math.floor(statusCode / 100)}xx`,
        outcome: statusCode >= 400 ? "error" : "success",
      });
    });

    next();
  }
}
