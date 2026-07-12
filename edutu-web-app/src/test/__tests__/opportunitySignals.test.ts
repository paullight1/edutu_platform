import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/productApi", () => ({
  productApiRequest: vi.fn(),
}));
vi.mock("../../lib/clerkToken", () => ({
  getProductApiToken: vi.fn(async (getToken: () => Promise<string | null>) =>
    getToken().catch(() => null),
  ),
}));

import { productApiRequest } from "../../services/productApi";
import {
  mapInteractionToSignal,
  recordOpportunitySignal,
} from "../../services/opportunitySignals";
import { clearSignalQueue, flushSignalQueue } from "../../services/signalQueue";

const productApiRequestMock = vi.mocked(productApiRequest);

beforeEach(() => {
  vi.clearAllMocks();
  clearSignalQueue();
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

// recordOpportunitySignal enqueues into the durable localStorage queue;
// delivery happens in batches via flushSignalQueue → POST /signals/batch.
describe("recordOpportunitySignal (queued delivery)", () => {
  const input = {
    opportunityId: "opp-1",
    signalType: "save" as const,
    signalValue: 3,
    context: "card_open",
  };

  it("queues the signal with web defaults and delivers it on flush", async () => {
    productApiRequestMock.mockResolvedValueOnce({ ok: true });

    const result = await recordOpportunitySignal(
      input,
      async () => "token-123",
    );
    expect(result).toBe(true);

    await flushSignalQueue(async () => "token-123");

    expect(productApiRequestMock).toHaveBeenCalledWith(
      "/opportunities/signals/batch",
      "token-123",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(
      (productApiRequestMock.mock.calls[0][2] as RequestInit).body as string,
    );
    expect(body.signals).toEqual([
      {
        source: "web",
        opportunityId: "opp-1",
        signalType: "save",
        signalValue: 3,
        context: "card_open",
      },
    ]);
  });

  it("coalesces multiple queued signals into one batch", async () => {
    productApiRequestMock.mockResolvedValueOnce({ ok: true });

    await recordOpportunitySignal(input, async () => "token-123");
    await recordOpportunitySignal(
      { opportunityId: "opp-2", signalType: "impression", details: { surface: "web_browse", position: 4 } },
      async () => "token-123",
    );

    await flushSignalQueue(async () => "token-123");

    expect(productApiRequestMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (productApiRequestMock.mock.calls[0][2] as RequestInit).body as string,
    );
    expect(body.signals).toHaveLength(2);
    expect(body.signals[1].signalType).toBe("impression");
  });

  it("accepts non-item signals (search/category_view) without an opportunityId", async () => {
    await expect(
      recordOpportunitySignal(
        { signalType: "search", details: { query: "scholarships" } },
        async () => "token-123",
      ),
    ).resolves.toBe(true);
  });

  it("rejects item signals with no opportunityId", async () => {
    await expect(
      recordOpportunitySignal(
        { signalType: "click" },
        async () => "token-123",
      ),
    ).resolves.toBe(false);
  });

  it("keeps the queue when the token is unavailable and retries next flush", async () => {
    await recordOpportunitySignal(input, async () => null);
    await flushSignalQueue(async () => null);
    expect(productApiRequestMock).not.toHaveBeenCalled();

    productApiRequestMock.mockResolvedValueOnce({ ok: true });
    await flushSignalQueue(async () => "token-123");
    expect(productApiRequestMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the queue on transient API failure (retried later)", async () => {
    await recordOpportunitySignal(input, async () => "token-123");

    productApiRequestMock.mockRejectedValueOnce(
      Object.assign(new Error("boom"), { status: 503 }),
    );
    await flushSignalQueue(async () => "token-123");

    productApiRequestMock.mockResolvedValueOnce({ ok: true });
    await flushSignalQueue(async () => "token-123");
    expect(productApiRequestMock).toHaveBeenCalledTimes(2);
  });

  it("drops the batch on a 400 so an invalid payload can't wedge the queue", async () => {
    await recordOpportunitySignal(input, async () => "token-123");

    productApiRequestMock.mockRejectedValueOnce(
      Object.assign(new Error("bad request"), { status: 400 }),
    );
    await flushSignalQueue(async () => "token-123");

    productApiRequestMock.mockClear();
    await flushSignalQueue(async () => "token-123");
    expect(productApiRequestMock).not.toHaveBeenCalled();
  });
});
