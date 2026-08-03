import { randomUUID } from "node:crypto";
import type {
  CommunityGroup,
  CommunityGroupMember,
  CommunityGroupMessage,
  MessagesStore,
  NewMessageRow,
} from "./messages.service";
import { MessagesService } from "./messages.service";

/**
 * An in-memory stand-in for the Drizzle-backed store, mirroring
 * `groups.service.spec.ts`: plain arrays plus the handful of reads the service
 * performs. The double sits at the store boundary — the same boundary the real
 * adapter implements — so a broken WHERE clause in the adapter cannot be
 * papered over by a mock that replays a builder chain call-by-call.
 */
class FakeMessagesStore implements MessagesStore {
  groups: CommunityGroup[] = [];
  members: CommunityGroupMember[] = [];
  messages: CommunityGroupMessage[] = [];

  async findGroup(groupId: string): Promise<CommunityGroup | null> {
    return this.groups.find((group) => group.id === groupId) ?? null;
  }

  async findMembership(
    groupId: string,
    userId: string,
  ): Promise<CommunityGroupMember | null> {
    return (
      this.members.find(
        (member) => member.groupId === groupId && member.userId === userId,
      ) ?? null
    );
  }

  async listMessages(
    groupId: string,
    before: Date | null,
    limit: number,
  ): Promise<CommunityGroupMessage[]> {
    return this.messages
      .filter((message) => message.groupId === groupId)
      .filter(
        (message) => !before || message.createdAt.getTime() < before.getTime(),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async findMessage(messageId: string): Promise<CommunityGroupMessage | null> {
    return this.messages.find((message) => message.id === messageId) ?? null;
  }

  async insertMessage(row: NewMessageRow): Promise<CommunityGroupMessage> {
    const message: CommunityGroupMessage = {
      id: randomUUID(),
      groupId: row.groupId,
      userId: row.userId,
      body: row.body,
      kind: row.kind,
      opportunityId: row.opportunityId ?? null,
      createdAt: new Date(),
      deletedAt: null,
      deletedBy: null,
    };
    this.messages.push(message);
    const group = this.groups.find((row_) => row_.id === row.groupId);
    if (group) {
      group.messageCount += 1;
      group.lastMessageAt = message.createdAt;
    }
    return message;
  }

  async softDeleteMessage(
    messageId: string,
    actorId: string,
  ): Promise<CommunityGroupMessage | null> {
    const message = this.messages.find((row) => row.id === messageId);
    if (!message) return null;
    message.body = "";
    message.deletedAt = new Date();
    message.deletedBy = actorId;
    return message;
  }
}

const GROUP_ID = "00000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "00000000-0000-4000-8000-0000000000a1";

type MemberSeed = {
  userId: string;
  role?: string;
  status?: string;
};

type MessageSeed = Partial<CommunityGroupMessage> & { userId: string };

function fakeDb(
  config: {
    group?: Partial<CommunityGroup>;
    members?: MemberSeed[];
    messages?: MessageSeed[];
  } = {},
): FakeMessagesStore {
  const store = new FakeMessagesStore();
  const group: CommunityGroup = {
    id: GROUP_ID,
    slug: "chevening-2027-abc123",
    name: "Chevening 2027",
    description: null,
    opportunityId: null,
    ownerId: "user_owner",
    visibility: "public",
    joinPolicy: "open",
    coverEmoji: "🎓",
    accent: null,
    expiresAt: null,
    archivedAt: null,
    memberCount: 1,
    messageCount: 0,
    lastMessageAt: null,
    createdAt: new Date(),
    ...config.group,
  };
  store.groups.push(group);

  for (const member of config.members ?? []) {
    store.members.push({
      id: randomUUID(),
      groupId: group.id,
      userId: member.userId,
      role: member.role ?? "member",
      status: member.status ?? "active",
      joinedAt: new Date(),
    });
  }

  for (const [index, message] of (config.messages ?? []).entries()) {
    store.messages.push({
      id: MESSAGE_ID,
      groupId: group.id,
      body: "Anyone got the referee form?",
      kind: "text",
      opportunityId: null,
      createdAt: new Date(Date.now() - (index + 1) * 1000),
      deletedAt: null,
      deletedBy: null,
      ...message,
    });
  }
  return store;
}

describe("MessagesService", () => {
  describe("list", () => {
    it("refuses to list a private group's messages for a non-member", async () => {
      const service = new MessagesService(
        fakeDb({ group: { visibility: "private" } }),
      );
      await expect(service.list("user_stranger", GROUP_ID)).rejects.toThrow(
        /not a member/i,
      );
    });

    it("lets a signed-in non-member read a public group before joining", async () => {
      const db = fakeDb({ messages: [{ userId: "user_abc" }] });
      const messages = await new MessagesService(db).list(
        "user_stranger",
        GROUP_ID,
      );
      expect(messages).toHaveLength(1);
      expect(messages[0].body).toBe("Anyone got the referee form?");
    });

    it("still lists messages for an archived group", async () => {
      const db = fakeDb({
        group: { archivedAt: new Date() },
        members: [{ userId: "user_abc" }],
        messages: [{ userId: "user_abc" }],
      });
      await expect(
        new MessagesService(db).list("user_abc", GROUP_ID),
      ).resolves.toHaveLength(1);
    });
  });

  describe("send", () => {
    it("rejects a screened message with a human reason and writes nothing", async () => {
      const db = fakeDb({ members: [{ userId: "user_abc" }] });
      const service = new MessagesService(db);
      await expect(
        service.send("user_abc", GROUP_ID, {
          body: "pay me a $50 processing fee, slots are limited",
        }),
      ).rejects.toThrow(/can't be sent/i);
      expect(db.messages).toHaveLength(0);
      expect(db.groups[0].messageCount).toBe(0);
    });

    it("does not put the machine reason in front of the user", async () => {
      const db = fakeDb({ members: [{ userId: "user_abc" }] });
      await expect(
        new MessagesService(db).send("user_abc", GROUP_ID, {
          body: "pay me a $50 processing fee, slots are limited",
        }),
      ).rejects.not.toThrow(/scam_pattern/);
    });

    it("stores an allowed message and bumps the group's counters", async () => {
      const db = fakeDb({ members: [{ userId: "user_abc" }] });
      const message = await new MessagesService(db).send("user_abc", GROUP_ID, {
        body: "Has anyone heard back about interviews?",
      });
      expect(db.messages).toHaveLength(1);
      expect(message.userId).toBe("user_abc");
      expect(db.groups[0].messageCount).toBe(1);
      expect(db.groups[0].lastMessageAt).toBeInstanceOf(Date);
    });

    it("refuses to post in an archived group", async () => {
      const db = fakeDb({
        group: { archivedAt: new Date() },
        members: [{ userId: "user_abc" }],
      });
      await expect(
        new MessagesService(db).send("user_abc", GROUP_ID, { body: "Hello" }),
      ).rejects.toThrow(/archived/i);
      expect(db.messages).toHaveLength(0);
    });

    it("refuses to let a non-member post in a public group", async () => {
      const db = fakeDb();
      await expect(
        new MessagesService(db).send("user_stranger", GROUP_ID, {
          body: "Hello",
        }),
      ).rejects.toThrow(/join/i);
      expect(db.messages).toHaveLength(0);
    });
  });

  describe("softDelete", () => {
    it("soft-deletes rather than removing the row, preserving the moderation record", async () => {
      const db = fakeDb({
        members: [{ userId: "user_abc" }],
        messages: [{ id: MESSAGE_ID, userId: "user_abc" }],
      });
      await new MessagesService(db).softDelete("user_abc", MESSAGE_ID);
      expect(db.messages.find((m) => m.id === MESSAGE_ID)).toMatchObject({
        deletedAt: expect.anything(),
        deletedBy: "user_abc",
      });
    });

    it("blanks the body, because the mobile client reads the table directly", async () => {
      const db = fakeDb({
        members: [{ userId: "user_abc" }],
        messages: [{ id: MESSAGE_ID, userId: "user_abc" }],
      });
      await new MessagesService(db).softDelete("user_abc", MESSAGE_ID);
      expect(db.messages[0].body).toBe("");
    });

    it("lets a group owner delete someone else's message", async () => {
      const db = fakeDb({
        members: [{ userId: "user_owner", role: "owner" }],
        messages: [{ id: MESSAGE_ID, userId: "user_other" }],
      });
      await new MessagesService(db).softDelete("user_owner", MESSAGE_ID);
      expect(db.messages[0].deletedBy).toBe("user_owner");
    });

    it("refuses to let an ordinary member delete someone else's message", async () => {
      const db = fakeDb({
        members: [{ userId: "user_member", role: "member" }],
        messages: [{ id: MESSAGE_ID, userId: "user_other" }],
      });
      await expect(
        new MessagesService(db).softDelete("user_member", MESSAGE_ID),
      ).rejects.toThrow(/not allowed/i);
      expect(db.messages[0].body).not.toBe("");
      expect(db.messages[0].deletedAt).toBeNull();
    });
  });
});
