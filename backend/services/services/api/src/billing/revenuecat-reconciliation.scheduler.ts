import { Inject, Injectable, Optional } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { RevenueCatReconciliationAdapter } from "./billing-reconciliation.providers";

export const REVENUECAT_RECONCILIATION_ADAPTER = Symbol(
  "REVENUECAT_RECONCILIATION_ADAPTER",
);

@Injectable()
export class RevenueCatReconciliationScheduler {
  private active = false;

  constructor(
    @Optional()
    @Inject(REVENUECAT_RECONCILIATION_ADAPTER)
    private readonly adapter: RevenueCatReconciliationAdapter | null,
  ) {}

  @Cron("0 1 * * *")
  async run(): Promise<unknown> {
    if (!this.adapter) return { skipped: true, reason: "not_configured" };
    if (this.active) return { skipped: true, reason: "overlap" };
    this.active = true;
    try {
      const sandbox = await this.adapter.reconcile("sandbox");
      const live = await this.adapter.reconcile("live");
      return { sandbox, live };
    } finally {
      this.active = false;
    }
  }
}
