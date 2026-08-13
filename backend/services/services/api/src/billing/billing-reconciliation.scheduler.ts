import { Cron, CronExpression } from "@nestjs/schedule";
import { Injectable, Logger } from "@nestjs/common";
import type { BillingReconciliationService } from "./billing-reconciliation.service";

@Injectable()
export class BillingReconciliationScheduler {
  private readonly logger = new Logger(BillingReconciliationScheduler.name);
  private active = false;

  constructor(private readonly service: BillingReconciliationService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runRecent(): Promise<unknown> {
    if (this.active) return { skipped: true };
    this.active = true;
    try {
      return await this.service.reconcileRecent({});
    } catch (error) {
      this.logger.error(
        `Recent billing reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    } finally {
      this.active = false;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runDaily(): Promise<unknown> {
    if (this.active) return { skipped: true };
    this.active = true;
    try {
      return await this.service.reconcileDaily({});
    } catch (error) {
      this.logger.error(
        `Daily billing reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    } finally {
      this.active = false;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredPayloads(): Promise<{ purged: number }> {
    const purged = await this.service.purgeExpiredProviderPayloads();
    return { purged };
  }
}
