import { validateEnvironment } from "./main";

describe("production environment validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://db.example/edutu",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      CLERK_SECRET_KEY: "sk_live_clerk",
      CLERK_ISSUER_URL: "https://clerk.example.com",
      API_KEY_PEPPER: "0123456789abcdef",
      BACHS_CHECKOUT_ENABLED: "false",
      LEGACY_PAYSTACK_WEBHOOK_ENABLED: "false",
      REVENUECAT_SANDBOX_WEBHOOK_ENABLED: "false",
      REVENUECAT_PRODUCTION_WEBHOOK_ENABLED: "false",
    };
    delete process.env.CLERK_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.VITE_CLERK_PUBLISHABLE_KEY;
    delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_ALLOW_TEST_INSTANCE;
    delete process.env.EDUTU_LOCAL_ADMIN_BYPASS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it.each([undefined, "", "staging", "prod", "production-like"])(
    "rejects unsupported NODE_ENV=%s before accepting runtime configuration",
    (nodeEnv) => {
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;

      expect(() => validateEnvironment()).toThrow("NODE_ENV");
    },
  );

  it("accepts complete production identity and database configuration", () => {
    expect(() => validateEnvironment()).not.toThrow();
  });

  it.each([
    "DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "API_KEY_PEPPER",
  ])("rejects production when %s is missing", (key) => {
    delete process.env[key];

    expect(() => validateEnvironment()).toThrow(key);
  });

  it("rejects production when no Clerk verification configuration is present", () => {
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.CLERK_JWT_KEY;
    delete process.env.CLERK_ISSUER_URL;
    delete process.env.CLERK_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.VITE_CLERK_PUBLISHABLE_KEY;
    delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

    expect(() => validateEnvironment()).toThrow(
      "Clerk verification configuration",
    );
  });

  it("rejects a short production API key pepper", () => {
    process.env.API_KEY_PEPPER = "too-short";

    expect(() => validateEnvironment()).toThrow("at least 16 characters");
  });

  it("rejects the local admin bypass in production", () => {
    process.env.EDUTU_LOCAL_ADMIN_BYPASS = "true";

    expect(() => validateEnvironment()).toThrow("EDUTU_LOCAL_ADMIN_BYPASS");
  });

  it("rejects incomplete enabled Bachs configuration", () => {
    process.env.BACHS_CHECKOUT_ENABLED = "true";

    expect(() => validateEnvironment()).toThrow("BACHS_ENVIRONMENT");
  });

  it("requires the legacy Paystack webhook secret when enabled", () => {
    process.env.LEGACY_PAYSTACK_WEBHOOK_ENABLED = "true";
    delete process.env.PAYSTACK_SECRET_KEY;

    expect(() => validateEnvironment()).toThrow("PAYSTACK_SECRET_KEY");
  });

  it("rejects incomplete enabled RevenueCat delivery", () => {
    process.env.REVENUECAT_PRODUCTION_WEBHOOK_ENABLED = "true";

    expect(() => validateEnvironment()).toThrow(
      "REVENUECAT_PRODUCTION_AUTHORIZATION_SECRET",
    );
  });

  it("accepts complete isolated RevenueCat webhook boundaries", () => {
    Object.assign(process.env, {
      REVENUECAT_SANDBOX_WEBHOOK_ENABLED: "true",
      REVENUECAT_SANDBOX_AUTHORIZATION_SECRET:
        "sandbox-authorization-secret-123456",
      REVENUECAT_SANDBOX_HMAC_SECRET: "sandbox-hmac-secret-123456789012",
      REVENUECAT_SANDBOX_ALLOWED_APP_IDS: "app_ios_sandbox,app_android_sandbox",
      REVENUECAT_SANDBOX_ALLOWED_STORES: "APP_STORE,PLAY_STORE,TEST_STORE",
      REVENUECAT_PRODUCTION_WEBHOOK_ENABLED: "true",
      REVENUECAT_PRODUCTION_AUTHORIZATION_SECRET:
        "production-authorization-secret-123",
      REVENUECAT_PRODUCTION_HMAC_SECRET: "production-hmac-secret-123456789",
      REVENUECAT_PRODUCTION_ALLOWED_APP_IDS:
        "app_ios_production,app_android_production",
      REVENUECAT_PRODUCTION_ALLOWED_STORES: "APP_STORE,PLAY_STORE",
      NATIVE_IAP_PURCHASES_ENABLED: "false",
    });

    expect(() => validateEnvironment()).not.toThrow();
  });
});
