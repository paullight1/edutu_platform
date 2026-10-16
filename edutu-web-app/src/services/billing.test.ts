import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as billing from "./billing";
import {
  checkoutUnavailableMessage,
  createCheckout,
  handoffToBachsCheckout,
  getCreditProducts,
  BillingRequestError,
} from "./billing";

type CheckoutCreator = (
  token: string,
  input: { productKey: string; returnSurface: "web"; idempotencyKey: string },
) => Promise<unknown>;

const createBachsCheckout = createCheckout as unknown as CheckoutCreator;

function checkoutResponse(
  checkoutUrl = "https://checkout.bachs.io/s/session-123",
) {
  return {
    intentId: "intent_123",
    checkoutUrl,
    expiresAt: "2026-08-11T12:00:00.000Z",
    renewalMode: "one_time",
  };
}

describe("createCheckout", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_BACKEND_URL", "https://api.edutu.test");
    vi.stubEnv("VITE_API_URL", "https://api.edutu.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses the server gate even when an old frontend build flag is false", async () => {
    vi.stubEnv("VITE_BACHS_CHECKOUT_ENABLED", "false");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "Hosted payment completion is not ready yet",
          }),
          { status: 503 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createCheckout(
        "token",
        {
          productKey: "pro_monthly_pass",
          returnSurface: "web",
          idempotencyKey: "learner-action",
        },
        "consumer",
      ),
    ).rejects.toThrow("Hosted payment completion is not ready yet");
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/billing/consumer-checkout",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("posts only a product key and surface with the action idempotency key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(checkoutResponse()), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await createBachsCheckout("clerk-token", {
      productKey: "pro_monthly_pass",
      returnSurface: "web",
      idempotencyKey: "d2719a52-ef21-4d8b-a53a-82ba4ea7542b",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.edutu.test/billing/checkout",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer clerk-token",
          "Idempotency-Key": "d2719a52-ef21-4d8b-a53a-82ba4ea7542b",
        }),
        body: JSON.stringify({
          productKey: "pro_monthly_pass",
          returnSurface: "web",
        }),
      }),
    );

    const requestedUrl = new URL(fetchMock.mock.calls[0][0]);
    expect([...requestedUrl.searchParams.keys()]).toEqual([]);
  });

  it("blocks checkout URLs outside the trusted Bachs origin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(
            checkoutResponse("https://checkout.bachs.io.attacker.test/s/session-123"),
          ),
          {
            status: 200,
          },
        ),
      ),
    );

    await expect(
      createBachsCheckout("clerk-token", {
        productKey: "pro_monthly_pass",
        returnSurface: "web",
        idempotencyKey: "d2719a52-ef21-4d8b-a53a-82ba4ea7542b",
      }),
    ).rejects.toThrow("trusted Bachs checkout URL");
  });

  it("blocks a Bachs checkout URL with credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(
            checkoutResponse("https://user:pass@checkout.bachs.io/s/session-123"),
          ),
          {
            status: 200,
          },
        ),
      ),
    );

    await expect(
      createBachsCheckout("clerk-token", {
        productKey: "pro_monthly_pass",
        returnSurface: "web",
        idempotencyKey: "b6c8a3f1-8056-4bbc-8a92-d7b6b20bc2ef",
      }),
    ).rejects.toThrow("trusted Bachs checkout URL");
  });

  it("lets the API decide whether checkout is available", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Bachs checkout is temporarily unavailable." }), { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createBachsCheckout("clerk-token", {
        productKey: "pro_monthly_pass",
        returnSurface: "web",
        idempotencyKey: "d2719a52-ef21-4d8b-a53a-82ba4ea7542b",
      }),
    ).rejects.toMatchObject({ status: 503, code: "billing_unavailable" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("coalesces duplicate checkout requests for the same action idempotency key", async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const input = {
      productKey: "pro_monthly_pass",
      returnSurface: "web" as const,
      idempotencyKey: "d2719a52-ef21-4d8b-a53a-82ba4ea7542b",
    };
    const first = createBachsCheckout("clerk-token", input);
    const duplicate = createBachsCheckout("clerk-token", input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse?.(
      new Response(JSON.stringify(checkoutResponse()), { status: 200 }),
    );
    await expect(Promise.all([first, duplicate])).resolves.toHaveLength(2);
  });

  it("accepts the backend checkout shape when renewal policy is server-owned and omitted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            intentId: "intent_123",
            checkoutUrl: "https://checkout.bachs.io/s/session-123",
            expiresAt: "2026-08-11T12:00:00.000Z",
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      createBachsCheckout("clerk-token", {
        productKey: "api_credits_700",
        returnSurface: "web",
        idempotencyKey: "a6db6b54-e7d7-4f18-a4ba-1e26b2e96c11",
      }),
    ).resolves.toMatchObject({
      intentId: "intent_123",
      renewalMode: undefined,
    });
  });

  it("preserves billing error codes for safe UI handling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "billing_unavailable",
            message: "Bachs checkout is unavailable.",
          }),
          { status: 503 },
        ),
      ),
    );

    const error = await createBachsCheckout("clerk-token", {
      productKey: "api_credits_700",
      returnSurface: "web",
      idempotencyKey: "cf7a0e3d-f5bf-4f0d-98ee-16a9ce6e6f1b",
    }).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(BillingRequestError);
    expect(error).toMatchObject({ status: 503, code: "billing_unavailable" });
  });
});

