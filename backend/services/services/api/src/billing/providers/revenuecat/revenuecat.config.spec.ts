import {
  RevenueCatConfigError,
  loadRevenueCatDeliveryConfig,
  loadRevenueCatDeliveryConfigs,
} from "./revenuecat.config";

describe("RevenueCat delivery configuration", () => {
  const valid = {
    REVENUECAT_SANDBOX_WEBHOOK_ENABLED: "true",
    REVENUECAT_SANDBOX_AUTHORIZATION_SECRET:
      "sandbox-authorization-secret-123456",
    REVENUECAT_SANDBOX_HMAC_SECRET: "sandbox-hmac-secret-123456789012",
    REVENUECAT_SANDBOX_ALLOWED_APP_IDS: "app_ios_sandbox,app_android_sandbox",
    REVENUECAT_SANDBOX_ALLOWED_STORES:
      "APP_STORE,PLAY_STORE,TEST_STORE",
    REVENUECAT_PRODUCTION_WEBHOOK_ENABLED: "true",
    REVENUECAT_PRODUCTION_AUTHORIZATION_SECRET:
      "production-authorization-secret-123",
    REVENUECAT_PRODUCTION_HMAC_SECRET:
      "production-hmac-secret-123456789",
    REVENUECAT_PRODUCTION_ALLOWED_APP_IDS:
      "app_ios_production,app_android_production",
    REVENUECAT_PRODUCTION_ALLOWED_STORES: "APP_STORE,PLAY_STORE",
  };

  it("loads isolated sandbox and production delivery boundaries", () => {
    expect(loadRevenueCatDeliveryConfig("sandbox", valid)).toEqual({
      enabled: true,
      environment: "sandbox",
      expectedEnvironment: "SANDBOX",
      authorizationSecret: "sandbox-authorization-secret-123456",
      hmacSecret: "sandbox-hmac-secret-123456789012",
      allowedAppIds: ["app_ios_sandbox", "app_android_sandbox"],
      allowedStores: ["APP_STORE", "PLAY_STORE", "TEST_STORE"],
    });
    expect(loadRevenueCatDeliveryConfig("production", valid)).toEqual({
      enabled: true,
      environment: "production",
      expectedEnvironment: "PRODUCTION",
      authorizationSecret: "production-authorization-secret-123",
      hmacSecret: "production-hmac-secret-123456789",
      allowedAppIds: ["app_ios_production", "app_android_production"],
      allowedStores: ["APP_STORE", "PLAY_STORE"],
    });
  });

  it("returns a closed disabled configuration without reading secrets", () => {
    expect(loadRevenueCatDeliveryConfig("sandbox", {})).toEqual({
      enabled: false,
      environment: "sandbox",
      expectedEnvironment: "SANDBOX",
    });
  });

  it.each([
    "REVENUECAT_SANDBOX_AUTHORIZATION_SECRET",
    "REVENUECAT_SANDBOX_HMAC_SECRET",
    "REVENUECAT_SANDBOX_ALLOWED_APP_IDS",
    "REVENUECAT_SANDBOX_ALLOWED_STORES",
  ])("rejects enabled sandbox delivery when %s is missing", (key) => {
    const environment = { ...valid, [key]: "" };
    expect(() => loadRevenueCatDeliveryConfig("sandbox", environment)).toThrow(
      key,
    );
  });

  it.each(["yes", "TRUE", "1", "enabled"])(
    "rejects ambiguous boolean flag %s",
    (flag) => {
      expect(() =>
        loadRevenueCatDeliveryConfig("sandbox", {
          ...valid,
          REVENUECAT_SANDBOX_WEBHOOK_ENABLED: flag,
        }),
      ).toThrow("must be exactly true or false");
    },
  );

  it("rejects empty, duplicate, and malformed app allowlists", () => {
    for (const value of ["", "app_one,app_one", "app one", ",app_one"]) {
      expect(() =>
        loadRevenueCatDeliveryConfig("sandbox", {
          ...valid,
          REVENUECAT_SANDBOX_ALLOWED_APP_IDS: value,
        }),
      ).toThrow(RevenueCatConfigError);
    }
  });

  it("rejects unknown stores and Test Store in production", () => {
    expect(() =>
      loadRevenueCatDeliveryConfig("sandbox", {
        ...valid,
        REVENUECAT_SANDBOX_ALLOWED_STORES: "APP_STORE,STRIPE",
      }),
    ).toThrow("ALLOWED_STORES");
    expect(() =>
      loadRevenueCatDeliveryConfig("production", {
        ...valid,
        REVENUECAT_PRODUCTION_ALLOWED_STORES:
          "APP_STORE,PLAY_STORE,TEST_STORE",
      }),
    ).toThrow("TEST_STORE");
  });

  it("requires independent authorization and HMAC secrets", () => {
    expect(() =>
      loadRevenueCatDeliveryConfigs({
        ...valid,
        REVENUECAT_PRODUCTION_AUTHORIZATION_SECRET:
          valid.REVENUECAT_SANDBOX_AUTHORIZATION_SECRET,
      }),
    ).toThrow("authorization secrets must be different");
    expect(() =>
      loadRevenueCatDeliveryConfigs({
        ...valid,
        REVENUECAT_PRODUCTION_HMAC_SECRET:
          valid.REVENUECAT_SANDBOX_HMAC_SECRET,
      }),
    ).toThrow("HMAC secrets must be different");
  });

  it("requires high-entropy webhook secrets", () => {
    expect(() =>
      loadRevenueCatDeliveryConfig("sandbox", {
        ...valid,
        REVENUECAT_SANDBOX_HMAC_SECRET: "short",
      }),
    ).toThrow("at least 32 bytes");
  });
});
