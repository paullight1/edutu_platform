import { BadRequestException, ConflictException } from "@nestjs/common";
import type { AuditService } from "../common/audit";
import {
  AdminCommunityManagementService,
  CommunityApprovalLimitError,
  type AdminCommunityManagementStore,
} from "./community-management.service";

const requestId = "11111111-1111-4111-8111-111111111111";
const groupA = "22222222-2222-4222-8222-222222222222";
const groupB = "33333333-3333-4333-8333-333333333333";

function setup() {
  const store = {
    listGroups: jest.fn().mockResolvedValue([]),
    listCreationRequests: jest.fn().mockResolvedValue([]),
    getSummary: jest.fn().mockResolvedValue({
      active: 0,
      pending: 0,
      trending: 0,
      creatorsAtLimit: 0,
    }),
    approveRequest: jest.fn().mockResolvedValue({
      request: { id: requestId, status: "approved" },
      group: { id: groupA, name: "Approved group" },
    }),
    rejectRequest: jest.fn().mockResolvedValue({
      id: requestId,
      status: "rejected",
    }),
    createPlatformGroup: jest.fn().mockResolvedValue({
      id: groupA,
      name: "Platform group",
      managementScope: "platform",
    }),
    updateGroup: jest.fn().mockResolvedValue({ id: groupA }),
    archiveGroup: jest
      .fn()
      .mockResolvedValue({ id: groupA, archivedAt: new Date() }),
    restoreGroup: jest.fn().mockResolvedValue({ id: groupA, archivedAt: null }),
    listTrending: jest.fn().mockResolvedValue([]),
    replaceTrending: jest
      .fn()
      .mockImplementation(async (ids: string[]) =>
        ids.map((id, index) => ({ id, trendingRank: index + 1 })),
      ),
  };
  const log = jest.fn().mockResolvedValue(undefined);
  const service = new AdminCommunityManagementService(
    store as unknown as AdminCommunityManagementStore,
    { log } as unknown as AuditService,
  );
  return { service, store, log };
}

describe("AdminCommunityManagementService", () => {
  it("approves a request atomically and audits the created group", async () => {
    const { service, store, log } = setup();

    await expect(service.approve("admin_1", requestId)).resolves.toMatchObject({
      group: { id: groupA },
    });
    expect(store.approveRequest).toHaveBeenCalledWith(requestId, "admin_1", 2);
    expect(log).toHaveBeenCalledWith(
      "community.creation_request.approve",
      "admin_1",
      "community_creation_request",
      expect.objectContaining({ resourceId: requestId, groupId: groupA }),
    );
  });

  it("preserves a pending request when approval would create a third group", async () => {
    const { service, store } = setup();
    store.approveRequest.mockRejectedValue(new CommunityApprovalLimitError());

    await expect(service.approve("admin_1", requestId)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "COMMUNITY_CREATION_LIMIT_REACHED",
      }),
    });
  });

  it("trims and audits a rejection reason", async () => {
    const { service, store, log } = setup();

    await service.reject("admin_1", requestId, "  Audience is unclear.  ");

    expect(store.rejectRequest).toHaveBeenCalledWith(
      requestId,
      "admin_1",
      "Audience is unclear.",
    );
    expect(log).toHaveBeenCalledWith(
      "community.creation_request.reject",
      "admin_1",
      "community_creation_request",
      expect.objectContaining({ reason: "Audience is unclear." }),
    );
  });

  it("rejects duplicate Trending ids before persistence", async () => {
    const { service, store } = setup();

    await expect(
      service.replaceTrending("admin_1", [groupA, groupA]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.replaceTrending).not.toHaveBeenCalled();
  });

  it("persists an unlimited ordered Trending selection", async () => {
    const { service, store } = setup();
    const ids = [groupB, groupA];

    await expect(service.replaceTrending("admin_1", ids)).resolves.toEqual([
      { id: groupB, trendingRank: 1 },
      { id: groupA, trendingRank: 2 },
    ]);
    expect(store.replaceTrending).toHaveBeenCalledWith(ids);
  });

  it("surfaces restore quota conflicts with a stable code", async () => {
    const { service, store } = setup();
    store.restoreGroup.mockRejectedValue(new CommunityApprovalLimitError());

    await expect(service.restore("admin_1", groupA)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
