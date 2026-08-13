import { createHmac } from "node:crypto";
import { db } from "../db";
import {
  BachsWebhookService,
  decimalToMinorUnits,
} from "./bachs-webhook.service";
import type { BachsEnabledConfig } from "./providers/bachs/bachs.config";
import type { CreditPurchaseService } from "./credit-purchase.service";

const config: BachsEnabledConfig = {
  checkoutEnabled: true,
  environment: "sandbox",
  apiBaseUrl: "https://sandbox-api.bachs.io",
  apiKey: "test-key",
  webhookSecret: "webhook-secret",
  expectedOrganizationId: "org_edutu",
  productMappings: { api_credits_100: "prod_api_credits_100" },
};

function signedPayload(overrides: Record<string, unknown> = {}) {
  const timestamp = "1786449600";
  const payload = {
    id: "evt_1234567890abcdef",
    type: "collection.succeeded",
    created_at: "2026-08-11T12:00:00.000Z",
    organization_id: "org_edutu",
    data: {
      charge_id: "ch_1234567890abcdef",
      checkout_id: "chk_1234567890abcdef",
      reference: "11111111-1111-4111-8111-111111111111",
      status: "succeeded",
      amount: "4.99",
      currency: "USD",
      product_cart: [{ product_id: "prod_api_credits_100", quantity: 1 }],
      metadata: {
        edutu_intent_id: "11111111-1111-4111-8111-111111111111",
      },
    },
    ...overrides,
  };
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = createHmac("sha256", config.webhookSecret)
    .update(`${timestamp}.${rawBody.toString("utf8")}`)
    .digest("hex");
  return { payload, rawBody, timestamp, signature };
}

describe("BachsWebhookService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("converts Bachs decimal money into exact minor units", () => {
    expect(decimalToMinorUnits("4.99", "USD")).toBe(499n);
    expect(decimalToMinorUnits("75000.00", "NGN")).toBe(7_500_000n);
  });

  it("stores and fulfills a valid collection exactly once", async () => {
    const tx = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "event-row-1" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              user_id: "user_123",
              product_key: "api_credits_100",
              provider_checkout_id: "chk_1234567890abcdef",
              expected_amount_minor: "499",
              currency: "USD",
              status: "open",
              product_snapshot: {
                productKey: "api_credits_100",
                providerProductId: "prod_api_credits_100",
                fulfillmentKind: "credits",
                renewalMode: "one_time",
                creditQuantity: 100,
                validityDays: null,
              },
            },
          ],
        })
        .mockResolvedValue({ rows: [] }),
    };
    const creditPurchaseService = {
      fulfillInTransaction: jest.fn().mockResolvedValue({
        status: "fulfilled",
        creditsAdded: 100,
        ledgerId: "ledger-1",
      }),
    } as unknown as CreditPurchaseService;
    jest
      .spyOn(db, "transaction")
      .mockImplementation(async (callback) => callback(tx as never));

    const service = new BachsWebhookService(config, {
      clock: () => Date.parse("2026-08-11T12:00:00.000Z"),
      creditPurchaseService,
    });
    const signed = signedPayload();
    await expect(
      service.handle(signed.rawBody, signed.timestamp, signed.signature),
    ).resolves.toMatchObject({ status: "fulfilled" });

    await expect(
      service.handle(signed.rawBody, signed.timestamp, signed.signature),
    ).resolves.toEqual({ status: "duplicate" });

    expect(tx.execute).toHaveBeenCalledTimes(3);
    expect(creditPurchaseService.fulfillInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        productKey: "api_credits_100",
        creditQuantity: 100,
      }),
      expect.objectContaining({ eventRowId: "event-row-1" }),
    );
  });

  it("quarantines a signed success whose event identity disagrees with the checkout owner", async () => {
    const signed = signedPayload();
    signed.payload.data = {
      ...(signed.payload.data as Record<string, unknown>),
      metadata: {
        edutu_intent_id: "11111111-1111-4111-8111-111111111111",
        user_id: "another-user",
      },
    };
    signed.rawBody = Buffer.from(JSON.stringify(signed.payload));
    signed.signature = createHmac("sha256", config.webhookSecret)
      .update(`${signed.timestamp}.${signed.rawBody.toString("utf8")}`)
      .digest("hex");
    const tx = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "event-row-1" }] })
        .mockResolvedValue({ rows: [] }),
    };
    jest
      .spyOn(db, "transaction")
      .mockImplementation(async (callback) => callback(tx as never));
    const creditPurchaseService = {
      fulfillInTransaction: jest.fn(),
    } as unknown as CreditPurchaseService;

    await expect(
      new BachsWebhookService(config, {
        clock: () => Date.parse("2026-08-11T12:00:00.000Z"),
        creditPurchaseService,
      }).handle(signed.rawBody, signed.timestamp, signed.signature),
    ).resolves.toEqual({ status: "review" });
    expect(creditPurchaseService.fulfillInTransaction).not.toHaveBeenCalled();
  });

  it("does not grant access for an untrusted organization", async () => {
    const signed = signedPayload({ organization_id: "org_other" });
    const transaction = jest.spyOn(db, "transaction");
    const service = new BachsWebhookService(config, {
      clock: () => Date.parse("2026-08-11T12:00:00.000Z"),
    });

    await expect(
      service.handle(signed.rawBody, signed.timestamp, signed.signature),
    ).rejects.toMatchObject({ status: 400 });
    expect(transaction).not.toHaveBeenCalled();
  });
});
