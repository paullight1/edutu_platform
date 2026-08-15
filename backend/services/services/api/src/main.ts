import { ValidationPipe, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import type { NestExpressApplication } from "@nestjs/platform-express";
import WebSocket from "ws";
import { AppModule } from "./app.module";
import { loadBachsConfig } from "./billing/providers/bachs/bachs.config";
import { createScraperEgressBodyLimitMiddleware } from "./scraper/scraper-egress-body-limit.middleware";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}

export function validateEnvironment(): void {
  const logger = new Logger("Bootstrap");
  const nodeEnv = process.env.NODE_ENV?.trim();
  if (!nodeEnv || !["development", "test", "production"].includes(nodeEnv)) {
    throw new Error(
      "NODE_ENV must be explicitly set to development, test, or production.",
    );
  }
  const isProd = nodeEnv === "production";

  if (process.env.COMMUNITY_CALLS_ENABLED === "true") {
    const tokenSecret = process.env.COMMUNITY_CALL_TOKEN_SECRET || "";
    if (Buffer.byteLength(tokenSecret, "utf8") < 32) {
      throw new Error(
        "COMMUNITY_CALL_TOKEN_SECRET must be at least 32 bytes when community calls are enabled.",
      );
    }
    if (!process.env.VOICE_GATEWAY_URL) {
      throw new Error(
        "VOICE_GATEWAY_URL is required when community calls are enabled.",
      );
    }
    const participantCap = Number(process.env.COMMUNITY_CALL_PARTICIPANT_CAP);
    if (
      !Number.isInteger(participantCap) ||
      participantCap < 2 ||
      participantCap > 500
    ) {
      throw new Error(
        "COMMUNITY_CALL_PARTICIPANT_CAP must be a load-tested integer from 2 to 500 when community calls are enabled.",
      );
    }
  }

  if (isProd) {
    const required = [
      "DATABASE_URL",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ];
    const missing = required.filter((key) => !process.env[key]?.trim());
    const clerkPublishableKey =
      process.env.CLERK_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.VITE_CLERK_PUBLISHABLE_KEY ||
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const hasClerkVerification = Boolean(
      process.env.CLERK_SECRET_KEY?.trim() ||
      process.env.CLERK_JWT_KEY?.trim() ||
      (process.env.CLERK_ISSUER_URL?.trim() && clerkPublishableKey?.trim()),
    );

    if (!hasClerkVerification) missing.push("Clerk verification configuration");
    if (missing.length > 0) {
      throw new Error(
        `Production environment is missing required configuration: ${missing.join(
          ", ",
        )}.`,
      );
    }

    const pepper = process.env.API_KEY_PEPPER?.trim() || "";
    if (pepper.length < 16) {
      throw new Error(
        "API_KEY_PEPPER must be at least 16 characters in production. Refusing to start: API keys would be hashed without a strong server-side pepper.",
      );
    }

    if (process.env.EDUTU_LOCAL_ADMIN_BYPASS === "true") {
      throw new Error(
        "EDUTU_LOCAL_ADMIN_BYPASS must be disabled in production.",
      );
    }

    // The provider loader validates every required Bachs field and the
    // environment-specific API origin when checkout is enabled.
    loadBachsConfig();

    const legacyPaystackEnabled =
      process.env.LEGACY_PAYSTACK_WEBHOOK_ENABLED === "true" ||
      process.env.PAYSTACK_WEBHOOK_ENABLED === "true";
    if (legacyPaystackEnabled && !process.env.PAYSTACK_SECRET_KEY?.trim()) {
      throw new Error(
        "PAYSTACK_SECRET_KEY is required when the legacy Paystack webhook is enabled.",
      );
    }
  } else if (!process.env.API_KEY_PEPPER) {
    logger.warn(
      "API_KEY_PEPPER is not set. API keys are hashed without a server-side pepper (acceptable only in development).",
    );
  }
}

export async function bootstrap() {
  validateEnvironment();

  // bodyParser: false + useBodyParser keeps the raw-body capture (needed for
  // Paystack webhook signature checks) while still enforcing size limits.
  // A plain express json() middleware here would run first and drop rawBody.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: false,
  });

  app.use(helmet());
  app.use("/internal/scraper-egress", createScraperEgressBodyLimitMiddleware());
  app.useBodyParser("json", { limit: "1mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "1mb" });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const isProd = process.env.NODE_ENV === "production";
  const devOrigins = isProd
    ? []
    : [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
      ];

  const allowedOrigins = [
    "https://docs.edutu.org",
    "https://www.edutu.org",
    "https://edutu.org",
    ...devOrigins,
    process.env.ADMIN_URL,
    process.env.FRONTEND_URL,
    process.env.MOBILE_APP_URL,
  ].filter((origin): origin is string => Boolean(origin));

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-Edutu-API-Key",
      "X-Edutu-Admin-Email",
      "X-Request-Id",
      "Idempotency-Key",
    ],
    exposedHeaders: [
      "X-Edutu-Request-Id",
      "X-Edutu-Quota-Limit",
      "X-Edutu-Quota-Remaining",
      "X-Edutu-Quota-Reset",
      "X-Edutu-Credits-Remaining",
      "X-Edutu-Ai-Remaining",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "Retry-After",
    ],
  });

  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  new Logger("Bootstrap").log(`API server running on http://localhost:${port}`);
}

if (process.env.JEST_WORKER_ID === undefined) {
  void bootstrap();
}
