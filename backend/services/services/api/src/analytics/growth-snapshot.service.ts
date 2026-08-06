import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { AdminService } from "../admin/admin.service";

/**
 * Once a day, snapshots the growth funnel into analytics_snapshots so the
 * admin funnel gains real day-over-day history without waiting for a pipeline.
 */
@Injectable()
export class GrowthSnapshotService {
  private readonly logger = new Logger(GrowthSnapshotService.name);

  constructor(private readonly adminService: AdminService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async captureDailySnapshot(): Promise<void> {
    try {
      const funnel = await this.adminService.getFunnel();
      const metrics = JSON.stringify({
        stages: funnel.stages,
        referral: funnel.referral,
        cohorts: funnel.cohorts,
      });
      await db.execute(sql`
        insert into analytics_snapshots (snapshot_type, timeframe, metrics, generated_at, notes)
        values ('engagement', '7d', ${metrics}::jsonb, now(), 'growth-snapshot cron')
      `);
      this.logger.log("growth snapshot written");
    } catch (error) {
      this.logger.error(`growth snapshot failed: ${(error as Error).message}`);
    }
  }
}
