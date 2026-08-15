import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { BillingCheckoutService } from "./billing-checkout.service";
import {
  BACHS_CHECKOUT_REPOSITORY,
  BACHS_CHECKOUT_SUCCESS_URL,
  type BillingCheckoutRepositoryPort,
  type BillingCheckoutProduct,
  type BillingCheckoutIntentRecord,
  type BillingCheckoutProviderPort,
  type BillingCustomerIdentityResolver,
  type BillingRateLimiterPort,
  type CheckoutRateLimitDecision,
  type CheckoutServiceConfig,
  type ClockPort,
} from "./types/billing-checkout.types";

const product: BillingCheckoutProduct = {
  productKey: "pro_monthly_pass",
  provider: "bachs",
  environment: "sandbox",
  providerProductId: "prod_monthly_sandbox",
  fulfillmentKind: "pro",
  renewalMode: "one_time",
  expectedAmountMinor: 699,
  currency: "USD",
  cadence: "monthly",
  creditQuantity: null,
  validityDays: 31,
  allowedPaymentMethods: ["card", "crypto"],
  catalogVersion: 3,
};

const recurringProduct: BillingCheckoutProduct = {
  ...product,
  productKey: "pro_monthly_recurring",
  providerProductId: "prod_monthly_recurring_sandbox",
  renewalMode: "recurring",
  validityDays: null,
};

const apiCreditProduct: BillingCheckoutProduct = {
  productKey: "api_credits_100",
  provider: "bachs",
  environment: "sandbox",
  providerProductId: "prod_api_credits_100_sandbox",
  fulfillmentKind: "credits",
  renewalMode: "one_time",
  expectedAmountMinor: 499,
  currency: "USD",
  cadence: "one_time",
  creditQuantity: 100,
  validityDays: null,
  allowedPaymentMethods: ["card"],
  catalogVersion: 1,
};

const config: CheckoutServiceConfig = {
  checkoutEnabled: true,
  environment: "sandbox",
  productMappings: {
    [product.productKey]: product.providerProductId!,
    [recurringProduct.productKey]: recurringProduct.providerProductId!,
    [apiCreditProduct.productKey]: apiCreditProduct.providerProductId!,
  },
  productCatalog: {
    [apiCreditProduct.productKey]: {
      providerProductId: apiCreditProduct.providerProductId!,
      expectedAmountMinor: apiCreditProduct.expectedAmountMinor,
      currency: apiCreditProduct.currency,
      environment: "sandbox",
    },
  },
};

class FakeClock implements ClockPort {
  nowValue = new Date("2026-08-11T10:00:00.000Z");

  now(): Date {
    return this.nowValue;
  }
}

class FakeRateLimiter implements BillingRateLimiterPort {
  calls = 0;
  decision: CheckoutRateLimitDecision = { allowed: true };

  reserve(): CheckoutRateLimitDecision {
    this.calls += 1;
    return this.decision;
  }
}

class FakeIdentityResolver implements BillingCustomerIdentityResolver {
  resolution:
    | { status: "resolved"; email: string; name?: string }
    | { status: "missing" | "ambiguous" } = {
    status: "resolved",
    email: "student@example.com",
    name: "Student",
  };

  resolveCustomer() {
    return this.resolution;
  }
}

class FakeRepository implements BillingCheckoutRepositoryPort {
  product: BillingCheckoutProduct | null = product;
  calls: Array<
    Parameters<BillingCheckoutRepositoryPort["createOrReuseIntent"]>[0]
  > = [];
  attached: Array<
    Parameters<BillingCheckoutRepositoryPort["attachProviderCheckout"]>[0]
  > = [];
  failed: Array<
    Parameters<BillingCheckoutRepositoryPort["markIntentFailed"]>[0]
  > = [];
  nextCreated = true;
  intentCounter = 0;
  currentIntent: BillingCheckoutIntentRecord | null = null;
  developer = false;

  async findEnabledProduct() {
    return this.product;
  }

  async hasActiveApiConsumer() {
    return this.developer;
  }

