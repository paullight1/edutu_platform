import { ValidationPipe, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { json, urlencoded } from "express";
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
      logger.warn(
        "API_KEY_PEPPER is not set in production. API keys are hashed without a server-side pepper.",
      );
    }
  }
}

async function bootstrap() {
  validateEnvironment();

  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(helmet());
  app.use(json({ limit: "1mb" }));
  app.use(urlencoded({ extended: true, limit: "1mb" }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const allowedOrigins = [
    "https://docs.edutu.org",
    "https://www.edutu.org",
    "https://edutu.org",
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
    process.env.ADMIN_URL,
    process.env.FRONTEND_URL,
    process.env.MOBILE_APP_URL,
  ].filter(Boolean);

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
    ],
    exposedHeaders: [
      "X-Edutu-Request-Id",
      "X-Edutu-Quota-Limit",
      "X-Edutu-Quota-Remaining",
      "X-Edutu-Quota-Reset",
      "X-Edutu-Credits-Remaining",
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
