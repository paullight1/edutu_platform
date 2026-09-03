import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  OpportunityJourneyApiError,
  confirmOpportunityApplication,
  createOpportunityJourney,
  createOpportunityJourneyIdempotencyKey,
  getOpportunityHome,
  markOpportunityApplicationOpened,
  updateOpportunityJourneyTask,
} from "./opportunityJourney";

vi.mock("../lib/apiBaseUrl", () => ({
  getApiBaseUrl: () => "https://api.example.test",
}));
vi.mock("../lib/localDevAuthHeaders", () => ({
  getLocalDevAuthHeaders: () => ({}),
}));
vi.mock("../lib/retry", () => ({
  fetchWithTimeout: (...args: unknown[]) => fetch(...(args as [RequestInfo, RequestInit])),
  retry: <T>(operation: () => Promise<T>) => operation(),
}));

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("opportunity journey client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("clamps the focused-home request to five", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response({ recommendations: [] }));

    await getOpportunityHome("token", 99);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.test/me/opportunity-home?recommendationLimit=5",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
  });

  it("sends the stable idempotency key supplied by the caller", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response({ journey: { id: "journey-1" } }, 201));

    await createOpportunityJourney("token", {
      opportunityId: "11111111-1111-4111-8111-111111111111",
      action: "pursue",
      idempotencyKey: "pursue-stable-key",
    });

    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toMatchObject({
      idempotencyKey: "pursue-stable-key",
    });
  });

  it("keeps application opening and confirmation on different routes", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response({ journey: {} }, 201));

    await markOpportunityApplicationOpened("token", "journey-1", {
      expectedVersion: 2,
      idempotencyKey: "opened-key",
    });
    await confirmOpportunityApplication("token", "journey-1", {
      expectedVersion: 3,
      idempotencyKey: "confirmed-key",
    });

    expect(fetchSpy.mock.calls[0][0]).toContain("/application-opened");
    expect(fetchSpy.mock.calls[1][0]).toContain("/application-confirmed");
  });

  it("preserves structured version-conflict information", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(
        {
          code: "JOURNEY_VERSION_CONFLICT",
          message: "changed elsewhere",
          currentJourney: { id: "journey-1", version: 4 },
        },
        409,
      ),
    );

    await expect(
      updateOpportunityJourneyTask("token", "journey-1", "task-1", {
        status: "completed",
        expectedVersion: 3,
        idempotencyKey: "complete-task",
      }),
    ).rejects.toMatchObject<Partial<OpportunityJourneyApiError>>({
      status: 409,
      body: expect.objectContaining({
        code: "JOURNEY_VERSION_CONFLICT",
        currentJourney: expect.objectContaining({ version: 4 }),
      }),
    });
  });

  it("creates one idempotency key per explicit user action", () => {
    const first = createOpportunityJourneyIdempotencyKey("pursue");
    const second = createOpportunityJourneyIdempotencyKey("pursue");
    expect(first).toMatch(/^pursue:/);
    expect(second).toMatch(/^pursue:/);
    expect(second).not.toBe(first);
  });
});
