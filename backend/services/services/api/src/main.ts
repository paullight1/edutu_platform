import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import WebSocket from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const allowedOrigins = [
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
    ],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API server running on http://localhost:${port}`);
}
void bootstrap();
