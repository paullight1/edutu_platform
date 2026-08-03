import { randomUUID } from "node:crypto";
import type {
  AuthorDirectory,
  AuthorRow,
  CommunityGroup,
  CommunityGroupMember,
  CommunityGroupMessage,
  GroupCounterBump,
  MessageCursor,
  MessagePatch,
  MessagesStore,
  NewMessageRow,
} from "./messages.service";
import { MessagesService, UNNAMED_MEMBER } from "./messages.service";

/**
 * An in-memory stand-in for the Drizzle-backed store, mirroring
 * `groups.service.spec.ts`: plain arrays plus the handful of reads the service
 * performs. The double sits at the store boundary — the same boundary the real
 * adapter implements — so a broken WHERE clause in the adapter cannot be
 * papered over by a mock that replays a builder chain call-by-call.
 *
 * IT DECIDES NOTHING. Every write below applies exactly the patch or counter
 * bump it is handed. That is the point: when the double invents a behaviour of
 * its own (it used to blank `body` and increment `message_count` itself), the
 * assertions about that behaviour test the double, not the service, and the
 * production code can lose the rule with every test still green.
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

  /** Records the limit the service asked for, so the clamp is observable. */
  lastLimit: number | null = null;

  async listMessages(
    groupId: string,
    before: MessageCursor | null,
    limit: number,
  ): Promise<CommunityGroupMessage[]> {
    this.lastLimit = limit;
    return this.messages
      .filter((message) => message.groupId === groupId)
      .filter((message) => {
        if (!before) return true;
        const delta = message.createdAt.getTime() - before.createdAt.getTime();
        if (delta !== 0) return delta < 0;
        // Same instant: the id tiebreak decides, matching the adapter's
        // (created_at desc, id desc) keyset.
        return before.id ? message.id < before.id : false;
      })
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
      )
      .slice(0, limit);
  }

  async findMessage(messageId: string): Promise<CommunityGroupMessage | null> {
    return this.messages.find((message) => message.id === messageId) ?? null;
  }

  async insertMessage(
    row: NewMessageRow,
    bump: GroupCounterBump,
  ): Promise<CommunityGroupMessage> {
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
      // Applied, not invented: the delta and the touch are the service's.
      group.messageCount += bump.messageCountDelta;
      if (bump.touchLastMessageAt) group.lastMessageAt = message.createdAt;
    }
    return message;
  }

  async updateMessage(
    messageId: string,
    patch: MessagePatch,
  ): Promise<CommunityGroupMessage | null> {
    const message = this.messages.find((row) => row.id === messageId);
    if (!message) return null;
    // Applies the patch verbatim. If the service stops asking for the body to
    // be blanked, the row keeps its text and the tombstone tests fail.
    Object.assign(message, patch);
    return message;
  }
}

/**
 * The `profiles` side, and — like the message store — a dumb reader. It holds
 * the two columns the production adapter selects and hands them back verbatim:
 * it supplies no fallback name, does no trimming and never invents a row for an
 * id it does not have. Every one of those is the service's decision, so the
 * assertions below observe the service.
 *
 * `calls` is what makes "ONE query per page" checkable at all.
 */
class FakeAuthorDirectory implements AuthorDirectory {
  /** Keyed on the raw Clerk subject; absent means "no profile row". */
  profiles = new Map<
    string,
    { fullName: string | null; avatarUrl: string | null }
  >();

  /** Every batch this directory was asked for, in order. */
  calls: string[][] = [];

