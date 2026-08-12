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
    } as unknown as BillingReconciliationService;
    const scheduler = new BillingReconciliationScheduler(service);

    await scheduler.runRecent();
    await scheduler.runDaily();

    expect(service.reconcileRecent).toHaveBeenCalledWith({});
    expect(service.reconcileDaily).toHaveBeenCalledWith({});
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
    } as unknown as BillingReconciliationService;
    const scheduler = new BillingReconciliationScheduler(service);

    const firstRun = scheduler.runRecent();
    await expect(scheduler.runRecent()).resolves.toEqual({ skipped: true });
    finish();
    await firstRun;
    await scheduler.runRecent();

    expect(service.reconcileRecent).toHaveBeenCalledTimes(2);
  });
});
