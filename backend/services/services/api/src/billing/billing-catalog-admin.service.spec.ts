import { db } from "../db";
import { BillingCatalogAdminService } from "./billing-catalog-admin.service";

const planKeys = [
  "lite_weekly_pass",
  "lite_monthly_pass",
  "lite_yearly_pass",
  "pro_weekly_pass",
  "pro_monthly_pass",
  "pro_yearly_pass",
  "scholar_weekly_pass",
  "scholar_monthly_pass",
  "scholar_yearly_pass",
] as const;

const products = planKeys.map((productKey) => ({
  productKey,
  providerProductId: `prod_${productKey}`,
  amountMinor: 1500,
  currency: "USD",
  enabled: false,
  catalogVersion: 1,
}));

describe("BillingCatalogAdminService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.BACHS_ENVIRONMENT;
  });

  it("loads the live catalog when production is selected", async () => {
    process.env.BACHS_ENVIRONMENT = "live";
    jest.spyOn(db, "execute").mockResolvedValue({ rows: [] } as never);
    await expect(
      new BillingCatalogAdminService().list(),
    ).resolves.toMatchObject({
      environment: "live",
      liveEditingEnabled: true,
    });
  });

  it("reports checkout gates without exposing provider secrets", async () => {
    process.env.BACHS_ENVIRONMENT = "sandbox";
    const rows = products.map((product) => ({
      product_key: product.productKey,
      fulfillment_kind: "one_time_pass",
      renewal_mode: "one_time",
      amount_minor: String(product.amountMinor),
      currency: product.currency,
      cadence: product.productKey.split("_")[1],
      entitlement_duration: "31 days",
      enabled: false,
      catalog_version: 1,
      provider_product_id: null,
    }));
    jest.spyOn(db, "execute").mockResolvedValue({ rows } as never);

    const result = await new BillingCatalogAdminService().list();

    expect(result.readiness).toEqual({
      providerApiConfigured: false,
      webhookConfigured: false,
      paymentShellConfigured: false,
      paymentShellSchemaReady: false,
      mappedPlanCount: 0,
      enabledPlanCount: 0,
      mappedEnabledPlanCount: 0,
      purchasesReady: false,
    });
    expect(JSON.stringify(result)).not.toMatch(/apiKey|secret/i);
  });

  it("allows mapped disabled products while requiring every enabled product to be mapped", async () => {
    const env = {
      BACHS_CHECKOUT_ENABLED: process.env.BACHS_CHECKOUT_ENABLED,
      BACHS_API_BASE_URL: process.env.BACHS_API_BASE_URL,
      BACHS_API_KEY: process.env.BACHS_API_KEY,
      BACHS_WEBHOOK_ENABLED: process.env.BACHS_WEBHOOK_ENABLED,
      BACHS_WEBHOOK_SECRET: process.env.BACHS_WEBHOOK_SECRET,
      BACHS_EXPECTED_ORGANIZATION_ID:
        process.env.BACHS_EXPECTED_ORGANIZATION_ID,
      BILLING_PAY_SHELL_ENABLED: process.env.BILLING_PAY_SHELL_ENABLED,
      BILLING_PAY_SHELL_API_KEY: process.env.BILLING_PAY_SHELL_API_KEY,
    };
    Object.assign(process.env, {
      BACHS_ENVIRONMENT: "sandbox",
      BACHS_CHECKOUT_ENABLED: "true",
      BACHS_API_BASE_URL: "https://sandbox-api.bachs.io",
      BACHS_API_KEY: "sk_sandbox_test_key",
      BACHS_WEBHOOK_ENABLED: "true",
      BACHS_WEBHOOK_SECRET: "whsec_test_key",
      BACHS_EXPECTED_ORGANIZATION_ID: "org_edutu_test",
      BILLING_PAY_SHELL_ENABLED: "true",
      BILLING_PAY_SHELL_API_KEY: "x".repeat(40),
    });
    const rows = products.map((product, index) => ({
      product_key: product.productKey,
      fulfillment_kind: "one_time_pass",
      renewal_mode: "one_time",
      amount_minor: String(product.amountMinor),
      currency: product.currency,
      cadence: product.productKey.split("_")[1],
      entitlement_duration: "31 days",
      enabled: index === 0,
      catalog_version: 1,
      provider_product_id: `prod_${product.productKey}`,
    }));
    jest.spyOn(db, "execute").mockResolvedValue({ rows } as never);
    const payShell = { ready: jest.fn().mockResolvedValue(true) };

    try {
      const result = await new BillingCatalogAdminService(
        payShell as never,
      ).list();
      expect(result.readiness).toMatchObject({
        mappedPlanCount: planKeys.length,
        enabledPlanCount: 1,
        mappedEnabledPlanCount: 1,
        purchasesReady: true,
      });
    } finally {
      for (const [key, value] of Object.entries(env)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("recognizes live Bachs API configuration and live product mappings as ready", async () => {
    const env = {
      BACHS_ENVIRONMENT: process.env.BACHS_ENVIRONMENT,
      BACHS_CHECKOUT_ENABLED: process.env.BACHS_CHECKOUT_ENABLED,
      BACHS_API_BASE_URL: process.env.BACHS_API_BASE_URL,
      BACHS_API_KEY: process.env.BACHS_API_KEY,
      BACHS_WEBHOOK_ENABLED: process.env.BACHS_WEBHOOK_ENABLED,
      BACHS_WEBHOOK_SECRET: process.env.BACHS_WEBHOOK_SECRET,
      BACHS_EXPECTED_ORGANIZATION_ID:
        process.env.BACHS_EXPECTED_ORGANIZATION_ID,
      BILLING_PAY_SHELL_ENABLED: process.env.BILLING_PAY_SHELL_ENABLED,
      BILLING_PAY_SHELL_API_KEY: process.env.BILLING_PAY_SHELL_API_KEY,
    };
    Object.assign(process.env, {
      BACHS_ENVIRONMENT: "live",
      BACHS_CHECKOUT_ENABLED: "true",
      BACHS_API_BASE_URL: "https://api.bachs.io",
      BACHS_API_KEY: "sk_live_test_key",
      BACHS_WEBHOOK_ENABLED: "true",
      BACHS_WEBHOOK_SECRET: "whsec_test_key",
      BACHS_EXPECTED_ORGANIZATION_ID: "org_edutu_test",
      BILLING_PAY_SHELL_ENABLED: "true",
      BILLING_PAY_SHELL_API_KEY: "x".repeat(40),
    });
    const rows = products.map((product) => ({
      product_key: product.productKey,
      fulfillment_kind: "subscription",
      renewal_mode: "recurring",
      amount_minor: String(product.amountMinor),
      currency: product.currency,
      cadence: product.productKey.split("_")[1],
      entitlement_duration: null,
      enabled: true,
      catalog_version: 1,
      provider_product_id: `prod_${product.productKey}`,
    }));
    jest.spyOn(db, "execute").mockResolvedValue({ rows } as never);
    const payShell = { ready: jest.fn().mockResolvedValue(true) };

    try {
      const result = await new BillingCatalogAdminService(
        payShell as never,
      ).list();
      expect(result.readiness).toMatchObject({
        providerApiConfigured: true,
        webhookConfigured: true,
        paymentShellConfigured: true,
        paymentShellSchemaReady: true,
        mappedPlanCount: planKeys.length,
        enabledPlanCount: planKeys.length,
        mappedEnabledPlanCount: planKeys.length,
        purchasesReady: true,
      });
    } finally {
      for (const [key, value] of Object.entries(env)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("rejects enabling a plan without a provider product mapping", async () => {
    const invalid = products.map((product, index) =>
      index === 0
        ? { ...product, providerProductId: "", enabled: true }
        : product,
    );
    await expect(
      new BillingCatalogAdminService().save(
        { authId: "admin_1", role: "admin" },
        "Configure catalog",
        invalid,
      ),
    ).rejects.toThrow("Add a Bachs product ID before enabling a plan");
  });

  it("verifies enabled plans against active fixed recurring Bachs products before saving", async () => {
    process.env.BACHS_ENVIRONMENT = "sandbox";
    const enabled = products.map((product, index) => ({
      ...product,
      enabled: index === 0,
    }));
    const provider = {
      getProduct: jest.fn().mockResolvedValue({
        id: enabled[0].providerProductId,
        status: "active",
        price: { priceType: "fixed", currency: "USD", amount: "15.00" },
        billingCycle: { interval: "week", frequency: 1 },
      }),
    };
    const transaction = jest
      .spyOn(db, "transaction")
      .mockResolvedValue({} as never);

    await new BillingCatalogAdminService(undefined, provider as never).save(
      { authId: "admin_1", role: "admin" },
      "Enable verified plan",
      enabled,
    );

    expect(provider.getProduct).toHaveBeenCalledWith(
      enabled[0].providerProductId,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("does not let support or moderation staff change prices", async () => {
    process.env.BACHS_ENVIRONMENT = "sandbox";
    await expect(
      new BillingCatalogAdminService().save(
        { authId: "staff_1", role: "support_agent" },
        "Configure catalog",
        products,
      ),
    ).rejects.toThrow("Only a billing administrator can change plan prices");
  });

  it("writes sandbox product changes and audit records in one transaction", async () => {
    process.env.BACHS_ENVIRONMENT = "sandbox";
    const tx = {
      execute: jest.fn().mockResolvedValue({
        rows: [
          {
            amount_minor: "1500",
            currency: "USD",
            enabled: false,
            catalog_version: 1,
            provider_product_id: null,
          },
        ],
      }),
    };
    jest
      .spyOn(db, "transaction")
      .mockImplementation(async (callback) => callback(tx as never));

    const result = await new BillingCatalogAdminService().save(
      { authId: "user_admin_1", role: "admin" },
      "Map verified sandbox products",
      products,
    );

    expect(result.environment).toBe("sandbox");
    // Per product: lock current row, update server price, upsert mapping, append audit.
    // Final catalog read is also inside the same transaction.
    expect(tx.execute).toHaveBeenCalledTimes(PLAN_PRODUCT_KEYS_COUNT * 4 + 1);
  });
});

const PLAN_PRODUCT_KEYS_COUNT = planKeys.length;
