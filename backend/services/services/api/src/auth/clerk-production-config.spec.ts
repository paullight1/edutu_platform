import {
  assertProductionClerkIssuerLock,
  resolveConfiguredClerkIssuer,
} from "./clerk-production-config";

function publishable(prefix: "test" | "live", host: string): string {
  return `pk_${prefix}_${Buffer.from(`${host}$`, "utf8").toString("base64")}`;
}

describe("production Clerk issuer configuration", () => {
  it("resolves an explicit HTTPS issuer", () => {
    expect(
      resolveConfiguredClerkIssuer({ CLERK_ISSUER_URL: "https://clerk.example.com/" }),
    ).toBe("https://clerk.example.com");
  });

  it("derives the issuer from a live publishable key", () => {
    expect(
      resolveConfiguredClerkIssuer({
        CLERK_PUBLISHABLE_KEY: publishable("live", "clerk.edutu.org"),
      }),
    ).toBe("https://clerk.edutu.org");
  });

  it("rejects production without an issuer pin", () => {
    expect(() => assertProductionClerkIssuerLock({})).toThrow(
      "requires CLERK_ISSUER_URL",
    );
  });

  it("rejects a test instance in production by default", () => {
    expect(() =>
      assertProductionClerkIssuerLock({
        CLERK_PUBLISHABLE_KEY: publishable("test", "clerk.example.com"),
      }),
    ).toThrow("must not trust a Clerk test instance");
  });

  it("allows an explicitly isolated test instance only with the escape hatch", () => {
    expect(() =>
      assertProductionClerkIssuerLock({
        CLERK_PUBLISHABLE_KEY: publishable("test", "clerk.example.com"),
        CLERK_ALLOW_TEST_INSTANCE: "true",
      }),
    ).not.toThrow();
  });
});
