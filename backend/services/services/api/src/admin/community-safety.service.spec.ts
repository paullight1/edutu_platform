import { BadRequestException } from "@nestjs/common";
import type { AuditService } from "../common/audit";
import type { CommunityReportStatus } from "./community-safety.dto";
import {
  AdminCommunitySafetyService,
  type AdminCommunitySafetyStore,
} from "./community-safety.service";

const report = {
  id: "11111111-1111-4111-8111-111111111111",
  targetType: "message",
  targetId: "22222222-2222-4222-8222-222222222222",
  reporterId: "user_reporter",
  reason: "Harassment",
  status: "open",
  createdAt: new Date("2026-08-22T12:00:00.000Z"),
};

function makeStore() {
  const mocks = {
    listReports: jest.fn().mockResolvedValue([]),
    findReport: jest.fn().mockResolvedValue(report),
    findMessageGroupId: jest
      .fn()
      .mockResolvedValue("33333333-3333-4333-8333-333333333333"),
    setReportStatus: jest.fn().mockImplementation(async (_id, status) => ({
      ...report,
      status,
    })),
    removeMessage: jest.fn().mockResolvedValue(true),
    archiveGroup: jest.fn().mockResolvedValue(true),
  };

  return {
    store: mocks as unknown as jest.Mocked<AdminCommunitySafetyStore>,
    mocks,
  };
}

function makeAudit() {
  const log = jest.fn().mockResolvedValue(undefined);
  return {
    audit: { log } as unknown as AuditService,
    log,
  };
}

describe("AdminCommunitySafetyService", () => {
  it("bounds report queues and defaults to open reports", async () => {
    const { store, mocks } = makeStore();
    const { audit } = makeAudit();
    const service = new AdminCommunitySafetyService(store, audit);

    await service.list("open", 1000);

    expect(mocks.listReports).toHaveBeenCalledWith("open", 100);
  });

  it("audits status transitions", async () => {
    const { store, mocks } = makeStore();
    const { audit, log } = makeAudit();
    const service = new AdminCommunitySafetyService(store, audit);

    await service.setStatus("admin_1", report.id, "reviewing");

    expect(mocks.setReportStatus).toHaveBeenCalledWith(report.id, "reviewing");
    expect(log).toHaveBeenCalledWith(
      "community.report.status",
      "admin_1",
      "community_report",
      expect.objectContaining({
        resourceId: report.id,
        from: "open",
        to: "reviewing",
      }),
    );
  });

  it("removes a reported message and resolves the report", async () => {
    const { store, mocks } = makeStore();
    const { audit, log } = makeAudit();
    const service = new AdminCommunitySafetyService(store, audit);

    await expect(
      service.enforce("admin_1", report.id, "remove_message"),
    ).resolves.toMatchObject({
      success: true,
      status: "resolved",
      action: "remove_message",
    });
    expect(mocks.removeMessage).toHaveBeenCalledWith(
      report.targetId,
      "admin_1",
    );
    expect(mocks.setReportStatus).toHaveBeenCalledWith(report.id, "resolved");
    expect(log).toHaveBeenCalled();
  });

  it("archives the group containing a reported message without scanning the report queue", async () => {
    const { store, mocks } = makeStore();
    const { audit } = makeAudit();
    const service = new AdminCommunitySafetyService(store, audit);

    await service.enforce("admin_1", report.id, "archive_group");

    expect(mocks.findMessageGroupId).toHaveBeenCalledWith(report.targetId);
    expect(mocks.archiveGroup).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
    );
    expect(mocks.listReports).not.toHaveBeenCalled();
  });

  it("refuses a message takedown for a group report", async () => {
    const { store, mocks } = makeStore();
    mocks.findReport.mockResolvedValue({
      ...report,
      targetType: "group",
      targetId: "33333333-3333-4333-8333-333333333333",
    });
    const { audit } = makeAudit();
    const service = new AdminCommunitySafetyService(store, audit);

    await expect(
      service.enforce("admin_1", report.id, "remove_message"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.removeMessage).not.toHaveBeenCalled();
  });

  it.each<CommunityReportStatus>([
    "open",
    "reviewing",
    "resolved",
    "dismissed",
  ])("accepts the supported %s status", async (status) => {
    const { store } = makeStore();
    const { audit } = makeAudit();
    const service = new AdminCommunitySafetyService(store, audit);

    await expect(
      service.setStatus("admin_1", report.id, status),
    ).resolves.toBeDefined();
  });
});