  async findAuthors(userIds: string[]): Promise<AuthorRow[]> {
    this.calls.push([...userIds]);
    return userIds
      .filter((id) => this.profiles.has(id))
      .map((id) => ({
        userId: id,
        fullName: this.profiles.get(id)?.fullName ?? null,
        avatarUrl: this.profiles.get(id)?.avatarUrl ?? null,
      }));
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
      id: index === 0 ? MESSAGE_ID : randomUUID(),
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

/**
 * A service wired to both boundaries. Everything here goes through it rather
 * than `new MessagesService(db)`: a service built without a directory falls
 * back to the Drizzle one, and any test that lists a message would then open a
 * real database connection.
 */
function messagesService(
  db: FakeMessagesStore,
  directory: FakeAuthorDirectory = new FakeAuthorDirectory(),
): MessagesService {
  return new MessagesService(db, directory);
}

describe("MessagesService", () => {
  describe("list", () => {
    it("refuses to list a private group's messages for a non-member", async () => {
      const service = messagesService(
        fakeDb({ group: { visibility: "private" } }),
      );
      await expect(service.list("user_stranger", GROUP_ID)).rejects.toThrow(
        /not a member/i,
      );
    });

    it("lets a signed-in non-member read a public group before joining", async () => {
      const db = fakeDb({ messages: [{ userId: "user_abc" }] });
      const messages = await messagesService(db).list(
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
        messagesService(db).list("user_abc", GROUP_ID),
      ).resolves.toHaveLength(1);
    });

    // The two halves of the same rule, which must match GroupsService.get.
    it("lets an invited user read a private group, so the invite preview works", async () => {
      const db = fakeDb({
        group: { visibility: "private" },
        members: [{ userId: "user_invitee", status: "invited" }],
        messages: [{ userId: "user_owner" }],
      });
      await expect(
        messagesService(db).list("user_invitee", GROUP_ID),
      ).resolves.toHaveLength(1);
    });

    it("refuses a pending applicant, who is unvetted rather than invited", async () => {
      const db = fakeDb({
        group: { visibility: "private" },
        members: [{ userId: "user_applicant", status: "pending" }],
        messages: [{ userId: "user_owner" }],
      });
      await expect(
        messagesService(db).list("user_applicant", GROUP_ID),
      ).rejects.toThrow(/not a member/i);
    });

    it("refuses a signed-out reader", async () => {
      await expect(
        messagesService(fakeDb()).list("", GROUP_ID),
      ).rejects.toThrow(/signed in/i);
    });

    it("clamps the page size, so a negative limit never reaches SQL", async () => {
      const db = fakeDb();
      await messagesService(db).list("user_abc", GROUP_ID, { limit: -1 });
      expect(db.lastLimit).toBe(1);
      await messagesService(db).list("user_abc", GROUP_ID, { limit: 5000 });
      expect(db.lastLimit).toBe(50);
    });

    it("does not skip a message that shares the page boundary's exact timestamp", async () => {
      // created_at is defaultNow() — transaction time — so a system post
      // written alongside another message carries an identical instant.
      const instant = new Date("2026-01-01T10:00:00.000Z");
      const older = new Date("2026-01-01T09:00:00.000Z");
      const db = fakeDb({
        messages: [
          {
            id: "00000000-0000-4000-8000-0000000000c3",
            userId: "u",
            createdAt: instant,
          },
          {
            id: "00000000-0000-4000-8000-0000000000b2",
            userId: "u",
            createdAt: instant,
          },
          {
            id: "00000000-0000-4000-8000-0000000000a1",
            userId: "u",
            createdAt: older,
          },
        ],
      });
      const service = messagesService(db);

      const firstPage = await service.list("user_abc", GROUP_ID, { limit: 1 });
      expect(firstPage[0].id).toBe("00000000-0000-4000-8000-0000000000c3");

      const secondPage = await service.list("user_abc", GROUP_ID, {
        limit: 1,
        before: firstPage[0].createdAt,
        beforeId: firstPage[0].id,
      });
      // Without the id tiebreak this returns the 09:00 row and the tied 10:00
      // message is lost between pages.
      expect(secondPage[0].id).toBe("00000000-0000-4000-8000-0000000000b2");
    });
  });

  describe("send", () => {
    it("rejects a screened message with a human reason and writes nothing", async () => {
      const db = fakeDb({ members: [{ userId: "user_abc" }] });
      const service = messagesService(db);
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
        messagesService(db).send("user_abc", GROUP_ID, {
          body: "pay me a $50 processing fee, slots are limited",
        }),
      ).rejects.not.toThrow(/scam_pattern/);
    });

    it("stores an allowed message and bumps the group's counters", async () => {
      const db = fakeDb({ members: [{ userId: "user_abc" }] });
      const message = await messagesService(db).send("user_abc", GROUP_ID, {
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
        messagesService(db).send("user_abc", GROUP_ID, { body: "Hello" }),
      ).rejects.toThrow(/archived/i);
      expect(db.messages).toHaveLength(0);
    });

    it("refuses to let a non-member post in a public group", async () => {
      const db = fakeDb();
      await expect(
        messagesService(db).send("user_stranger", GROUP_ID, {
          body: "Hello",
        }),
      ).rejects.toThrow(/join/i);
      expect(db.messages).toHaveLength(0);
    });

    it("gives a banned member a terminal sentence, not advice to join", async () => {
      const db = fakeDb({
        members: [{ userId: "user_bad", status: "banned" }],
      });
      const error = await messagesService(db)
        .send("user_bad", GROUP_ID, { body: "Hello" })
        .catch((caught: Error) => caught);
      // Telling them to join would send them to `join`'s flat refusal.
      expect((error as Error).message).not.toMatch(/join/i);
      expect((error as Error).message).toMatch(/no longer post/i);
      expect(db.messages).toHaveLength(0);
    });

    it("tells a caller sending blank text to type something, not that it looks like a scam", async () => {
      const db = fakeDb({ members: [{ userId: "user_abc" }] });
      const error = await messagesService(db)
        .send("user_abc", GROUP_ID, { body: "   " })
        .catch((caught: Error) => caught);
      expect((error as Error).message).toMatch(/type a message/i);
      expect((error as Error).message).not.toMatch(/money/i);
    });
  });

  describe("softDelete", () => {
    it("soft-deletes rather than removing the row, preserving the moderation record", async () => {
      const db = fakeDb({
        members: [{ userId: "user_abc" }],
        messages: [{ id: MESSAGE_ID, userId: "user_abc" }],
      });
      await messagesService(db).softDelete("user_abc", MESSAGE_ID);
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
      await messagesService(db).softDelete("user_abc", MESSAGE_ID);
      expect(db.messages[0].body).toBe("");
    });

    it("lets a group owner delete someone else's message", async () => {
      const db = fakeDb({
        members: [{ userId: "user_owner", role: "owner" }],
        messages: [{ id: MESSAGE_ID, userId: "user_other" }],
      });
      await messagesService(db).softDelete("user_owner", MESSAGE_ID);
      expect(db.messages[0].deletedBy).toBe("user_owner");
    });

    it("refuses to let an ordinary member delete someone else's message", async () => {
      const db = fakeDb({
        members: [{ userId: "user_member", role: "member" }],
        messages: [{ id: MESSAGE_ID, userId: "user_other" }],
      });
      await expect(
        messagesService(db).softDelete("user_member", MESSAGE_ID),
      ).rejects.toThrow(/not allowed/i);
      expect(db.messages[0].body).not.toBe("");
      expect(db.messages[0].deletedAt).toBeNull();
    });

    it("lets a creator whose membership row is missing moderate their own group", async () => {
      // Matches GroupsService.assertCanAdminister: owner_id and the membership
      // row are both authoritative, so drift never locks a real owner out.
      const db = fakeDb({
        group: { ownerId: "user_owner" },
        members: [],
        messages: [{ id: MESSAGE_ID, userId: "user_other" }],
      });
      await messagesService(db).softDelete("user_owner", MESSAGE_ID);
      expect(db.messages[0].deletedBy).toBe("user_owner");
    });

    it("still refuses a banned creator, because a ban is a decision not drift", async () => {
      const db = fakeDb({
        group: { ownerId: "user_owner" },
        members: [{ userId: "user_owner", role: "owner", status: "banned" }],
        messages: [{ id: MESSAGE_ID, userId: "user_other" }],
      });
      await expect(
        messagesService(db).softDelete("user_owner", MESSAGE_ID),
      ).rejects.toThrow(/not allowed/i);
      expect(db.messages[0].deletedAt).toBeNull();
    });

    it("answers a non-uuid message id with a sentence, not a Postgres 22P02", async () => {
      const db = fakeDb({ members: [{ userId: "user_abc" }] });
      await expect(
        messagesService(db).softDelete("user_abc", "abc"),
      ).rejects.toThrow(/isn't valid/i);
    });
  });

  // -------------------------------------------------------------------------
  // Authors
  //
  // A group chat where every message is anonymous is not a group chat. These
  // pin the name beside the bubble, the ONE query that fetches it, and the two
  // things that must never travel with it.
  // -------------------------------------------------------------------------

  describe("authors", () => {
    it("names the person who sent each message", async () => {
      const db = fakeDb({
        messages: [{ userId: "user_ada" }, { userId: "user_bola" }],
      });
      const directory = new FakeAuthorDirectory();
      directory.profiles.set("user_ada", {
        fullName: "Ada Nwosu",
        avatarUrl: "https://cdn.example.test/ada.png",
      });
      directory.profiles.set("user_bola", {
        fullName: "Bola Ade",
        avatarUrl: null,
      });

      const page = await messagesService(db, directory).list(
        "user_abc",
        GROUP_ID,
      );

      expect(
        page.map((message) => [message.userId, message.author.displayName]),
      ).toEqual([
        ["user_ada", "Ada Nwosu"],
        ["user_bola", "Bola Ade"],
      ]);
      expect(page[0].author.avatarUrl).toBe("https://cdn.example.test/ada.png");
      expect(page[1].author.avatarUrl).toBeNull();
    });

    it("uses ONE batched query for the page, not one per message", async () => {
      // Seven messages from three people is one round trip. The naive shape is
      // seven, on the screen users open most often.
      const db = fakeDb({
        messages: [
          { userId: "user_ada" },
          { userId: "user_bola" },
          { userId: "user_ada" },
          { userId: "user_chidi" },
          { userId: "user_ada" },
          { userId: "user_bola" },
          { userId: "user_chidi" },
        ],
      });
      const directory = new FakeAuthorDirectory();
      directory.profiles.set("user_ada", { fullName: "Ada", avatarUrl: null });

      const page = await messagesService(db, directory).list(
        "user_abc",
        GROUP_ID,
      );

      expect(page).toHaveLength(7);
      expect(directory.calls).toHaveLength(1);
      // And it asked for the DISTINCT authors, not the seven message rows.
      expect([...directory.calls[0]].sort()).toEqual([
        "user_ada",
        "user_bola",
        "user_chidi",
      ]);
    });

    it("does not query at all for an empty page", async () => {
      const directory = new FakeAuthorDirectory();
      const page = await messagesService(fakeDb(), directory).list(
        "user_abc",
        GROUP_ID,
      );
      expect(page).toEqual([]);
      expect(directory.calls).toEqual([]);
    });

    it("falls back to a neutral name when the sender has no profile row", async () => {
      // ~9 of 43 profiles in this database carry a name, so this is the COMMON
      // path. It must render a person, not an error and not a blank bubble.
      const db = fakeDb({ messages: [{ userId: "user_nameless" }] });
      const directory = new FakeAuthorDirectory();

      const page = await messagesService(db, directory).list(
        "user_abc",
        GROUP_ID,
      );

      expect(page[0].author).toEqual({
        displayName: UNNAMED_MEMBER,
        avatarUrl: null,
      });
      expect(page[0].body).toBe("Anyone got the referee form?");
    });

    it("treats a whitespace-only name as no name", async () => {
      const db = fakeDb({ messages: [{ userId: "user_blank" }] });
      const directory = new FakeAuthorDirectory();
      directory.profiles.set("user_blank", {
        fullName: "   ",
        avatarUrl: "   ",
      });

      const page = await messagesService(db, directory).list(
        "user_abc",
        GROUP_ID,
      );

      expect(page[0].author.displayName).toBe(UNNAMED_MEMBER);
      expect(page[0].author.avatarUrl).toBeNull();
    });

    it("names one sender without a profile and another with one, on the same page", async () => {
      const db = fakeDb({
        messages: [{ userId: "user_ada" }, { userId: "user_nameless" }],
      });
      const directory = new FakeAuthorDirectory();
      directory.profiles.set("user_ada", {
        fullName: "Ada Nwosu",
        avatarUrl: null,
      });

      const page = await messagesService(db, directory).list(
        "user_abc",
        GROUP_ID,
      );

      expect(page.map((message) => message.author.displayName)).toEqual([
        "Ada Nwosu",
        UNNAMED_MEMBER,
      ]);
    });

    it("carries the author on a sent message too, so the sender's own bubble is named", async () => {
      const db = fakeDb({ members: [{ userId: "user_ada" }] });
      const directory = new FakeAuthorDirectory();
      directory.profiles.set("user_ada", {
        fullName: "Ada Nwosu",
        avatarUrl: null,
      });

      const message = await messagesService(db, directory).send(
        "user_ada",
        GROUP_ID,
        { body: "Has anyone heard back about interviews?" },
      );

      expect(message.author.displayName).toBe("Ada Nwosu");
    });

    it("carries the author on a tombstone, which replaces a row in the open page", async () => {
      const db = fakeDb({
        members: [{ userId: "user_ada" }],
        messages: [{ id: MESSAGE_ID, userId: "user_ada" }],
      });
      const directory = new FakeAuthorDirectory();
      directory.profiles.set("user_ada", {
        fullName: "Ada Nwosu",
        avatarUrl: null,
      });

      const tombstone = await messagesService(db, directory).softDelete(
        "user_ada",
        MESSAGE_ID,
      );

      expect(tombstone.body).toBe("");
      expect(tombstone.author.displayName).toBe("Ada Nwosu");
    });

    it("EXPOSES A DISPLAY NAME AND AN AVATAR AND NOTHING ELSE", async () => {
      // `profiles` also holds email, country, school, cgpa and credits. The
      // adapter selects two columns; this pins that the service adds nothing
      // back, so a future `select *` cannot leak through a spread.
      const db = fakeDb({ messages: [{ userId: "user_ada" }] });
      const directory = new FakeAuthorDirectory();
      directory.profiles.set("user_ada", {
        fullName: "Ada Nwosu",
        avatarUrl: null,
      });

      const [message] = await messagesService(db, directory).list(
        "user_abc",
        GROUP_ID,
      );

      expect(Object.keys(message.author).sort()).toEqual([
        "avatarUrl",
        "displayName",
      ]);
      // No email address anywhere in the payload, in any field.
      expect(JSON.stringify(message)).not.toMatch(/@/);
    });

    it("keeps the message's own fields untouched", async () => {
      // The author is ADDED. `userId` in particular stays: it is the key the
      // report and block routes take, and the client groups bubbles by it.
      const db = fakeDb({ messages: [{ userId: "user_ada" }] });
      const [message] = await messagesService(db).list("user_abc", GROUP_ID);

      expect(message).toMatchObject({
        id: MESSAGE_ID,
        groupId: GROUP_ID,
        userId: "user_ada",
        kind: "text",
        deletedAt: null,
      });
    });
  });
});
