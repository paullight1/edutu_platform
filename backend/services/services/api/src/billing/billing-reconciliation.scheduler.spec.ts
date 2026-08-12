import { BillingReconciliationScheduler } from "./billing-reconciliation.scheduler";
import type { BillingReconciliationService } from "./billing-reconciliation.service";

describe("BillingReconciliationScheduler", () => {
  it("runs the recent recovery window and daily drift pass", async () => {
    const service = {
      reconcileRecent: jest.fn().mockResolvedValue({
        repaired: 0,
        reviewCases: 0,
        duplicates: 0,
        providerErrors: 0,
        checkoutEnabled: false,
        metrics: [],
      }),
      reconcileDaily: jest.fn().mockResolvedValue({
        repaired: 0,
        reviewCases: 0,
        duplicates: 0,
        providerErrors: 0,
        checkoutEnabled: false,
        metrics: [],
      }),
    } as unknown as jest.Mocked<
      Pick<BillingReconciliationService, "reconcileRecent" | "reconcileDaily">
    >;
    const scheduler = new BillingReconciliationScheduler(
      service as unknown as BillingReconciliationService,
    );

    await scheduler.runRecent();
    await scheduler.runDaily();

    expect(jest.mocked(service.reconcileRecent)).toHaveBeenCalledWith({});
    expect(jest.mocked(service.reconcileDaily)).toHaveBeenCalledWith({});
  });

  it("skips an overlapping run and resumes after the active run finishes", async () => {
    let finish!: () => void;
    const active = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const service = {
      reconcileRecent: jest.fn().mockImplementation(async () => {
        await active;
        return {
          repaired: 0,
          reviewCases: 0,
          duplicates: 0,
          providerErrors: 0,
          checkoutEnabled: false,
          metrics: [],
        };
      }),
      reconcileDaily: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<BillingReconciliationService, "reconcileRecent" | "reconcileDaily">
    >;
    const scheduler = new BillingReconciliationScheduler(
      service as unknown as BillingReconciliationService,
    );

    const firstRun = scheduler.runRecent();
    await expect(scheduler.runRecent()).resolves.toEqual({ skipped: true });
    finish();
    await firstRun;
    await scheduler.runRecent();

    expect(jest.mocked(service.reconcileRecent)).toHaveBeenCalledTimes(2);
  });
});
