import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOpportunityJourney } from "../../services/opportunityJourneys";
import { productApiRequest } from "../../services/productApi";

vi.mock("../../services/productApi", () => ({
  productApiRequest: vi.fn(),
}));

describe("createOpportunityJourney", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts pursuing an opportunity with an idempotent request", async () => {
    vi.mocked(productApiRequest).mockResolvedValue({ journey: { id: "journey-1" } });

    await createOpportunityJourney("opportunity-1", "token-1");

    expect(productApiRequest).toHaveBeenCalledWith(
      "/me/opportunity-journeys",
      "token-1",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
        body: expect.stringContaining('"opportunityId":"opportunity-1"'),
      }),
    );
    expect(JSON.parse(vi.mocked(productApiRequest).mock.calls[0][2]?.body as string)).toEqual(
      expect.objectContaining({
        opportunityId: "opportunity-1",
        action: "pursue",
      }),
    );
  });
});
