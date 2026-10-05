import { createHmac } from "node:crypto";
import { BachsWebhookVerifier } from "./bachs-webhook.verifier";
import { BachsWebhookError } from "./bachs-webhook.types";

describe("BachsWebhookVerifier", () => {
  const secret = "whsec_test_only_not_a_real_secret";
  const nowSeconds = 1_786_447_200;

  function createVerifier(
    overrides: Partial<
      ConstructorParameters<typeof BachsWebhookVerifier>[0]
    > = {},
  ) {
    return new BachsWebhookVerifier({
      secret,
      expectedOrganizationId: "org_edutu",
      expectedEnvironment: "sandbox",
      clock: () => nowSeconds * 1_000,
      ...overrides,
    });
  }

  function envelope(overrides: Record<string, unknown> = {}) {
    return {
      id: "evt_valid_1",
      type: "collection.succeeded",
      created_at: "2026-08-11T12:00:00.000Z",
      organization_id: "org_edutu",
      data: { reference: "intent_1" },
      ...overrides,
    };
  }

  function signedInput(
    payload: unknown,
    options: {
      timestampHeader?: string;
      signingSecret?: string;
      deliveryEnvironment?: "sandbox" | "live";
      rawBody?: Buffer;
      signatureV2Header?: string;
    } = {},
  ) {
    const rawBody = options.rawBody ?? Buffer.from(JSON.stringify(payload));
    const timestampHeader = options.timestampHeader ?? String(nowSeconds);
    const signatureHeader = createHmac(
      "sha256",
      options.signingSecret ?? secret,
    )
      .update(timestampHeader, "utf8")
      .update(".", "utf8")
      .update(rawBody)
      .digest("hex");

    return {
      rawBody,
      timestampHeader,
      signatureHeader,
      ...(options.signatureV2Header
        ? { signatureV2Header: options.signatureV2Header }
        : {}),
      deliveryEnvironment: options.deliveryEnvironment ?? ("sandbox" as const),
    };
  }

  function v2Signature(rawBody: Buffer, signingSecret = secret) {
    return createHmac("sha256", signingSecret)
      .update(String(nowSeconds), "utf8")
      .update(".", "utf8")
      .update(rawBody)
      .digest("hex");
  }

  it("prefers the V2 header and accepts a matching signature during secret rotation", () => {
    const rawBody = Buffer.from(JSON.stringify(envelope()));
    const currentSignature = v2Signature(rawBody);
    const previousSignature = v2Signature(
      rawBody,
      "whsec_previous_rotation_secret",
    );
    const input = {
      rawBody,
      timestampHeader: String(nowSeconds),
      // A valid V2 header is authoritative even if the legacy value is bad.
      signatureHeader: "invalid legacy signature",
      signatureV2Header: `t=${nowSeconds},v1=${previousSignature},v1=${currentSignature}`,
      deliveryEnvironment: "sandbox" as const,
    };

    expect(createVerifier().verify(input).id).toBe("evt_valid_1");
  });

  it("accepts V2 without legacy headers and rejects a bad V2 header without downgrade", () => {
    const rawBody = Buffer.from(JSON.stringify(envelope()));
    const good = {
      rawBody,
      signatureHeader: undefined,
      signatureV2Header: `t=${nowSeconds},v1=${v2Signature(rawBody)}`,
      deliveryEnvironment: "sandbox" as const,
    };
    expect(createVerifier().verify(good).id).toBe("evt_valid_1");

    expect(() =>
      createVerifier().verify({
        ...good,
        timestampHeader: String(nowSeconds),
        signatureHeader: signedInput(envelope()).signatureHeader,
        signatureV2Header: `t=${nowSeconds},v1=${"0".repeat(64)}`,
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_signature" }));
  });

  it("rejects conflicting legacy and V2 timestamps", () => {
    const rawBody = Buffer.from(JSON.stringify(envelope()));
    expect(() =>
      createVerifier().verify({
        rawBody,
        timestampHeader: String(nowSeconds - 1),
        signatureHeader: signedInput(envelope()).signatureHeader,
        signatureV2Header: `t=${nowSeconds},v1=${v2Signature(rawBody)}`,
        deliveryEnvironment: "sandbox",
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_timestamp" }));
  });

  it("verifies the signature over the exact timestamp and raw body bytes", () => {
    const rawBody = Buffer.from(
      '{\n  "id":"evt_valid_1","type":"collection.succeeded","created_at":"2026-08-11T12:00:00.000Z","organization_id":"org_edutu","data":{"reference":"intent_1"}\n}',
      "utf8",
    );
    const timestampHeader = String(nowSeconds);
    const signatureHeader = createHmac("sha256", secret)
      .update(timestampHeader, "utf8")
      .update(".", "utf8")
      .update(rawBody)
      .digest("hex");
    const verifier = createVerifier();

    const event = verifier.verify({
      rawBody,
      timestampHeader,
      signatureHeader,
      deliveryEnvironment: "sandbox",
    });

    expect(event).toEqual({
      id: "evt_valid_1",
      type: "collection.succeeded",
      createdAt: "2026-08-11T12:00:00.000Z",
      organizationId: "org_edutu",
      environment: "sandbox",
      data: { reference: "intent_1" },
    });
  });

  it("rejects a signature made for different raw bytes", () => {
    const input = signedInput(envelope());
    input.rawBody = Buffer.from(`${input.rawBody.toString("utf8")} `);

    expect(() => createVerifier().verify(input)).toThrow(
      expect.objectContaining({
        code: "invalid_signature",
        statusCode: 401,
      }),
    );
  });

  it("rejects a signature made with a different secret", () => {
    const input = signedInput(envelope(), {
      signingSecret: "whsec_another_test_value",
    });

    expect(() => createVerifier().verify(input)).toThrow(
      expect.objectContaining({ code: "invalid_signature" }),
    );
  });

  it.each([
    undefined,
    "",
    "abc",
    "g".repeat(64),
    "00".repeat(31),
    "00".repeat(33),
  ])(
    "rejects malformed signature encoding without leaking buffer errors: %p",
    (signatureHeader) => {
      const input = { ...signedInput(envelope()), signatureHeader };

      expect(() => createVerifier().verify(input)).toThrow(
        expect.objectContaining({
          name: "BachsWebhookError",
          code: "invalid_signature",
          statusCode: 401,
        }),
      );
    },
  );

  it.each([
    undefined,
    "",
    " 1786447200",
    "1786447200 ",
    "1.5",
    "+1",
    "1e9",
    "NaN",
  ])("rejects malformed timestamp encoding: %p", (timestampHeader) => {
    const input = { ...signedInput(envelope()), timestampHeader };

    expect(() => createVerifier().verify(input)).toThrow(
      expect.objectContaining({ code: "invalid_timestamp", statusCode: 401 }),
    );
  });

  it.each([nowSeconds - 301, nowSeconds + 301])(
    "rejects timestamps outside the five-minute window: %p",
    (timestamp) => {
      const input = signedInput(envelope(), {
        timestampHeader: String(timestamp),
      });

      expect(() => createVerifier().verify(input)).toThrow(
        expect.objectContaining({
          code: "timestamp_outside_tolerance",
          statusCode: 401,
        }),
      );
    },
  );

  it.each([nowSeconds - 300, nowSeconds + 300])(
    "accepts timestamps exactly on the five-minute boundary: %p",
    (timestamp) => {
      const input = signedInput(envelope(), {
        timestampHeader: String(timestamp),
      });

      expect(createVerifier().verify(input).id).toBe("evt_valid_1");
    },
  );

  it("rejects malformed JSON only after authenticating its exact bytes", () => {
    const input = signedInput(null, {
      rawBody: Buffer.from('{"id":', "utf8"),
    });

    expect(() => createVerifier().verify(input)).toThrow(
      expect.objectContaining({ code: "invalid_json", statusCode: 400 }),
    );
  });

  it.each([
    ["missing id", { id: undefined }],
    ["empty type", { type: "" }],
    ["invalid created_at", { created_at: "not-a-date" }],
    ["missing organization", { organization_id: undefined }],
    ["missing data", { data: undefined }],
    ["array data", { data: [] }],
  ])("rejects an invalid envelope with %s", (_label, overrides) => {
    const input = signedInput(envelope(overrides));

    expect(() => createVerifier().verify(input)).toThrow(
      expect.objectContaining({ code: "invalid_envelope", statusCode: 400 }),
    );
  });

  it("rejects a validly signed event for another organization", () => {
    const input = signedInput(envelope({ organization_id: "org_other" }));

    expect(() => createVerifier().verify(input)).toThrow(
      expect.objectContaining({
        code: "unexpected_organization",
        statusCode: 400,
      }),
    );
  });

  it("rejects a validly signed delivery from another configured environment", () => {
    const input = signedInput(envelope(), { deliveryEnvironment: "live" });

    expect(() => createVerifier().verify(input)).toThrow(
      expect.objectContaining({
        code: "unexpected_environment",
        statusCode: 400,
      }),
    );
  });

  it("rejects a conflicting top-level environment when providers add one", () => {
    const input = signedInput(envelope({ environment: "live" }));

    expect(() => createVerifier().verify(input)).toThrow(
      expect.objectContaining({ code: "unexpected_environment" }),
    );
  });

  it("rejects events over the configured raw-body limit", () => {
    const input = signedInput(envelope());

    expect(() => createVerifier({ maxBodyBytes: 8 }).verify(input)).toThrow(
      expect.objectContaining({ code: "body_too_large", statusCode: 413 }),
    );
  });

  it("rejects JSON deeper than the configured structural limit", () => {
    const input = signedInput(
      envelope({ data: { first: { second: { third: "too deep" } } } }),
    );

    expect(() => createVerifier({ maxJsonDepth: 3 }).verify(input)).toThrow(
      expect.objectContaining({ code: "invalid_envelope", statusCode: 400 }),
    );
  });

  it("uses only BachsWebhookError for malformed raw-body input", () => {
    const input = {
      ...signedInput(envelope()),
      rawBody: "not-a-buffer" as unknown as Buffer,
    };

    expect(() => createVerifier().verify(input)).toThrow(BachsWebhookError);
  });
});
