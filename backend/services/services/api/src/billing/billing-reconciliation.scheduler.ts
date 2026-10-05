import { sql } from "drizzle-orm";
import { db } from "../db";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Injectable, Logger } from "@nestjs/common";
import { BillingReconciliationService } from "./billing-reconciliation.service";

@Injectable()
export class BillingReconciliationScheduler {
  private readonly logger = new Logger(BillingReconciliationScheduler.name);
  private active = false;

  constructor(private readonly service: BillingReconciliationService) {}

  // Projections are compatibility caches. Time passing does not fire a grant
  // trigger, so refresh changed windows even when no webhook arrives.
  @Cron(CronExpression.EVERY_MINUTE)
  async refreshGrantWindows(): Promise<void> {
    await db.execute(sql`
      with candidates as (
        select distinct g.user_id, g.feature_key
        from public.billing_entitlement_grants g
        where g.environment = 'live' and g.status = 'active' and g.revoked_at is null
          and g.valid_from <= now() and (g.valid_until is null or g.valid_until > now())
          and not exists (
            select 1 from public.billing_entitlements e
            where e.user_id = g.user_id and e.feature_key = g.feature_key
              and e.source = 'derived_grants' and e.status = 'active'
              and (e.expires_at is null or e.expires_at > now())
          )
        union
        select e.user_id, e.feature_key from public.billing_entitlements e
        where e.source = 'derived_grants' and e.status = 'active'
          and not exists (
            select 1 from public.billing_entitlement_grants g
            where g.environment = 'live' and g.user_id = e.user_id and g.feature_key = e.feature_key
              and g.status = 'active' and g.revoked_at is null
              and g.valid_from <= now() and (g.valid_until is null or g.valid_until > now())
          )
        limit 500
      )
      select public.billing_refresh_entitlement_projection(user_id, feature_key)
      from candidates
    `);
  }

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
