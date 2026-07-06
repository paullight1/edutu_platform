import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/productApi", () => ({
  productApiRequest: vi.fn(),
}));

import { productApiRequest } from "../../services/productApi";
import {
  mapInteractionToSignal,
  recordOpportunitySignal,
} from "../../services/opportunitySignals";

const productApiRequestMock = vi.mocked(productApiRequest);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mapInteractionToSignal", () => {
  // The contract table: local interaction (+context/value) → backend signal.
  const cases: Array<
    [
      Parameters<typeof mapInteractionToSignal>[0],
      Parameters<typeof mapInteractionToSignal>[1],
      { signalType: string; signalValue: number },
    ]
  > = [
    ["view", { context: "detail" }, { signalType: "view", signalValue: 2 }],
    ["view", undefined, { signalType: "click", signalValue: 1 }],
    [
      "view",
      { context: "card_open" },
      { signalType: "click", signalValue: 1 },
    ],
    ["bookmark", undefined, { signalType: "save", signalValue: 3 }],
    [
      "bookmark",
      { value: -1, context: "unsave" },
      { signalType: "save", signalValue: -1 },
    ],
    ["share", undefined, { signalType: "share", signalValue: 2 }],
    ["apply", undefined, { signalType: "apply", signalValue: 5 }],
  ];

  it.each(cases)("maps %s (%o) → %o", (type, options, expected) => {
    expect(mapInteractionToSignal(type, options)).toEqual(expected);
  });

  it("returns null for unknown interaction types", () => {
    expect(
      mapInteractionToSignal("unknown" as never, undefined),
    ).toBeNull();
  });
});

describe("recordOpportunitySignal", () => {
  const input = {
    opportunityId: "opp-1",
    signalType: "save" as const,
    signalValue: 3,
    context: "card_open",
  };

  it("posts the signal with web defaults and returns true", async () => {
    productApiRequestMock.mockResolvedValueOnce({ ok: true });

    const result = await recordOpportunitySignal(
      input,
      async () => "token-123",
    );

    expect(result).toBe(true);
    expect(productApiRequestMock).toHaveBeenCalledWith(
      "/opportunities/signals",
      "token-123",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(
      (productApiRequestMock.mock.calls[0][2] as RequestInit).body as string,
    );
    expect(body).toEqual({
      source: "web",
      opportunityId: "opp-1",
      signalType: "save",
      signalValue: 3,
      context: "card_open",
    });
  });

  it("defaults source to web and signalValue to 1 when omitted", async () => {
    productApiRequestMock.mockResolvedValueOnce({ ok: true });

    await recordOpportunitySignal(
      { opportunityId: "opp-2", signalType: "view" },
      async () => "token-123",
    );

    const body = JSON.parse(
      (productApiRequestMock.mock.calls[0][2] as RequestInit).body as string,
    );
    expect(body.source).toBe("web");
    expect(body.signalValue).toBe(1);
  });

  it("returns false without throwing when the token is unavailable", async () => {
    const result = await recordOpportunitySignal(input, async () => null);

    expect(result).toBe(false);
    expect(productApiRequestMock).not.toHaveBeenCalled();
  });

  it("returns false without throwing when the API call fails", async () => {
    productApiRequestMock.mockRejectedValueOnce(new Error("boom"));

    await expect(
      recordOpportunitySignal(input, async () => "token-123"),
    ).resolves.toBe(false);
  });

  it("returns false without throwing when getToken itself rejects", async () => {
    await expect(
      recordOpportunitySignal(input, async () => {
        throw new Error("clerk down");
      }),
    ).resolves.toBe(false);
  });
});
