import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmApplication,
  createOpportunityJourney,
  markApplicationOpened,
  recordJourneyOutcome,
} from "../../services/opportunityJourneys";
import { productApiRequest } from "../../services/productApi";

vi.mock("../../services/productApi", () => ({
  productApiRequest: vi.fn(),
}));

describe("createOpportunityJourney", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts pursuing an opportunity with an idempotent request", async () => {
    vi.mocked(productApiRequest).mockResolvedValue({
      journey: { id: "journey-1" },
    });

    await createOpportunityJourney("opportunity-1", "token-1");

    expect(productApiRequest).toHaveBeenCalledWith(
      "/me/opportunity-journeys",
      "token-1",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": expect.any(String),
        }),
        body: expect.stringContaining('"opportunityId":"opportunity-1"'),
      }),
    );
    expect(
      JSON.parse(vi.mocked(productApiRequest).mock.calls[0][2]?.body as string),
    ).toEqual(
      expect.objectContaining({
        opportunityId: "opportunity-1",
        action: "pursue",
      }),
    );
  });
});

describe("opportunity journey lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts application and outcome transitions with versioned idempotency", async () => {
    vi.mocked(productApiRequest).mockResolvedValue({
      journey: { id: "journey-1" },
    });

    await markApplicationOpened("journey-1", 4, "token");
    await confirmApplication("journey-1", 5, "token");
    await recordJourneyOutcome("journey-1", 6, "offer", "token");

    expect(
      vi.mocked(productApiRequest).mock.calls.map(([path]) => path),
    ).toEqual([
      "/me/opportunity-journeys/journey-1/application-opened",
      "/me/opportunity-journeys/journey-1/application-confirmed",
      "/me/opportunity-journeys/journey-1/outcome",
    ]);
    const payloads = vi
      .mocked(productApiRequest)
      .mock.calls.map(([, , options]) => JSON.parse(options?.body as string));
    expect(payloads).toEqual([
      expect.objectContaining({
        expectedVersion: 4,
        idempotencyKey: expect.any(String),
      }),
      expect.objectContaining({
        expectedVersion: 5,
        idempotencyKey: expect.any(String),
      }),
      expect.objectContaining({
        expectedVersion: 6,
        outcome: "offer",
        idempotencyKey: expect.any(String),
      }),
    ]);
    expect(
      new Set(payloads.map((payload) => payload.idempotencyKey)).size,
    ).toBe(3);
  });
});
