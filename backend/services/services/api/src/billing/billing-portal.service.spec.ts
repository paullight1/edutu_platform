import { BadGatewayException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { BillingPortalService } from "./billing-portal.service";
import {
  type BillingPortalRepositoryPort,
  type BillingPortalProviderPort,
  type CheckoutServiceConfig,
} from "./types/billing-checkout.types";

class FakePortalRepository implements BillingPortalRepositoryPort {
  customerId: string | null = "customer-1";
  calls: Array<{ userId: string; environment: string }> = [];

  async findProviderCustomerId(userId: string, environment: "sandbox" | "live") {
    this.calls.push({ userId, environment });
    return this.customerId;
  }
}

class FakePortalProvider implements BillingPortalProviderPort {
  calls: Array<{ customerId: string; idempotencyKey: string }> = [];
  response = { id: "portal-1", url: "https://portal.bachs.io/s/session-1" };
  error: Error | null = null;

  async createPortalSession(input: { customerId: string; idempotencyKey: string }) {
    this.calls.push(input);
    if (this.error) throw this.error;
    return this.response;
  }
}

const config: CheckoutServiceConfig = {
  checkoutEnabled: true,
  environment: "sandbox",
  productMappings: {},
};

function createFixture() {
  const repository = new FakePortalRepository();
  const provider = new FakePortalProvider();
  const service = new BillingPortalService(repository, provider, config);
  return { repository, provider, service };
}

describe("BillingPortalService", () => {
  it("resolves the customer by raw auth subject and returns a fresh exact-origin portal URL", async () => {
    const fixture = createFixture();

    const result = await fixture.service.createPortalSession("user_123", "operation-1");

    expect(result).toEqual({ url: "https://portal.bachs.io/s/session-1" });
    expect(fixture.repository.calls).toEqual([{ userId: "user_123", environment: "sandbox" }]);
    expect(fixture.provider.calls).toEqual([
      { customerId: "customer-1", idempotencyKey: expect.any(String) },
    ]);
  });

  it("never resolves a portal customer by email or by a client-supplied customer id", async () => {
    const fixture = createFixture();

    await fixture.service.createPortalSession("user_123", "operation-2");

    expect(fixture.provider.calls[0].customerId).toBe("customer-1");
    expect(fixture.repository.calls[0].userId).toBe("user_123");
    expect(JSON.stringify(fixture.provider.calls[0])).not.toContain("@example.com");
  });

  it("returns not-found without calling Bachs when no customer mapping exists", async () => {
    const fixture = createFixture();
    fixture.repository.customerId = null;

    await expect(
      fixture.service.createPortalSession("user_123", "no-customer"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fixture.provider.calls).toHaveLength(0);
  });

  it("rejects a portal URL outside the exact hosted portal origin", async () => {
    const fixture = createFixture();
    fixture.provider.response = {
      id: "portal-1",
      url: "https://evil.example/portal",
    };

    await expect(
      fixture.service.createPortalSession("user_123", "bad-portal-url"),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it("does not cache portal URLs and passes a new operation key through for a new attempt", async () => {
    const fixture = createFixture();
    await fixture.service.createPortalSession("user_123", "operation-a");
    await fixture.service.createPortalSession("user_123", "operation-b");

    expect(fixture.provider.calls).toHaveLength(2);
    expect(fixture.provider.calls[0].idempotencyKey).not.toBe(
      fixture.provider.calls[1].idempotencyKey,
    );
  });

  it("allows the caller to retry a network-failed portal attempt without persisting a URL", async () => {
    const fixture = createFixture();
    fixture.provider.error = Object.assign(new Error("timeout"), { retryable: true });

    await expect(
      fixture.service.createPortalSession("user_123", "retry-operation"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fixture.provider.calls).toHaveLength(1);

    fixture.provider.error = null;
    await fixture.service.createPortalSession("user_123", "retry-operation");
    expect(fixture.provider.calls).toHaveLength(2);
  });
});
