import { BachsConfigError, loadBachsConfig } from "./bachs.config";

const baseEnvironment = {
  BACHS_CHECKOUT_ENABLED: "true",
  BACHS_WEBHOOK_ENABLED: "true",
  BACHS_ENVIRONMENT: "sandbox",
  BACHS_API_BASE_URL: "https://sandbox-api.bachs.io",
  BACHS_API_KEY: "sandbox-api-key",
  BACHS_WEBHOOK_SECRET: "sandbox-webhook-secret",
  BACHS_EXPECTED_ORGANIZATION_ID: "org_test",
  BACHS_PRODUCT_MAPPINGS: "{}",
};

describe("Bachs configuration", () => {
  it("allows learner plans to use the database catalog without environment mappings", () => {
    const config = loadBachsConfig(baseEnvironment);
    expect(config.productMappings).toEqual({});
    expect(config.productCatalog).toEqual({});
  });

  it("rejects learner plan mappings in environment config to prevent catalog drift", () => {
    expect(() =>
      loadBachsConfig({
        ...baseEnvironment,
        BACHS_PRODUCT_MAPPINGS: JSON.stringify({
          pro_monthly_pass: "prod_pro_monthly",
        }),
      }),
    ).toThrow(BachsConfigError);
  });

  it("requires signed webhooks whenever checkout can start", () => {
    expect(() =>
      loadBachsConfig({
        ...baseEnvironment,
        BACHS_WEBHOOK_ENABLED: "false",
      }),
    ).toThrow("BACHS_WEBHOOK_ENABLED must be true");
  });
});
