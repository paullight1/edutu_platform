import { RevenueCatReconciliationScheduler } from "./revenuecat-reconciliation.scheduler";

describe("RevenueCatReconciliationScheduler", () => {
  it("reconciles isolated sandbox and live state when configured", async () => {
    const adapter = {
      reconcile: jest.fn().mockResolvedValue({
        checked: 1,
        repaired: 0,
        reviewCases: 0,
      }),
    };
    const scheduler = new RevenueCatReconciliationScheduler(adapter as never);

    await expect(scheduler.run()).resolves.toEqual({
      sandbox: { checked: 1, repaired: 0, reviewCases: 0 },
      live: { checked: 1, repaired: 0, reviewCases: 0 },
    });
    expect(adapter.reconcile.mock.calls).toEqual([["sandbox"], ["live"]]);
  });

  it("skips when provider reads are disabled or a run overlaps", async () => {
    await expect(
      new RevenueCatReconciliationScheduler(null).run(),
    ).resolves.toEqual({ skipped: true, reason: "not_configured" });

    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const adapter = {
      reconcile: jest.fn().mockImplementation(async () => {
        await pending;
        return { checked: 0, repaired: 0, reviewCases: 0 };
      }),
    };
    const scheduler = new RevenueCatReconciliationScheduler(adapter as never);
    const first = scheduler.run();
    await expect(scheduler.run()).resolves.toEqual({
      skipped: true,
      reason: "overlap",
    });
    release();
    await first;
  });
});
