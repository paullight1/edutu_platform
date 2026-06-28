import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix("");
  const port = Number(process.env.PORT || 3100);
  await app.listen(port);
}

void bootstrap();
