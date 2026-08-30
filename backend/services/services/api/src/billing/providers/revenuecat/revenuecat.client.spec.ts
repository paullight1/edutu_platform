import { RevenueCatClient } from "./revenuecat.client";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("RevenueCatClient", () => {
  it.each(["appl_public", "goog_public", "test_public", ""])(
    "rejects a public or missing SDK key: %s",
    (secretApiKey) => {
      expect(
        () => new RevenueCatClient({ secretApiKey, fetch: jest.fn() as never }),
      ).toThrow("secret API key");
    },
  );

  it("uses only the server secret and maps active subscriber entitlements", async () => {
    const request = jest.fn().mockResolvedValue(
      response({
        request_date: "2026-08-30T10:00:00Z",
        subscriber: {
          entitlements: {
            pro: {
              product_identifier: "edutu_pro_monthly_v1",
              expires_date: "2026-09-30T10:00:00Z",
            },
            lite: {
              product_identifier: "edutu_lite_monthly_v1",
              expires_date: "2026-07-30T10:00:00Z",
            },
            scholar: {
              product_identifier: "edutu_scholar_yearly_v1",
              expires_date: null,
            },
          },
        },
      }),
    );
    const client = new RevenueCatClient({
      secretApiKey: "sk_revenuecat_server_secret_1234567890",
      fetch: request,
      clock: () => new Date("2026-08-30T10:00:00Z"),
      timeoutMs: 2_500,
    });

    await expect(client.getSubscriber("user_clerk/one")).resolves.toEqual({
      appUserId: "user_clerk/one",
      activeEntitlements: [
        {
          id: "pro",
          productId: "edutu_pro_monthly_v1",
          expiresAt: new Date("2026-09-30T10:00:00Z"),
        },
        {
          id: "scholar",
          productId: "edutu_scholar_yearly_v1",
          expiresAt: null,
        },
      ],
    });
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.revenuecat.com/v1/subscribers/user_clerk%2Fone",
    );
    expect(init.headers).toEqual({
      Authorization: "Bearer sk_revenuecat_server_secret_1234567890",
      Accept: "application/json",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns an empty snapshot for a provider 404", async () => {
    const client = new RevenueCatClient({
      secretApiKey: "sk_revenuecat_server_secret_1234567890",
      fetch: jest.fn().mockResolvedValue(response({ message: "missing" }, 404)),
    });

    await expect(client.getSubscriber("user_missing")).resolves.toEqual({
      appUserId: "user_missing",
      activeEntitlements: [],
    });
  });

  it.each([
    ["sandbox", "sandbox_pro"],
    ["live", "live_pro"],
  ] as const)(
    "filters %s reconciliation by provider is_sandbox metadata",
    async (environment, expectedEntitlement) => {
      const client = new RevenueCatClient({
        secretApiKey: "sk_revenuecat_server_secret_1234567890",
        fetch: jest.fn().mockResolvedValue(
          response({
            subscriber: {
              subscriptions: {
                edutu_pro_monthly_v1: { is_sandbox: false },
                rc_test_pro_monthly: { is_sandbox: true },
              },
              entitlements: {
                live_pro: {
                  product_identifier: "edutu_pro_monthly_v1",
                  expires_date: "2026-09-30T10:00:00Z",
                },
                sandbox_pro: {
                  product_identifier: "rc_test_pro_monthly",
                  expires_date: "2026-09-30T10:00:00Z",
                },
              },
            },
          }),
        ),
        clock: () => new Date("2026-08-30T10:00:00Z"),
      });

      const result = await client.getSubscriber("user_clerk_one", environment);

      expect(result.activeEntitlements.map(({ id }) => id)).toEqual([
        expectedEntitlement,
      ]);
    },
  );

  it("throws a retryable sanitized error without URL, key, user, or response body", async () => {
    const secret = "sk_revenuecat_server_secret_should_not_escape";
    const client = new RevenueCatClient({
      secretApiKey: secret,
      fetch: jest.fn().mockResolvedValue(
        response(
          {
            message: "upstream broke",
            authorization: secret,
            app_user_id: "user_private",
          },
          503,
        ),
      ),
    });

    const error = await client
      .getSubscriber("user_private")
      .catch((value) => value);
    expect(error).toMatchObject({
      name: "RevenueCatClientError",
      code: "provider_unavailable",
      retryable: true,
    });
    expect(String(error)).not.toContain(secret);
    expect(String(error)).not.toContain("user_private");
    expect(String(error)).not.toContain("api.revenuecat.com");
    expect(String(error)).not.toContain("upstream broke");
  });

  it("rejects malformed successful responses as non-retryable", async () => {
    const client = new RevenueCatClient({
      secretApiKey: "sk_revenuecat_server_secret_1234567890",
      fetch: jest.fn().mockResolvedValue(response({ subscriber: [] })),
    });

    await expect(client.getSubscriber("user_clerk_one")).rejects.toMatchObject({
      code: "invalid_response",
      retryable: false,
    });
  });
});
