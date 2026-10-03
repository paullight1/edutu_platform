import { describe, expect, it } from "vitest";
import { googleSignupWelcomeRedirect, isInternalDestination } from "./googleSignupWelcome";

describe("Google signup welcome redirect", () => {
  it("opens the dashboard welcome for a new Google account", () => {
    expect(googleSignupWelcomeRedirect()).toBe("/dashboard?welcome=google");
  });

  it("preserves a member's intended opportunity destination", () => {
    const params = new URLSearchParams(
      googleSignupWelcomeRedirect("/app/opportunity/opp-1?source=saved").split("?")[1],
    );
    expect(params.get("welcome")).toBe("google");
    expect(params.get("returnTo")).toBe("/app/opportunity/opp-1?source=saved");
  });

  it.each(["https://example.com", "//example.com", "/\\example.com", null])(
    "rejects an external return destination: %s",
    (destination) => expect(isInternalDestination(destination)).toBe(false),
  );
});
