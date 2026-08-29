import { describe, expect, it } from "vitest";
import { validateLocalClerkPublishableKey } from "./clerkEnvironment";

describe("validateLocalClerkPublishableKey", () => {
  it("accepts a Clerk development-instance key for localhost", () => {
    expect(
      validateLocalClerkPublishableKey("pk_test_example", true),
    ).toBeNull();
  });

  it("rejects a production-instance key before the browser gets stuck", () => {
    expect(
      validateLocalClerkPublishableKey("pk_live_example", true),
    ).toContain("pk_test_");
  });

  it("rejects a missing local key with the environment variable name", () => {
    expect(validateLocalClerkPublishableKey(undefined, true)).toContain(
      "VITE_CLERK_PUBLISHABLE_KEY",
    );
  });

  it("does not apply localhost rules to production builds", () => {
    expect(
      validateLocalClerkPublishableKey("pk_live_example", false),
    ).toBeNull();
  });
});
