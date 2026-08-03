import { randomUUID } from "node:crypto";
import type {
  BlockedUserRow,
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
import { UNNAMED_MEMBER } from "./messages.service";

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

  /**
   * Stands in for `profiles`, keyed on the raw subject the production adapter's
   * dual-key join recovers. Absent means "no profile row", which is the COMMON
   * case in this database, not the exception.
   */
  profiles = new Map<
    string,
    { fullName: string | null; avatarUrl: string | null }
  >();

  async insertBlock(row: NewBlockRow): Promise<void> {
    const already = this.blocks.some(
      (existing) =>
        existing.blockerId === row.blockerId &&
        existing.blockedId === row.blockedId,
    );
    if (!already) this.blocks.push(row);
  }

  /**
   * Reports what is stored and DECIDES NOTHING: no display name, no fallback,
   * no `resolved` flag. Those are the service's, so the assertions below watch
   * the service rather than this class.
   *
   * `blockedDatabaseId` is a stand-in for the derived uuid the real column
   * holds; the point is only that it is NOT the subject, so a service that
   * handed it back in place of `profileUserId` would be caught.
   */
  async listBlocks(blockerId: string): Promise<BlockedUserRow[]> {
    return this.blocks
      .filter((row) => row.blockerId === blockerId)
      .map((row) => {
        const profile = this.profiles.get(row.blockedId);
        return {
          blockedDatabaseId: `derived-uuid-of:${row.blockedId}`,
          profileUserId: profile ? row.blockedId : null,
          fullName: profile?.fullName ?? null,
          avatarUrl: profile?.avatarUrl ?? null,
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
        };
      });
  }

  async deleteBlock(row: NewBlockRow): Promise<boolean> {
    const before = this.blocks.length;
    this.blocks = this.blocks.filter(
      (existing) =>
        !(
          existing.blockerId === row.blockerId &&
          existing.blockedId === row.blockedId
        ),
    );
    return this.blocks.length < before;
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

describe("ModerationService.listBlocks", () => {
  it("SURVIVES the request that made it — the block is server state, not device state", async () => {
    // The gap this closes: the chat screen kept blocks in AsyncStorage, so a
    // reinstall unblocked everybody and the member's other phone never knew.
    // A block written through one service instance has to be readable through
    // a completely separate one that shares only the database.
    const store = new FakeModerationStore();
    const notifier: OwnerNotifier = {
      broadcast: jest.fn().mockResolvedValue({ ok: true }),
    };
    store.profiles.set(OFFENDER, {
      fullName: "Ada Nwosu",
      avatarUrl: "https://cdn.example.test/ada.png",
    });

    await new ModerationService(store, notifier).block(REPORTER, OFFENDER);
    const blocks = await new ModerationService(store, notifier).listBlocks(
      REPORTER,
    );

    expect(blocks).toEqual([
      {
        userId: OFFENDER,
        displayName: "Ada Nwosu",
        avatarUrl: "https://cdn.example.test/ada.png",
        blockedAt: new Date("2026-08-01T00:00:00.000Z"),
        resolved: true,
      },
    ]);
  });

  it("returns the SUBJECT the client filters messages by, not the stored uuid", async () => {
    // `user_blocks` is uuid-keyed and `toDatabaseUserId` is one-way, so the
    // adapter has to join back through `profiles`. Handing the client the uuid
    // would give it a block it can never match against `message.userId`.
    const { store, service } = setup();
    store.profiles.set(OFFENDER, { fullName: "Ada", avatarUrl: null });

    await service.block(REPORTER, OFFENDER);
    const [blocked] = await service.listBlocks(REPORTER);

    expect(blocked.userId).toBe(OFFENDER);
    expect(blocked.userId).not.toMatch(/^derived-uuid-of:/);
  });

  it("names a blocked member with no profile row neutrally", async () => {
    const { store, service } = setup();
    await service.block(REPORTER, OFFENDER);

    const [blocked] = await service.listBlocks(REPORTER);

    expect(store.profiles.has(OFFENDER)).toBe(false);
    expect(blocked.displayName).toBe(UNNAMED_MEMBER);
    expect(blocked.avatarUrl).toBeNull();
    // Unresolvable, so the client is told so rather than silently filtering on
    // a uuid that matches no message.
    expect(blocked.resolved).toBe(false);
  });

  it("treats a blank name as no name at all", async () => {
    const { store, service } = setup();
    store.profiles.set(OFFENDER, { fullName: "   ", avatarUrl: "  " });
    await service.block(REPORTER, OFFENDER);

    const [blocked] = await service.listBlocks(REPORTER);

    expect(blocked.displayName).toBe(UNNAMED_MEMBER);
    expect(blocked.avatarUrl).toBeNull();
  });

  it("shows each person only their OWN blocks", async () => {
    // There is deliberately no route that tells somebody who has blocked them.
    const { service } = setup();
    await service.block(REPORTER, OFFENDER);

    await expect(service.listBlocks(OFFENDER)).resolves.toEqual([]);
    await expect(service.listBlocks(STRANGER)).resolves.toEqual([]);
  });

  it("requires the caller to be signed in", async () => {
    const { service } = setup();
    await expect(service.listBlocks("  ")).rejects.toThrow(/signed in/i);
  });
});

describe("ModerationService.unblock", () => {
  // UNBLOCK IS SUPPORTED. Block sits in a row action sheet on a bubble-sized
  // target next to Report and Delete, and people mis-tap it; because the row
  // lands in the shared `user_blocks` table, an irreversible mis-tap would hide
  // that member from roadmap comments too. These tests pin the undo.
  it("removes the block, and the person stops being blocked", async () => {
    const { store, service } = setup();
    await service.block(REPORTER, OFFENDER);

    await expect(service.unblock(REPORTER, OFFENDER)).resolves.toEqual({
      success: true,
      blockedUserId: OFFENDER,
      wasBlocked: true,
    });
    expect(store.blocks).toHaveLength(0);
    await expect(service.listBlocks(REPORTER)).resolves.toEqual([]);
  });

  it("is not an error when there was nothing to undo", async () => {
    // Two devices racing the same undo: the loser asked for a state that is
    // now true, and telling them it failed would be a lie.
    const { service } = setup();
    await expect(service.unblock(REPORTER, OFFENDER)).resolves.toMatchObject({
      success: true,
      wasBlocked: false,
    });
  });

  it("does not unblock somebody else's block", async () => {
    const { store, service } = setup();
    await service.block(REPORTER, OFFENDER);

    await expect(service.unblock(STRANGER, OFFENDER)).resolves.toMatchObject({
      wasBlocked: false,
    });
    expect(store.blocks).toHaveLength(1);
  });

  it("leaves the caller's other blocks alone", async () => {
    const { store, service } = setup();
    await service.block(REPORTER, OFFENDER);
    await service.block(REPORTER, STRANGER);

    await service.unblock(REPORTER, OFFENDER);

    expect(store.blocks).toEqual([
      { blockerId: REPORTER, blockedId: STRANGER },
    ]);
  });

  it("can be re-blocked afterwards", async () => {
    const { store, service } = setup();
    await service.block(REPORTER, OFFENDER);
    await service.unblock(REPORTER, OFFENDER);
    await service.block(REPORTER, OFFENDER);

    expect(store.blocks).toHaveLength(1);
  });

  it("asks who, in a sentence", async () => {
    const { service } = setup();
    await expect(service.unblock("", OFFENDER)).rejects.toThrow(/signed in/i);
    await expect(service.unblock(REPORTER, "   ")).rejects.toThrow(
      /who to unblock/i,
    );
  });
});

describe("block list privacy", () => {
  it("never leaks a blocked member's email", async () => {
    // `profiles` also holds email, country, school and cgpa. The adapter
    // selects two columns; this pins that the SERVICE adds nothing back.
    const { store, service } = setup();
    store.profiles.set(OFFENDER, {
      fullName: "Ada Nwosu",
      avatarUrl: null,
    });
    await service.block(REPORTER, OFFENDER);

    const [blocked] = await service.listBlocks(REPORTER);

    expect(Object.keys(blocked).sort()).toEqual([
      "avatarUrl",
      "blockedAt",
      "displayName",
      "resolved",
      "userId",
    ]);
    expect(JSON.stringify(blocked)).not.toMatch(/@/);
  });
});
