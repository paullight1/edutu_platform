const mockExecute = jest.fn();

jest.mock("../db", () => ({ db: { execute: mockExecute } }));

import { PgDialect } from "drizzle-orm/pg-core";
import { BillingRepository } from "./billing.repository";

function executedSql(callIndex = 0): string {
  const statement = mockExecute.mock.calls[callIndex]?.[0];
  if (!statement) throw new Error("Expected a database query");
  return new PgDialect().sqlToQuery(statement).sql;
}

describe("BillingRepository money and status contracts", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("converts integer minor units to provider decimal strings without floating point", () => {
    expect(BillingRepository.minorUnitsToDecimal(399, "USD")).toBe("3.99");
    expect(BillingRepository.minorUnitsToDecimal(399900, "NGN")).toBe(
      "3999.00",
    );
    expect(BillingRepository.minorUnitsToDecimal(1, "JPY")).toBe("1");
  });

  it("rejects invalid money and unsupported currency precision", () => {
    expect(() => BillingRepository.minorUnitsToDecimal(-1, "USD")).toThrow();
    expect(() => BillingRepository.minorUnitsToDecimal(1.5, "USD")).toThrow();
    expect(() => BillingRepository.minorUnitsToDecimal(100, "ZZZ")).toThrow();
  });

  it("maps provider state to browser-safe result state", () => {
    expect(BillingRepository.toPublicStatus("fulfilled")).toBe("active");
    expect(BillingRepository.toPublicStatus("processing")).toBe("processing");
    expect(BillingRepository.toPublicStatus("underpaid")).toBe("underpaid");
    expect(BillingRepository.toPublicStatus("review_required")).toBe(
      "needs_review",
    );
    expect(BillingRepository.toPublicStatus("provider_failed")).toBe("failed");
    expect(BillingRepository.toPublicStatus("cancelled")).toBe("cancelled");
  });

  it("rejects an unknown environment before it can query the billing catalog", async () => {
    const repository = new BillingRepository();

    await expect(
      repository.findEnabledProduct("pro_monthly_pass", "preview" as never),
    ).rejects.toThrow("Unsupported billing environment");

    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("rejects an unknown environment before looking up a Bachs customer", async () => {
    const repository = new BillingRepository();

    await expect(
      repository.findProviderCustomerId("user_123", "preview" as never),
    ).rejects.toThrow("Unsupported billing environment");

    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("resolves only an enabled Bachs product mapped for the requested environment", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        {
          product_key: "pro_monthly_pass",
          fulfillment_kind: "one_time_pass",
          renewal_mode: "one_time",
          provider_product_id: "bachs_monthly_sandbox",
          expected_amount_minor: "699",
          currency: "USD",
          cadence: "monthly",
          credit_quantity: 0,
          validity_days: "31",
          allowed_payment_methods: ["card", "mobile_money"],
          catalog_version: 1,
        },
      ],
    } as never);
    const repository = new BillingRepository();

    await expect(
      repository.findEnabledProduct("pro_monthly_pass", "sandbox"),
    ).resolves.toEqual({
      productKey: "pro_monthly_pass",
      fulfillmentKind: "pro",
      renewalMode: "one_time",
      providerProductId: "bachs_monthly_sandbox",
      expectedAmountMinor: 699,
      currency: "USD",
      cadence: "monthly",
      creditQuantity: 0,
      validityDays: 31,
      allowedPaymentMethods: ["card", "mobile_money"],
      catalogVersion: 1,
    });

    const query = executedSql();
    expect(query).toContain(
      "inner join billing_product_provider_mappings mapping",
    );
    expect(query).toContain("mapping.provider = 'bachs'");
    expect(query).toContain("mapping.environment = $1");
    expect(query).toContain("product.enabled = true");
  });

  it("creates an intent only through the current enabled Bachs mapping", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        {
          id: "f1458648-4ee2-4f45-bf0a-cc0a6c82dc9d",
          user_id: "user_123",
          product_key: "pro_monthly_pass",
          provider_checkout_id: null,
          provider_reference: null,
          status: "creating",
          expires_at: "2026-08-12T11:00:00.000Z",
          renewal_mode: "one_time",
          expected_amount_minor: "699",
          currency: "USD",
        },
      ],
    } as never);
    const repository = new BillingRepository();

    await expect(
      repository.createOrReuseIntent({
        userId: "user_123",
        environment: "sandbox",
        idempotencyKey: "request_123",
        returnSurface: "web",
        product: {
          productKey: "pro_monthly_pass",
          fulfillmentKind: "pro",
          renewalMode: "one_time",
          providerProductId: "bachs_monthly_sandbox",
          expectedAmountMinor: 699,
          currency: "USD",
          cadence: "monthly",
          creditQuantity: 0,
          validityDays: 31,
          allowedPaymentMethods: ["card"],
          catalogVersion: 1,
        },
      }),
    ).resolves.toMatchObject({ created: true, intent: { userId: "user_123" } });

    const query = executedSql();
    expect(query).toContain("insert into billing_checkout_intents");
    expect(query).toContain("from billing_products product");
    expect(query).toContain(
      "inner join billing_product_provider_mappings mapping",
    );
    expect(query).toContain("product.enabled = true");
    expect(query).toContain("mapping.provider = 'bachs'");
    expect(query).toContain("mapping.environment =");
  });
});
