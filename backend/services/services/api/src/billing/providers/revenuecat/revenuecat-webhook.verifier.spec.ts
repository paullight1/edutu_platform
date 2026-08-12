import { createHmac } from "node:crypto";
import {
  RevenueCatWebhookError,
  RevenueCatWebhookVerifier,
  parseRevenueCatWebhook,
} from "./revenuecat-webhook.verifier";

describe("RevenueCatWebhookVerifier", () => {
  const secret = "rc-auth-test-secret";
  const hmacSecret = "rc-signing-test-secret";
  const nowSeconds = 1_786_447_200;

  function verifier(
    overrides: Partial<
      ConstructorParameters<typeof RevenueCatWebhookVerifier>[0]
    > = {},
  ) {
    return new RevenueCatWebhookVerifier({
      authorizationSecret: secret,
      hmacSecret,
      expectedAppId: "app_edutu_ios",
      expectedEnvironment: "PRODUCTION",
      allowedStores: ["APP_STORE", "PLAY_STORE"],
      clock: () => nowSeconds * 1_000,
      ...overrides,
    });
  }

  function officialEnvelope(
    eventOverrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      api_version: "1.0",
      event: {
        type: "INITIAL_PURCHASE",
        id: "evt_rc_1",
        event_timestamp_ms: nowSeconds * 1_000,
        app_id: "app_edutu_ios",
        app_user_id: "user_clerk_123",
        original_app_user_id: "user_clerk_123",
        aliases: ["user_clerk_123", "legacy-user-alias"],
        product_id: "edutu.pro.monthly",
        period_type: "NORMAL",
        purchased_at_ms: nowSeconds * 1_000,
        expiration_at_ms: (nowSeconds + 30 * 86_400) * 1_000,
        environment: "PRODUCTION",
        entitlement_ids: ["pro"],
        transaction_id: "txn_period_1",
        original_transaction_id: "txn_lineage_1",
        store: "APP_STORE",
        currency: "USD",
        price_in_purchased_currency: 6.99,
        ...eventOverrides,
      },
    };
  }

  function signedInput(
    payload: unknown,
    options: {
      authorization?: string;
      timestamp?: string;
      signingSecret?: string;
      rawBody?: Buffer;
    } = {},
  ) {
    const rawBody =
      options.rawBody ?? Buffer.from(JSON.stringify(payload), "utf8");
    const timestamp = options.timestamp ?? String(nowSeconds);
    const signature = createHmac("sha256", options.signingSecret ?? hmacSecret)
      .update(timestamp, "utf8")
      .update(".", "utf8")
      .update(rawBody)
      .digest("hex");

    return {
      rawBody,
      authorization: Object.prototype.hasOwnProperty.call(
        options,
        "authorization",
      )
        ? options.authorization
        : secret,
      signature: `t=${timestamp},v1=${signature}`,
    };
  }

  it("verifies the official flat RevenueCat shape over exact raw bytes", () => {
    const rawBody = Buffer.from(
      JSON.stringify(officialEnvelope({ price_in_purchased_currency: 0.1 })),
      "utf8",
    );
    const input = signedInput(null, { rawBody });

    const verified = verifier().verify(input);

    expect(verified.event.type).toBe("INITIAL_PURCHASE");
    expect(verified.event.transaction_id).toBe("txn_period_1");
    expect(verified.event.original_transaction_id).toBe("txn_lineage_1");
    expect(verified.deliveryEnvironment).toBe("PRODUCTION");
  });

  it("rejects the legacy nested event.data mock shape", () => {
    const legacy = {
      api_version: "1.0",
      event: {
        type: "INITIAL_PURCHASE",
        id: "legacy_1",
        created_at: new Date().toISOString(),
        data: officialEnvelope().event,
      },
    };

    const input = signedInput(legacy);

    expect(() => verifier().verify(input)).toThrow(
      expect.objectContaining({ code: "invalid_envelope" }),
    );
  });

  it.each([undefined, "", "wrong", "Bearer wrong"])(
    "rejects an invalid Authorization value: %p",
    (authorization) => {
      const input = signedInput(officialEnvelope(), { authorization });
      expect(() => verifier().verify(input)).toThrow(
        expect.objectContaining({
          name: "RevenueCatWebhookError",
          code: "invalid_authorization",
          statusCode: 401,
        }),
      );
    },
  );

  it("accepts an explicitly configured Bearer authorization form", () => {
    const input = signedInput(officialEnvelope(), {
      authorization: `Bearer ${secret}`,
    });
    expect(verifier().verify(input).event.id).toBe("evt_rc_1");
  });

  it("rejects altered body bytes even when parsed JSON is equivalent", () => {
    const input = signedInput(officialEnvelope());
    input.rawBody = Buffer.from(`${input.rawBody.toString("utf8")} `, "utf8");

    expect(() => verifier().verify(input)).toThrow(
      expect.objectContaining({ code: "invalid_signature", statusCode: 401 }),
    );
  });

  it.each([
    undefined,
    "",
    "t=1",
    "v1=abc",
    "t=1,v1=00",
    "t=1,v1=" + "g".repeat(64),
    "t=1,v1=" + "0".repeat(64) + ",v1=" + "0".repeat(64),
    "t=1.1,v1=" + "0".repeat(64),
  ])("rejects malformed HMAC signature headers: %p", (signature) => {
    const input = signedInput(officialEnvelope());
    input.signature = signature;

    expect(() => verifier().verify(input)).toThrow(
      expect.objectContaining({ code: "invalid_signature", statusCode: 401 }),
    );
  });

  it.each([nowSeconds - 301, nowSeconds + 301])(
    "rejects stale or future HMAC timestamps: %p",
    (timestamp) => {
      const input = signedInput(officialEnvelope(), {
        timestamp: String(timestamp),
      });
      expect(() => verifier().verify(input)).toThrow(
        expect.objectContaining({
          code: "timestamp_outside_tolerance",
          statusCode: 401,
        }),
      );
    },
  );

  it("can require HMAC when no static authorization secret is configured", () => {
    const input = signedInput(officialEnvelope(), { authorization: undefined });
    const instance = verifier({ authorizationSecret: undefined });

    expect(() => instance.verify(input)).toThrow(
      expect.objectContaining({ code: "invalid_authorization" }),
    );
  });

  it.each([
    ["wrong app", { app_id: "other_app" }],
    ["wrong environment", { environment: "SANDBOX" }],
    ["wrong store", { store: "STRIPE" }],
  ])("rejects %s for this configured integration", (_label, event) => {
    const input = signedInput(officialEnvelope(event));
    expect(() => verifier().verify(input)).toThrow(
      expect.objectContaining({ code: "unexpected_integration" }),
    );
  });

  it("allows documented nullable transaction fields for a non-financial event", () => {
    const input = signedInput(
      officialEnvelope({
        type: "TEMPORARY_ENTITLEMENT_GRANT",
        app_user_id: "user_clerk_123",
        original_app_user_id: null,
        aliases: null,
        product_id: null,
        transaction_id: null,
        original_transaction_id: null,
        expiration_at_ms: null,
        price_in_purchased_currency: null,
      }),
    );

    expect(verifier().verify(input).event.type).toBe(
      "TEMPORARY_ENTITLEMENT_GRANT",
    );
  });

  it("rejects malformed JSON after authenticating its bytes", () => {
    const input = signedInput(null, {
      rawBody: Buffer.from('{"api_version":'),
    });
    expect(() => verifier().verify(input)).toThrow(
      expect.objectContaining({ code: "invalid_json", statusCode: 400 }),
    );
  });

  it("rejects oversized bodies before parsing", () => {
    const input = signedInput(officialEnvelope());
    expect(() => verifier({ maxBodyBytes: 8 }).verify(input)).toThrow(
      expect.objectContaining({ code: "body_too_large", statusCode: 413 }),
    );
  });

  it("exposes identity candidates without using email attributes", () => {
    const event = parseRevenueCatWebhook(
      JSON.stringify(
        officialEnvelope({
          app_user_id: "user-current",
          original_app_user_id: "user-original",
          aliases: ["user-original", "legacy-alias"],
          subscriber_attributes: {
            $email: { value: "must-never-be-an-owner@example.com" },
          },
        }),
      ),
    );

    expect(event.identityCandidates).toEqual([
      "user-current",
      "user-original",
      "legacy-alias",
    ]);
    expect(event.identityCandidates).not.toContain(
      "must-never-be-an-owner@example.com",
    );
  });

  it("uses a configured allowance for app-less documented events", () => {
    const payload = officialEnvelope({
      type: "EXPERIMENT_ENROLLMENT",
      app_id: undefined,
      environment: undefined,
      store: undefined,
      app_user_id: "user_clerk_123",
    });
    const input = signedInput(payload);
    const instance = verifier({
      allowMissingAppIdFor: ["EXPERIMENT_ENROLLMENT"],
      allowMissingEnvironmentFor: ["EXPERIMENT_ENROLLMENT"],
      allowMissingStoreFor: ["EXPERIMENT_ENROLLMENT"],
    });

    expect(instance.verify(input).event.type).toBe("EXPERIMENT_ENROLLMENT");
  });

  it("uses a stable error type for malformed raw bodies", () => {
    const input = signedInput(officialEnvelope());
    input.rawBody = "not-a-buffer" as unknown as Buffer;
    expect(() => verifier().verify(input)).toThrow(RevenueCatWebhookError);
  });
});
