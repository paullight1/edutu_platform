import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { CommunitiesController } from "./communities.controller";
import type { CreationRequestsService } from "./creation-requests.service";

const stub = () => ({}) as never;

function setup() {
  const requests = {
    submit: jest
      .fn()
      .mockResolvedValue({ request: {}, slots: { used: 1, limit: 2 } }),
    listMine: jest
      .fn()
      .mockResolvedValue({ requests: [], slots: { used: 0, limit: 2 } }),
    cancel: jest
      .fn()
      .mockResolvedValue({ request: {}, slots: { used: 0, limit: 2 } }),
    setCoverImage: jest.fn().mockResolvedValue({}),
  };
  const controller = new CommunitiesController(
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    requests as unknown as CreationRequestsService,
  );
  return { controller, requests };
}

describe("CommunitiesController creation requests", () => {
  it.each([
    ["submitCreationRequest", "creation-requests", RequestMethod.POST],
    ["listMyCreationRequests", "creation-requests/mine", RequestMethod.GET],
    [
      "cancelCreationRequest",
      "creation-requests/:id/cancel",
      RequestMethod.POST,
    ],
    [
      "setCreationRequestCover",
      "creation-requests/:id/cover-image",
      RequestMethod.PATCH,
    ],
  ] as const)("registers %s at %s", (name, path, method) => {
    const handler = (
      CommunitiesController.prototype as unknown as Record<string, unknown>
    )[name];
    expect(handler).toBeDefined();
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
  });

  it("forwards the raw Clerk subject into request submission", async () => {
    const { controller, requests } = setup();
    const proposal = {
      name: "Scholarship Builders",
      visibility: "public" as const,
      joinPolicy: "open" as const,
      coverEmoji: "💬",
    };

    await controller.submitCreationRequest("user_raw", proposal);

    expect(requests.submit).toHaveBeenCalledWith("user_raw", proposal);
  });

  it("closes the legacy immediate-publication route with a stable conflict", () => {
    const { controller, requests } = setup();

    expect(() =>
      controller.createGroup("user_raw", {
        name: "Bypass attempt",
        visibility: "public",
        joinPolicy: "open",
        coverEmoji: "💬",
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: "COMMUNITY_CREATION_REVIEW_REQUIRED",
        }),
      }),
    );
    expect(requests.submit).not.toHaveBeenCalled();
  });
});
