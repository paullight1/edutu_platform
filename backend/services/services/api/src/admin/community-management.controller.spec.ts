import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { AdminGuard } from "../auth";
import { AdminCommunityManagementController } from "./community-management.controller";
import type { AdminCommunityManagementService } from "./community-management.service";

function setup() {
  const management = {
    listGroups: jest.fn().mockResolvedValue({ groups: [], summary: {} }),
    listRequests: jest.fn().mockResolvedValue({ requests: [] }),
    approve: jest.fn().mockResolvedValue({}),
    reject: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    archive: jest.fn().mockResolvedValue({}),
    restore: jest.fn().mockResolvedValue({}),
    listTrending: jest.fn().mockResolvedValue([]),
    replaceTrending: jest.fn().mockResolvedValue([]),
  };
  return {
    management,
    controller: new AdminCommunityManagementController(
      management as unknown as AdminCommunityManagementService,
    ),
  };
}

describe("AdminCommunityManagementController", () => {
  it("protects the complete controller with AdminGuard", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminCommunityManagementController),
    ).toContain(AdminGuard);
  });

  it.each([
    ["listGroups", "groups", RequestMethod.GET],
    ["createGroup", "groups", RequestMethod.POST],
    ["updateGroup", "groups/:id", RequestMethod.PATCH],
    ["archiveGroup", "groups/:id/archive", RequestMethod.POST],
    ["restoreGroup", "groups/:id/restore", RequestMethod.POST],
    ["listCreationRequests", "creation-requests", RequestMethod.GET],
    [
      "approveCreationRequest",
      "creation-requests/:id/approve",
      RequestMethod.POST,
    ],
    [
      "rejectCreationRequest",
      "creation-requests/:id/reject",
      RequestMethod.POST,
    ],
    ["listTrending", "trending", RequestMethod.GET],
    ["replaceTrending", "trending", RequestMethod.PUT],
  ] as const)("registers %s at %s", (name, path, method) => {
    const handler = (
      AdminCommunityManagementController.prototype as unknown as Record<
        string,
        unknown
      >
    )[name];
    expect(handler).toBeDefined();
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
  });

  it("uses the raw admin subject for an approval audit actor", async () => {
    const { controller, management } = setup();

    await controller.approveCreationRequest(
      { authId: "admin_raw", id: "derived" },
      "11111111-1111-4111-8111-111111111111",
    );

    expect(management.approve).toHaveBeenCalledWith(
      "admin_raw",
      "11111111-1111-4111-8111-111111111111",
    );
  });
});