describe("Bachs checkout handoff", () => {
  const checkoutUrl = "https://checkout.bachs.io/s/session-123";

  it("opens a blank tab, removes its opener, then navigates to the trusted checkout", () => {
    const checkoutWindow = {
      opener: {} as Window | null,
      location: { replace: vi.fn() },
    };
    const openWindow = vi.fn().mockReturnValue(checkoutWindow);
    const navigateCurrent = vi.fn();

    expect(handoffToBachsCheckout(checkoutUrl, { openWindow, navigateCurrent })).toBe("new-tab");
    expect(openWindow).toHaveBeenCalledWith("about:blank", "_blank");
    expect(checkoutWindow.opener).toBeNull();
    expect(checkoutWindow.location.replace).toHaveBeenCalledWith(checkoutUrl);
    expect(navigateCurrent).not.toHaveBeenCalled();
  });

  it("falls back to the current tab if the browser blocks the new tab", () => {
    const openWindow = vi.fn().mockReturnValue(null);
    const navigateCurrent = vi.fn();

    expect(handoffToBachsCheckout(checkoutUrl, { openWindow, navigateCurrent })).toBe("same-tab");
    expect(navigateCurrent).toHaveBeenCalledWith(checkoutUrl);
  });

  it("rejects untrusted checkout destinations before opening a tab", () => {
    const openWindow = vi.fn();
    expect(() => handoffToBachsCheckout("https://attacker.example/pay", { openWindow })).toThrow(
      "trusted Bachs checkout URL",
    );
    expect(openWindow).not.toHaveBeenCalled();
  });
});

describe("checkoutUnavailableMessage", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("explains when Bachs has not enabled signed checkout confirmation", () => {
    expect(checkoutUnavailableMessage({
      checkoutEnabled: false,
      checkoutUnavailableReason: "Bachs checkout and signed payment confirmation are not ready yet",
    })).toMatch(/signed payment confirmation are not ready yet/i);
  });

  it("returns no warning when the server reports checkout ready", () => {
    vi.stubEnv("VITE_BACHS_CHECKOUT_ENABLED", "false");
    expect(checkoutUnavailableMessage({ checkoutEnabled: true })).toBeNull();
  });
});

describe("getCreditProducts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads API credit products from the billing catalog response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          products: [
            {
              productKey: "api_credits_100",
              creditQuantity: 100,
              price: 1500,
              currency: "NGN",
              label: "Starter",
              renewalMode: "one_time",
              validityDays: null,
            },
            {
              productKey: "api_credits_700",
              creditQuantity: 700,
              price: 7000,
              currency: "NGN",
              renewalMode: "one_time",
              validityDays: null,
            },
            {
              productKey: "pro_monthly_pass",
              creditQuantity: null,
              price: 6500,
              currency: "NGN",
              renewalMode: "recurring",
              validityDays: 31,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCreditProducts("clerk-token")).resolves.toEqual([
      {
        productKey: "api_credits_100",
        creditQuantity: 100,
        price: 1500,
        currency: "NGN",
        label: "Starter",
        renewalMode: "one_time",
        validityDays: null,
      },
      {
        productKey: "api_credits_700",
        creditQuantity: 700,
        price: 7000,
        currency: "NGN",
        label: undefined,
        renewalMode: "one_time",
        validityDays: null,
      },
    ]);

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/billing\/catalog$/);
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer clerk-token",
        }),
      }),
    );
    const [, request] = fetchMock.mock.calls[0];
    expect(request?.body).toBeUndefined();
  });

  it("converts the canonical API catalog's minor-unit prices without inventing checkout terms", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([
        { productKey: "api_credits_100", creditQuantity: 100, amountMinor: 1999, currency: "USD", catalogVersion: 3 },
        { productKey: "api_credits_700", creditQuantity: 700, amountMinor: 1500, currency: "NGN", catalogVersion: 3 },
        { productKey: "api_credits_invalid", creditQuantity: 0, amountMinor: 500, currency: "USD" },
        { productKey: "pro_monthly_pass", creditQuantity: 0, amountMinor: 900, currency: "USD" },
      ]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCreditProducts("clerk-token")).resolves.toEqual([
      { productKey: "api_credits_100", creditQuantity: 100, price: 19.99, currency: "USD", renewalMode: "one_time", validityDays: null },
      { productKey: "api_credits_700", creditQuantity: 700, price: 15, currency: "NGN", renewalMode: "one_time", validityDays: null },
    ]);
  });
});

describe("management destinations", () => {
  it("uses only provider-owned destinations and never a remotely configured URL", () => {
    const getManageDestination = (
      billing as typeof billing & {
        getManageDestination?: (provider: string) => unknown;
      }
    ).getManageDestination;

    expect(getManageDestination).toBeTypeOf("function");
    if (!getManageDestination) return;

    expect(getManageDestination("bachs")).toEqual({ kind: "portal-session" });
    expect(getManageDestination("revenuecat_app_store")).toEqual({
      kind: "external",
      url: "https://apps.apple.com/account/subscriptions",
    });
    expect(getManageDestination("revenuecat_play_store")).toEqual({
      kind: "external",
      url: "https://play.google.com/store/account/subscriptions",
    });
    expect(getManageDestination("one_time_pass")).toEqual({ kind: "none" });
    expect(getManageDestination("https://attacker.test/manage")).toEqual({
      kind: "none",
    });
  });
});
