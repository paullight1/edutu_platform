import { ValidationPipe, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import type { NestExpressApplication } from "@nestjs/platform-express";
import WebSocket from "ws";
import { AppModule } from "./app.module";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}

function validateEnvironment(): void {
  const logger = new Logger("Bootstrap");
  const isProd = process.env.NODE_ENV === "production";

  const requiredForBilling = ["PAYSTACK_SECRET_KEY"];
  const recommended = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CLERK_SECRET_KEY",
  ];

  const missingRecommended = recommended.filter((key) => !process.env[key]);
  if (missingRecommended.length > 0) {
    logger.warn(
      `Recommended environment variables are not set: ${missingRecommended.join(
        ", ",
      )}. Some features (auth, data access, payments) will be degraded.`,
    );
  }

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
    const missingBilling = requiredForBilling.filter(
      (key) => !process.env[key],
    );
    if (missingBilling.length > 0) {
      logger.error(
        `Production is missing payment configuration: ${missingBilling.join(
          ", ",
        )}. Checkout will be unavailable.`,
      );
    }
    if (!process.env.API_KEY_PEPPER) {
      throw new Error(
        "API_KEY_PEPPER must be set in production. Refusing to start: API keys would be hashed without a server-side pepper.",
      );
    }
  } else if (!process.env.API_KEY_PEPPER) {
    logger.warn(
      "API_KEY_PEPPER is not set. API keys are hashed without a server-side pepper (acceptable only in development).",
    );
  }
}

async function bootstrap() {
  validateEnvironment();

  // bodyParser: false + useBodyParser keeps the raw-body capture (needed for
  // Paystack webhook signature checks) while still enforcing size limits.
  // A plain express json() middleware here would run first and drop rawBody.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: false,
  });

  app.use(helmet());
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
void bootstrap();
