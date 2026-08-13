import { CreditPurchaseService } from "./credit-purchase.service";
import type { VerifiedCreditPurchase } from "./credit-purchase.service";

const purchase: VerifiedCreditPurchase = {
  provider: "bachs",
  environment: "sandbox",
  eventId: "evt_credit_100",
  providerReference: "charge_credit_100",
  userId: "user_123",
  productKey: "api_credits_100",
  creditQuantity: 100,
  amountMinor: 499,
  currency: "USD",
};

function databaseFor(execute: jest.Mock): { transaction: jest.Mock } {
  return {
    transaction: jest.fn(
      async (callback: (tx: { execute: jest.Mock }) => unknown) =>
        callback({ execute }),
    ),
  };
}

describe("CreditPurchaseService", () => {
  it("atomically records a verified purchase and increments the canonical profile once", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "event-row-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "ledger-row-1" }] })
      .mockResolvedValueOnce({ rows: [{ user_id: "user_123" }] })
      .mockResolvedValueOnce({ rows: [] });
    const service = new CreditPurchaseService(databaseFor(execute));

    await expect(service.fulfill(purchase)).resolves.toEqual({
      status: "fulfilled",
      creditsAdded: 100,
      ledgerId: "ledger-row-1",
    });
    expect(execute).toHaveBeenCalledTimes(5);
  });

  it("returns duplicate without adding credits when the provider reference already has a matching ledger row", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "event-row-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "ledger-row-1",
            user_id: "user_123",
            amount: 100,
            related_type: "api_credit_purchase",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const service = new CreditPurchaseService(databaseFor(execute));

    await expect(service.fulfill(purchase)).resolves.toEqual({
      status: "duplicate",
      creditsAdded: 0,
      ledgerId: "ledger-row-1",
    });
  });

  it("rolls back the transaction when the canonical profile cannot be updated", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "event-row-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "ledger-row-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const database = databaseFor(execute);
    const service = new CreditPurchaseService(database);

    await expect(service.fulfill(purchase)).rejects.toThrow(
      "billing profile was not found",
    );
    expect(database.transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["api_credits_100", 250],
    ["api_credits_250", 100],
    ["api_credits_700", 701],
  ] as const)(
    "does not grant a mismatched API product (%s)",
    async (productKey, creditQuantity) => {
      const execute = jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "event-row-1" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const service = new CreditPurchaseService(databaseFor(execute));

      await expect(
        service.fulfill({ ...purchase, productKey, creditQuantity }),
      ).resolves.toMatchObject({ status: "review", creditsAdded: 0 });
      expect(execute).toHaveBeenCalledTimes(3);
    },
  );

  it.each([
    ["bad environment", { environment: "production" as unknown as "sandbox" }],
    ["zero quantity", { creditQuantity: 0 }],
    ["unsupported currency", { currency: "ZZZ" }],
  ] as const)("reviews %s instead of granting", async (_name, overrides) => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "event-row-1" }] })
      .mockResolvedValue({ rows: [] });
    const service = new CreditPurchaseService(databaseFor(execute));

    await expect(
      service.fulfill({ ...purchase, ...overrides }),
    ).resolves.toMatchObject({
      status: "review",
      creditsAdded: 0,
    });
  });
});
