import { IS_PUBLIC_KEY } from "../auth/public.decorator";
import { PublicCommunityController } from "./public-community.controller";
import type { PublicCommunityGroupSummary } from "./public-community.service";

const row: PublicCommunityGroupSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "chevening-2027-abc123",
  name: "Chevening 2027",
  description: "Applicants preparing together.",
  coverEmoji: "🎓",
  memberCount: 24,
  messageCount: 91,
  opportunityId: null,
  expiresAt: new Date("2026-12-01T00:00:00.000Z"),
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
};

describe("PublicCommunityController", () => {
  it("is explicitly anonymous", () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PublicCommunityController)).toBe(true);
  });

  it("forwards bounded list and slug lookups", async () => {
    const service = {
      list: jest.fn().mockResolvedValue([row]),
      getBySlug: jest.fn().mockResolvedValue(row),
    };
    const controller = new PublicCommunityController(service as never);

    await expect(controller.list("12")).resolves.toEqual([row]);
    expect(service.list).toHaveBeenCalledWith(12);

    await expect(controller.get("chevening-2027-abc123")).resolves.toEqual(row);
    expect(service.getBySlug).toHaveBeenCalledWith("chevening-2027-abc123");
  });

  it("rejects invalid anonymous list limits before hitting the service", async () => {
    const service = {
      list: jest.fn(),
      getBySlug: jest.fn(),
    };
    const controller = new PublicCommunityController(service as never);

    expect(() => controller.list("0")).toThrow("limit must be a positive number");
    expect(() => controller.list("not-a-number")).toThrow("limit must be a positive number");
    expect(service.list).not.toHaveBeenCalled();
  });
});
