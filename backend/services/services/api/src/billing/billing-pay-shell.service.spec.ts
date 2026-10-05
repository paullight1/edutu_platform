import { BadRequestException } from "@nestjs/common";
import { BillingPayShellService } from "./billing-pay-shell.service";
import type { CheckoutServiceConfig } from "./types/billing-checkout.types";

describe("BillingPayShellService", () => {
  it("rejects an account handoff that carries a checkout intent", async () => {
    const persistence = {
      ready: jest.fn().mockResolvedValue(true),
      issue: jest.fn(),
    };
    const checkout = {
      getOwnedCheckoutStatus: jest.fn(),
    };
    const service = new BillingPayShellService(
      persistence as never,
      checkout as never,
      { now: () => new Date("2026-10-04T00:00:00Z") },
      {
        checkoutEnabled: true,
        hostedCompletionEnabled: true,
        environment: "sandbox",
        productMappings: {},
      } satisfies CheckoutServiceConfig,
    );

    await expect(
      service.issueHandoff("user-1", {
        destination: "account",
        intentId: "00000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(checkout.getOwnedCheckoutStatus).not.toHaveBeenCalled();
    expect(persistence.issue).not.toHaveBeenCalled();
  });
});
