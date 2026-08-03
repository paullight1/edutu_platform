import { randomUUID } from "node:crypto";
import type {
  CommunityGroup,
  CommunityGroupMember,
  CommunityGroupMessage,
  CommunityReport,
  ModerationStore,
  NewBlockRow,
  NewReportRow,
  OwnerNotifier,
} from "./moderation.service";
import { ModerationService } from "./moderation.service";

/**
 * The store boundary again, and again a dumb applier: it inserts exactly the
 * row it is handed and derives nothing. Every decision under test — the report
 * row's fields, whether an owner is notified and what that notification is
 * allowed to say — is the service's, so an assertion here observes the service
 * rather than a second implementation of it living in the double.
 */
class FakeModerationStore implements ModerationStore {
  groups: CommunityGroup[] = [];
  members: CommunityGroupMember[] = [];
  messages: CommunityGroupMessage[] = [];
  reports: CommunityReport[] = [];
  blocks: NewBlockRow[] = [];

  /** The exact payload the SERVICE built. */
  lastReport: NewReportRow | null = null;

  async findGroup(groupId: string): Promise<CommunityGroup | null> {
    return this.groups.find((row) => row.id === groupId) ?? null;
  }

  async findMembership(
    groupId: string,
    userId: string,
  ): Promise<CommunityGroupMember | null> {
    return (
      this.members.find(
        (row) => row.groupId === groupId && row.userId === userId,
      ) ?? null
    );
  }

  async findMessage(messageId: string): Promise<CommunityGroupMessage | null> {
    return this.messages.find((row) => row.id === messageId) ?? null;
  }

  async findOpenReport(
    reporterId: string,
    targetType: string,
    targetId: string,
  ): Promise<CommunityReport | null> {
    return (
      this.reports.find(
        (row) =>
          row.reporterId === reporterId &&
          row.targetType === targetType &&
          row.targetId === targetId &&
          row.status === "open",
      ) ?? null
    );
  }

  async insertReport(row: NewReportRow): Promise<CommunityReport> {
    this.lastReport = row;
    const stored: CommunityReport = {
      id: randomUUID(),
      targetType: row.targetType,
      targetId: row.targetId,
      reporterId: row.reporterId,
      reason: row.reason,
      status: row.status,
      createdAt: new Date(),
    };
    this.reports.push(stored);
    return stored;
  }

  async insertBlock(row: NewBlockRow): Promise<void> {
    const already = this.blocks.some(
      (existing) =>
        existing.blockerId === row.blockerId &&
        existing.blockedId === row.blockedId,
    );
    if (!already) this.blocks.push(row);
  }

  // ---- fixture helpers -----------------------------------------------------

  addGroup(overrides: Partial<CommunityGroup> = {}): CommunityGroup {
    const row: CommunityGroup = {
      id: randomUUID(),
      slug: `group-${this.groups.length}`,
      name: "Chevening 2027",
      description: null,
      opportunityId: null,
      ownerId: OWNER,
      visibility: "public",
      joinPolicy: "open",
      coverEmoji: "💬",
      accent: null,
      expiresAt: null,
      archivedAt: null,
      memberCount: 1,
      messageCount: 0,
      lastMessageAt: null,
      createdAt: new Date(),
      ...overrides,
    };
    this.groups.push(row);
    return row;
  }

  addMember(
    groupId: string,
    userId: string,
    role = "member",
    status = "active",
  ): CommunityGroupMember {
    const row: CommunityGroupMember = {
      id: randomUUID(),
      groupId,
      userId,
      role,
      status,
      joinedAt: new Date(),
    };
    this.members.push(row);
    return row;
  }

  addMessage(groupId: string, userId: string): CommunityGroupMessage {
    const row: CommunityGroupMessage = {
      id: randomUUID(),
      groupId,
      userId,
      body: "Send me your bank details",
      kind: "text",
      opportunityId: null,
      createdAt: new Date(),
      deletedAt: null,
      deletedBy: null,
    };
    this.messages.push(row);
    return row;
  }
}

const OWNER = "user_owner";
const REPORTER = "user_reporter";
const OFFENDER = "user_offender";
const STRANGER = "user_stranger";