  async createOrReuseIntent(
    input: Parameters<BillingCheckoutRepositoryPort["createOrReuseIntent"]>[0],
  ) {
    this.calls.push(input);
    if (this.currentIntent && !this.nextCreated) {
      return { intent: this.currentIntent, created: false };
    }
    this.intentCounter += 1;
    this.currentIntent = {
      id: `intent-${this.intentCounter}`,
      userId: input.userId,
      productKey: input.product.productKey,
      providerCheckoutId: null,
      providerReference: `intent-${this.intentCounter}`,
      providerCheckoutUrl: null,
      status: "creating",
      expiresAt: null,
      renewalMode: input.product.renewalMode,
      expectedAmountMinor: input.product.expectedAmountMinor,
      currency: input.product.currency,
      productSnapshot: input.product,
    };
    return { intent: this.currentIntent, created: true };
  }

  async attachProviderCheckout(
    input: Parameters<
      BillingCheckoutRepositoryPort["attachProviderCheckout"]
    >[0],
  ) {
    this.attached.push(input);
    if (this.currentIntent?.id === input.intentId) {
      this.currentIntent = {
        ...this.currentIntent,
        providerCheckoutId: input.checkoutId,
        providerCheckoutUrl: input.checkoutUrl,
        status: "open",
        expiresAt: input.expiresAt,
      };
    }
  }

  async markIntentFailed(
    input: Parameters<BillingCheckoutRepositoryPort["markIntentFailed"]>[0],
  ) {
    this.failed.push(input);
  }
}

class FakeProvider implements BillingCheckoutProviderPort {
  calls: Array<
    Parameters<BillingCheckoutProviderPort["createCheckoutSession"]>[0]
  > = [];
  getCalls: string[] = [];
  error: Error | null = null;
  session = {
    checkoutId: "checkout-1",
    checkoutUrl: "https://checkout.bachs.io/s/session-1",
    status: "open" as const,
    expiresAt: "2026-08-11T11:00:00.000Z",
    createdAt: "2026-08-11T10:00:01.000Z",
    reference: "intent-1",
  };

  async createCheckoutSession(
    input: Parameters<BillingCheckoutProviderPort["createCheckoutSession"]>[0],
  ) {
    this.calls.push(input);
    if (this.error) throw this.error;
    return this.session;
  }

  async getCheckoutSession(checkoutId: string) {
    this.getCalls.push(checkoutId);
    return this.session;
  }
}

function createFixture() {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  const clock = new FakeClock();
  const rateLimiter = new FakeRateLimiter();
  const identity = new FakeIdentityResolver();
  const service = new BillingCheckoutService(
    repository,
    provider,
    identity,
    clock,
    rateLimiter,
    config,
  );
  return { repository, provider, clock, rateLimiter, identity, service };
}

