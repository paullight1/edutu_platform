import { Module } from "@nestjs/common";
import { pool } from "../db";
import { HealthController } from "./health.controller";
import {
  DATABASE_HEALTH_PROBE,
  type DatabaseHealthProbe,
  HealthService,
} from "./health.service";

const databaseHealthProbe: DatabaseHealthProbe = {
  async ping() {
    await pool.query("SELECT 1");
  },
};

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    {
      provide: DATABASE_HEALTH_PROBE,
      useValue: databaseHealthProbe,
    },
  ],
})
export class HealthModule {}