function setup() {
  const store = new FakeModerationStore();
  const notifier: OwnerNotifier & { broadcast: jest.Mock } = {
    broadcast: jest.fn().mockResolvedValue({ ok: true }),
  };
  const service = new ModerationService(store, notifier);
  return { store, notifier, service };
}

describe("ModerationService.report", () => {
  it("writes an open report keyed on the RAW Clerk subject", async () => {
    const { store, service } = setup();
    const group = store.addGroup();
    store.addMember(group.id, REPORTER);
    const message = store.addMessage(group.id, OFFENDER);

    const report = await service.report(REPORTER, {
      targetType: "message",
      targetId: message.id,
      reason: "Asking members for money",
    });

    expect(store.lastReport).toEqual({
      targetType: "message",
      targetId: message.id,
      reporterId: REPORTER,
      reason: "Asking members for money",
      status: "open",
    });
    expect(report.status).toBe("open");
  });

  it("NOTIFIES THE GROUP'S OWNER — there is no admin console behind this", async () => {
    const { store, notifier, service } = setup();
    const group = store.addGroup();
    const message = store.addMessage(group.id, OFFENDER);

    await service.report(REPORTER, {
      targetType: "message",
      targetId: message.id,
      reason: "Asking members for money",
    });

    expect(notifier.broadcast).toHaveBeenCalledTimes(1);
    const [, dto] = notifier.broadcast.mock.calls[0];
    expect(dto.audience).toBe("specific");
    expect(dto.targetUserIds).toEqual([OWNER]);
    // `notifications_kind_check` in production accepts a fixed list of kinds;
    // anything outside it is a 23514 the reporter would see as a 500.
    expect(dto.kind).toBe("system");
    expect(dto.metadata).toMatchObject({ groupId: group.id });
  });

  it("never tells the owner who reported", async () => {
    // A report that unmasks its reporter is a report nobody sends twice.
    const { store, notifier, service } = setup();
    const group = store.addGroup();
    const message = store.addMessage(group.id, OFFENDER);

    await service.report(REPORTER, {
      targetType: "message",
      targetId: message.id,
      reason: "Asking members for money",
    });

    const [actor, dto] = notifier.broadcast.mock.calls[0];
    expect(JSON.stringify(dto)).not.toContain(REPORTER);
    expect(actor).not.toBe(REPORTER);
  });

  it("reports a group as well as a message", async () => {
    const { store, notifier, service } = setup();
    const group = store.addGroup();

    await service.report(REPORTER, {
      targetType: "group",
      targetId: group.id,
      reason: "This whole group is a scam",
    });

    expect(store.lastReport?.targetType).toBe("group");
    expect(notifier.broadcast).toHaveBeenCalledTimes(1);
  });

  it("does not notify an owner who reported their own group", async () => {
    const { store, notifier, service } = setup();
    const group = store.addGroup();

    await service.report(OWNER, {
      targetType: "group",
      targetId: group.id,
      reason: "Testing my own report button",
    });

    expect(store.reports).toHaveLength(1);
    expect(notifier.broadcast).not.toHaveBeenCalled();
  });

  it("keeps the report when the notification fails", async () => {
    // Best-effort delivery: losing the report because a push failed would be
    // strictly worse than an owner who has to open the queue themselves.
    const { store, notifier, service } = setup();
    const group = store.addGroup();
    const message = store.addMessage(group.id, OFFENDER);
    notifier.broadcast.mockRejectedValue(new Error("expo is down"));

    await expect(
      service.report(REPORTER, {
        targetType: "message",
        targetId: message.id,
        reason: "Asking members for money",
      }),
    ).resolves.toBeDefined();
    expect(store.reports).toHaveLength(1);
  });

  it("does not re-notify for a report the same person already filed", async () => {
    const { store, notifier, service } = setup();
    const group = store.addGroup();
    const message = store.addMessage(group.id, OFFENDER);
    const dto = {
      targetType: "message" as const,
      targetId: message.id,
      reason: "Asking members for money",
    };

    const first = await service.report(REPORTER, dto);
    const second = await service.report(REPORTER, dto);

    expect(second.id).toBe(first.id);
    expect(store.reports).toHaveLength(1);
    expect(notifier.broadcast).toHaveBeenCalledTimes(1);
  });

  it("lets a different person report the same message", async () => {
    const { store, service } = setup();
    const group = store.addGroup();
    const message = store.addMessage(group.id, OFFENDER);
    const dto = {
      targetType: "message" as const,
      targetId: message.id,
      reason: "Asking members for money",
    };

    await service.report(REPORTER, dto);
    await service.report(STRANGER, dto);

    expect(store.reports).toHaveLength(2);
  });

  it("refuses to report inside a private group the reporter cannot see", async () => {
    const { store, notifier, service } = setup();
    const group = store.addGroup({ visibility: "private" });
    const message = store.addMessage(group.id, OFFENDER);

    await expect(
      service.report(STRANGER, {
        targetType: "message",
        targetId: message.id,
        reason: "Asking members for money",
      }),
    ).rejects.toThrow(/private/i);
    expect(store.reports).toHaveLength(0);
    expect(notifier.broadcast).not.toHaveBeenCalled();
  });

  it("lets a member of a private group report in it", async () => {
    const { store, service } = setup();
    const group = store.addGroup({ visibility: "private" });
    store.addMember(group.id, REPORTER, "member", "active");
    const message = store.addMessage(group.id, OFFENDER);

    await expect(
      service.report(REPORTER, {
        targetType: "message",
        targetId: message.id,
        reason: "Asking members for money",
      }),
    ).resolves.toBeDefined();
  });

  it("404s an unknown message", async () => {
    const { service } = setup();
    await expect(
      service.report(REPORTER, {
        targetType: "message",
        targetId: randomUUID(),
        reason: "Asking members for money",
      }),
    ).rejects.toThrow(/message was not found/i);
  });

  it("404s an unknown group", async () => {
    const { service } = setup();
    await expect(
      service.report(REPORTER, {
        targetType: "group",
        targetId: randomUUID(),
        reason: "Asking members for money",
      }),
    ).rejects.toThrow(/group was not found/i);
  });

  it("rejects a non-uuid target with a sentence, not a driver error", async () => {
    const { service } = setup();
    await expect(
      service.report(REPORTER, {
        targetType: "message",
        targetId: "not-a-uuid",
        reason: "Asking members for money",
      }),
    ).rejects.toThrow(/isn't valid/i);
  });

  it("rejects a target type it does not understand", async () => {
    const { service } = setup();
    await expect(
      service.report(REPORTER, {
        targetType: "profile" as never,
        targetId: randomUUID(),
        reason: "Asking members for money",
      }),
    ).rejects.toThrow(/message or a group/i);
  });

  it("requires the reporter to be signed in", async () => {
    const { service } = setup();
    await expect(
      service.report("  ", {
        targetType: "group",
        targetId: randomUUID(),
        reason: "Asking members for money",
      }),
    ).rejects.toThrow(/signed in/i);
  });
});

describe("ModerationService.block", () => {
  it("records the block", async () => {
    const { store, service } = setup();

    await expect(service.block(REPORTER, OFFENDER)).resolves.toEqual({
      success: true,
      blockedUserId: OFFENDER,
    });
    expect(store.blocks).toEqual([
      { blockerId: REPORTER, blockedId: OFFENDER },
    ]);
  });

  it("is idempotent", async () => {
    const { store, service } = setup();

    await service.block(REPORTER, OFFENDER);
    await service.block(REPORTER, OFFENDER);

    expect(store.blocks).toHaveLength(1);
  });

  it("refuses a self-block", async () => {
    const { store, service } = setup();

    await expect(service.block(REPORTER, REPORTER)).rejects.toThrow(
      /yourself/i,
    );
    expect(store.blocks).toHaveLength(0);
  });

  it("requires both people to be identified", async () => {
    const { service } = setup();

    await expect(service.block("", OFFENDER)).rejects.toThrow(/signed in/i);
    await expect(service.block(REPORTER, "   ")).rejects.toThrow(
      /who to block/i,
    );
  });
});
