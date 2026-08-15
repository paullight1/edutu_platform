import {
  getSubscriptionTierForProductKey,
  isApiCreditProductKey,
  isSubscriptionProductKey,
} from "./plan-tiers";

describe("subscription plan catalog", () => {
  it.each([
    ["lite_weekly_pass", "lite"],
    ["lite_monthly_pass", "lite"],
    ["lite_yearly_pass", "lite"],
    ["pro_weekly_pass", "pro"],
    ["pro_monthly_pass", "pro"],
    ["pro_yearly_pass", "pro"],
    ["scholar_weekly_pass", "scholar"],
    ["scholar_monthly_pass", "scholar"],
    ["scholar_yearly_pass", "scholar"],
  ] as const)("maps %s to the %s tier", (productKey, tier) => {
    expect(isSubscriptionProductKey(productKey)).toBe(true);
    expect(getSubscriptionTierForProductKey(productKey)).toBe(tier);
  });

  it("keeps developer API credits out of consumer subscription tiers", () => {
    expect(isApiCreditProductKey("api_credits_100")).toBe(true);
    expect(isSubscriptionProductKey("api_credits_100")).toBe(false);
    expect(getSubscriptionTierForProductKey("api_credits_100")).toBeNull();
  });
});
