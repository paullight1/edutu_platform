import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

// Fields that legitimately contain HTML or rich text
const HTML_ALLOWED_FIELDS = new Set([
  "content",
  "description",
  "body",
  "bio",
  "summary",
  "excerpt",
  "experience",
  "requirements",
  "benefits",
  "eligibility",
]);

const HTML_TAG_REGEX = /<[^>]*>/g;

function sanitizeValue(value: unknown, fieldName: string): unknown {
  if (typeof value === "string" && !HTML_ALLOWED_FIELDS.has(fieldName)) {
    const stripped = value.replace(HTML_TAG_REGEX, "").trim();
    return stripped === value ? value : stripped;
  }

  if (Array.isArray(value)) {
    return value.map((item, idx) =>
      sanitizeValue(item, `${fieldName}[${idx}]`),
    );
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = sanitizeValue(val, key);
    }
    return sanitized;
  }

  return value;
}

@Injectable()
export class SanitizeMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (req.body && typeof req.body === "object") {
      req.body = sanitizeValue(req.body, "__root__");
    }

    if (req.query && typeof req.query === "object") {
      req.query = sanitizeValue(req.query, "__query__") as Record<
        string,
        string
      >;
    }

    if (req.params && typeof req.params === "object") {
      req.params = sanitizeValue(req.params, "__params__") as Record<
        string,
        string
      >;
    }

    next();
  }
}
