import {
  billingClassForEndpoint,
  stableApiError,
} from "./edutu-api-billing-policy";

describe("Edutu API billing policy", () => {
  it.each([
    ["GET", "/v1/health"],
    ["GET", "/v1/usage"],
    ["GET", "/v1/categories"],
    ["GET", "/v1/categories?country=NG"],
  ])("classifies %s %s as free", (method, path) => {
    expect(billingClassForEndpoint(method, path)).toBe("free");
  });

  it.each([
    ["GET", "/v1/opportunities"],
    ["GET", "/v1/opportunities/stats"],
    ["GET", "/v1/opportunities/sync"],
    ["GET", "/v1/opportunities/opp-1"],
    ["POST", "/v1/recommendations"],
    ["POST", "/v1/events"],
  ])("classifies %s %s as credit", (method, path) => {
    expect(billingClassForEndpoint(method, path)).toBe("credit");
  });

  it("creates a stable machine-readable error payload", () => {
    expect(
      stableApiError(
        "billing_unavailable",
        "req-123",
        "API billing is temporarily unavailable",
      ),
    ).toEqual({
      code: "billing_unavailable",
      requestId: "req-123",
      message: "API billing is temporarily unavailable",
    });
  });
});
