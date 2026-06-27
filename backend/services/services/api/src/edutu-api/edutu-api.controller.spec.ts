import { NotFoundException } from "@nestjs/common";
import { EdutuApiController } from "./edutu-api.controller";

describe("EdutuApiController", () => {
  const consumer = {
    id: "consumer-1",
    name: "Scholarship Engine",
    plan: "starter",
    scopes: [
      "opportunities:read",
      "opportunities:sync",
      "usage:read",
      "recommendations:read",
      "events:write",
    ],
    monthlyQuota: 1000,
    requestId: "req-123",
    quota: {
      limit: 1000,
      remaining: 958,
      resetAt: "2026-07-01T00:00:00.000Z",
    },
  } as any;

  let service: {
    listOpportunities: jest.Mock;
    getOpportunity: jest.Mock;
    getOpportunityStats: jest.Mock;
    syncOpportunities: jest.Mock;
    listCategories: jest.Mock;
    getUsage: jest.Mock;
    getRecommendations: jest.Mock;
    recordPartnerEvent: jest.Mock;
  };
  let controller: EdutuApiController;

  beforeEach(() => {
    service = {
      listOpportunities: jest.fn().mockResolvedValue({
        object: "list",
        data: [{ id: "opp-1", title: "Scholarship Engine Opportunity" }],
        meta: { requestId: "req-123" },
      }),
      getOpportunity: jest.fn().mockResolvedValue({
        id: "opp-1",
        title: "Scholarship Engine Opportunity",
      }),
      getOpportunityStats: jest.fn().mockResolvedValue({
        object: "opportunity.catalog_stats",
        active: 12,
      }),
      syncOpportunities: jest.fn().mockResolvedValue({
        object: "list",
        data: [],
        meta: { requestId: "req-123" },
      }),
      listCategories: jest.fn().mockResolvedValue({
        object: "list",
        data: [{ slug: "scholarships", label: "Scholarships", count: 3 }],
        meta: { requestId: "req-123" },
      }),
      getUsage: jest.fn().mockResolvedValue({
        object: "usage",
        credits: { remaining: 958 },
        quota: { limit: 1000, remaining: 958, used: 42 },
      }),
      getRecommendations: jest.fn().mockResolvedValue({
        object: "recommendation.list",
        data: [{ id: "opp-2", title: "Recommended opportunity" }],
        meta: { requestId: "req-123" },
      }),
      recordPartnerEvent: jest.fn().mockResolvedValue({
        object: "event",
        accepted: true,
        id: "event-1",
      }),
    };
    controller = new EdutuApiController(service as any);
  });

  it("returns a public health response without a consumer", () => {
    expect(controller.health(undefined)).toEqual({
      object: "health",
      status: "ok",
      service: "edutu-api",
      consumer: null,
    });
  });

  it("routes the public opportunity surface through the service", async () => {
    await expect(
      controller.listOpportunities(
        { limit: "10", offset: "0" } as any,
        consumer,
      ),
    ).resolves.toMatchObject({
      object: "list",
      data: [{ id: "opp-1" }],
    });

    await expect(
      controller.getOpportunity("opp-1", consumer),
    ).resolves.toMatchObject({
      id: "opp-1",
      title: "Scholarship Engine Opportunity",
    });

    await expect(
      controller.getOpportunityStats(consumer),
    ).resolves.toMatchObject({
      object: "opportunity.catalog_stats",
      active: 12,
    });

    await expect(
      controller.syncOpportunities({ limit: "10" } as any, consumer),
    ).resolves.toMatchObject({
      object: "list",
      meta: { requestId: "req-123" },
    });

    await expect(controller.listCategories(consumer)).resolves.toMatchObject({
      object: "list",
      data: [{ slug: "scholarships", label: "Scholarships", count: 3 }],
    });

    await expect(controller.getUsage(consumer)).resolves.toMatchObject({
      object: "usage",
      quota: { used: 42, remaining: 958 },
    });
  });

  it("returns not found when a requested opportunity is missing", async () => {
    service.getOpportunity.mockResolvedValueOnce(null);

    await expect(
      controller.getOpportunity("missing-id", consumer),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("routes recommendations and partner events through the service", async () => {
    await expect(
      controller.getRecommendations(
        {
          profile: { country: "Nigeria" },
          preferences: { preferredCategories: ["scholarships"] },
          limit: 5,
        } as any,
        consumer,
      ),
    ).resolves.toMatchObject({
      object: "recommendation.list",
      data: [{ id: "opp-2" }],
    });

    await expect(
      controller.recordEvent(
        {
          eventType: "click",
          opportunityId: "11111111-1111-1111-1111-111111111111",
          externalUserId: "user-1",
          source: "partner",
        } as any,
        consumer,
      ),
    ).resolves.toMatchObject({
      object: "event",
      accepted: true,
      id: "event-1",
    });
  });
});