describe("BillingCheckoutService", () => {
  it("creates the local intent before calling Bachs and returns a server-owned snapshot", async () => {
    const { service, repository, provider } = createFixture();

    const result = await service.createCheckout("user_123", "request-1", {
      productKey: product.productKey,
      returnSurface: "web",
    });

    expect(repository.calls).toHaveLength(1);
    expect(provider.calls).toHaveLength(1);
    expect(repository.calls[0].userId).toBe("user_123");
    expect(provider.calls[0]).toMatchObject({
      productId: product.providerProductId,
      reference: "intent-1",
      successUrl: BACHS_CHECKOUT_SUCCESS_URL,
      cancelUrl: "https://pay.edutu.org/result?state=cancelled",
    });
    expect(result).toMatchObject({
      intentId: "intent-1",
      checkoutUrl: "https://checkout.bachs.io/s/session-1",
      renewalMode: "one_time",
      productSnapshot: {
        productKey: product.productKey,
        expectedAmountMinor: 699,
        currency: "USD",
      },
    });
  });

  it("does not accept a client-supplied email, uid, amount, or provider id", async () => {
    const { service, provider } = createFixture();

    await service.createCheckout("user_123", "request-2", {
      productKey: product.productKey,
      returnSurface: "pwa",
    });

    expect(provider.calls[0].customer.email).toBe("student@example.com");
    expect(provider.calls[0].metadata).toEqual({ edutu_intent_id: "intent-1" });
    expect(JSON.stringify(provider.calls[0])).not.toContain("user_123");
  });

  it("replays an open intent on a double tap without calling Bachs again or consuming cooldown", async () => {
    const fixture = createFixture();
    await fixture.service.createCheckout("user_123", "same-key", {
      productKey: product.productKey,
      returnSurface: "web",
    });
    fixture.repository.nextCreated = false;

    const result = await fixture.service.createCheckout(
      "user_123",
      "same-key",
      {
        productKey: product.productKey,
        returnSurface: "web",
      },
    );

    expect(result.checkoutUrl).toBe("https://checkout.bachs.io/s/session-1");
    expect(fixture.provider.calls).toHaveLength(1);
    expect(fixture.rateLimiter.calls).toBe(1);
  });

  it("retries a creating intent with the same provider idempotency key after a lost provider response", async () => {
    const fixture = createFixture();
    const timeout = Object.assign(new Error("timeout"), { retryable: true });
    fixture.provider.error = timeout;

    await expect(
      fixture.service.createCheckout("user_123", "lost-response", {
        productKey: product.productKey,
        returnSurface: "web",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fixture.repository.failed).toHaveLength(0);

    fixture.provider.error = null;
    fixture.repository.nextCreated = false;
    await fixture.service.createCheckout("user_123", "lost-response", {
      productKey: product.productKey,
      returnSurface: "web",
    });

    expect(fixture.provider.calls).toHaveLength(2);
    expect(fixture.provider.calls[0].idempotencyKey).toBe(
      fixture.provider.calls[1].idempotencyKey,
    );
  });

  it("marks a non-retryable provider error and never claims a checkout URL", async () => {
    const fixture = createFixture();
    fixture.provider.error = Object.assign(new Error("invalid product"), {
      retryable: false,
    });

    await expect(
      fixture.service.createCheckout("user_123", "provider-error", {
        productKey: product.productKey,
        returnSurface: "web",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fixture.repository.failed).toHaveLength(1);
  });

  it("rejects a Bachs URL outside the exact hosted checkout origin", async () => {
    const fixture = createFixture();
    fixture.provider.session = {
      ...fixture.provider.session,
      checkoutUrl: "https://evil.example/steal",
    };

    await expect(
      fixture.service.createCheckout("user_123", "bad-url", {
        productKey: product.productKey,
        returnSurface: "web",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fixture.repository.failed).toHaveLength(1);
  });

  it("rejects a disabled checkout feature before catalog or provider access", async () => {
    const fixture = createFixture();
    const disabledService = new BillingCheckoutService(
      fixture.repository,
      fixture.provider,
      fixture.identity,
      fixture.clock,
      fixture.rateLimiter,
      { ...config, checkoutEnabled: false },
    );

    await expect(
      disabledService.createCheckout("user_123", "disabled", {
        productKey: product.productKey,
        returnSurface: "web",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fixture.repository.calls).toHaveLength(0);
    expect(fixture.provider.calls).toHaveLength(0);
  });

  it("rejects a catalog product mapped to another environment", async () => {
    const fixture = createFixture();
    fixture.repository.product = {
      ...product,
      environment: "live",
      providerProductId: "prod_live",
    };

    await expect(
      fixture.service.createCheckout("user_123", "wrong-env", {
        productKey: product.productKey,
        returnSurface: "web",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fixture.provider.calls).toHaveLength(0);
  });

  it("rejects an enabled catalog product whose provider mapping does not match", async () => {
    const fixture = createFixture();
    fixture.repository.product = {
      ...product,
      providerProductId: "prod_other",
    };

    await expect(
      fixture.service.createCheckout("user_123", "wrong-map", {
        productKey: product.productKey,
        returnSurface: "web",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects missing, ambiguous, and invalid billing customer identity", async () => {
    const fixture = createFixture();
    fixture.identity.resolution = { status: "missing" };
    await expect(
      fixture.service.createCheckout("user_123", "missing-customer", {
        productKey: product.productKey,
        returnSurface: "web",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    fixture.identity.resolution = { status: "ambiguous" };
    await expect(
      fixture.service.createCheckout("user_123", "ambiguous-customer", {
        productKey: product.productKey,
        returnSurface: "web",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fixture.repository.calls).toHaveLength(0);
  });

  it("enforces a bounded user cooldown for a new key but allows the idempotent replay path", async () => {
    const fixture = createFixture();
    fixture.rateLimiter.decision = { allowed: false, retryAfterSeconds: 30 };

    await expect(
      fixture.service.createCheckout("user_123", "cooldown-1", {
        productKey: product.productKey,
        returnSurface: "web",
      }),
    ).rejects.toThrow("try again");
    expect(fixture.provider.calls).toHaveLength(0);

    fixture.repository.nextCreated = false;
    await expect(
      fixture.service.createCheckout("user_123", "cooldown-1", {
        productKey: product.productKey,
        returnSurface: "web",
      }),
    ).rejects.toThrow("try again");
    expect(fixture.rateLimiter.calls).toBe(1);
  });

  it("returns recurring mode separately from cadence", async () => {
    const fixture = createFixture();
    fixture.repository.product = recurringProduct;

    const result = await fixture.service.createCheckout(
      "user_123",
      "recurring",
      {
        productKey: recurringProduct.productKey,
        returnSurface: "web",
      },
    );

    expect(result.renewalMode).toBe("recurring");
    expect(result.productSnapshot.cadence).toBe("monthly");
    expect(result.productSnapshot.validityDays).toBeNull();
  });

  it.each([
    ["wrong fulfillment kind", { fulfillmentKind: "pro" }],
    ["recurring renewal", { renewalMode: "recurring" }],
    ["non-positive quantity", { creditQuantity: 0 }],
    ["expiring validity", { validityDays: 30 }],
    ["wrong provider mapping", { providerProductId: "prod_other" }],
    ["wrong amount", { expectedAmountMinor: 500 }],
    ["wrong currency", { currency: "NGN" }],
    ["missing provider", { provider: undefined }],
    ["missing environment", { environment: undefined }],
    ["wrong environment", { environment: "live" }],
  ])("rejects API credit products with invalid %s", async (_, changes) => {
    const fixture = createFixture();
    fixture.repository.product = {
      ...apiCreditProduct,
      ...changes,
    } as BillingCheckoutProduct;

    await expect(
      fixture.service.createCheckout("user_123", `invalid-${String(_)}`, {
        productKey: apiCreditProduct.productKey,
        returnSurface: "web",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fixture.provider.calls).toHaveLength(0);
  });

  it("creates and replays a server-owned API credit checkout without accepting client pricing fields", async () => {
    const fixture = createFixture();
    fixture.repository.product = apiCreditProduct;
    fixture.repository.developer = true;
    const result = await fixture.service.createCheckout(
      "user_123",
      "api-credit-replay",
      {
        productKey: apiCreditProduct.productKey,
        returnSurface: "pwa",
        // Runtime callers cannot influence these values; the typed request
        // only contains productKey and returnSurface.
        ...({ amountMinor: 1, creditQuantity: 1, currency: "NGN" } as never),
      } as never,
    );

    expect(result.productSnapshot).toMatchObject({
      productKey: "api_credits_100",
      expectedAmountMinor: 499,
      currency: "USD",
      creditQuantity: 100,
      validityDays: null,
      renewalMode: "one_time",
    });
    expect(fixture.provider.calls[0].productId).toBe(
      "prod_api_credits_100_sandbox",
    );
  });

  it("rejects API credit checkout for an account without a developer API consumer", async () => {
    const fixture = createFixture();
    fixture.repository.product = apiCreditProduct;

    await expect(
      fixture.service.createCheckout("user_123", "api-credit-consumer-only", {
        productKey: apiCreditProduct.productKey,
        returnSurface: "web",
      }),
    ).rejects.toThrow("developer API account");
    expect(fixture.provider.calls).toHaveLength(0);
  });
});
