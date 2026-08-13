import { createHmac, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AuthorDirectory,
  AuthorRow,
  BlockDirectory,
  BlockedPartyRow,
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
import {
  COMMUNITY_IMAGE_MAX_BYTES,
  COMMUNITY_PDF_MAX_BYTES,
  SendMessageSchema,
} from "./dto/community.dto";

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

  async listResourceMessages(
    groupId: string,
    before: MessageCursor | null,
    limit: number,
  ): Promise<CommunityGroupMessage[]> {
    return (await this.listMessages(groupId, before, this.messages.length + 1))
      .filter(
        (message) =>
          (message.kind === "image" || message.kind === "file") &&
          !message.deletedAt,
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

/**
 * The `user_blocks` side, and — like the other two doubles — a dumb reader.
 *
 * It holds the block pairs a real table would hold and hands back the raw
 * column values for the other party, standing in for the adapter's `union` of
 * "people I blocked" and "people who blocked me". It decides NOTHING else: no
 * trimming, no self-exclusion, no set-building, no page arithmetic. Every one
 * of those is the service's, which is what makes the assertions below observe
 * `MessagesService` and not this class.
 *
 * `databaseId` mimics the stored uuid the real table keys on. It is a made-up
 * string rather than a real `toDatabaseUserId` output on purpose: the service
 * must never care which namespace it is in, and a test that computed the real
 * derivation would be asserting `toDatabaseUserId` instead of the filter.
 *
 * `calls` is what makes "ONE lookup per list call" checkable at all.
 */
class FakeBlockDirectory implements BlockDirectory {
  /** Raw pairs of Clerk subjects, exactly as `user_blocks` stores them. */
  pairs: Array<{ blockerId: string; blockedId: string }> = [];

  /** Rows whose subject could not be recovered from the stored uuid. */
  unresolved: string[] = [];

  calls: string[] = [];

  block(blockerId: string, blockedId: string): this {
    this.pairs.push({ blockerId, blockedId });
    return this;
  }

  async findBlockedParties(userId: string): Promise<BlockedPartyRow[]> {
    this.calls.push(userId);
    const rows: BlockedPartyRow[] = [];
    for (const pair of this.pairs) {
      // Both directions, the way the adapter's `union` reads them back.
      const other =
        pair.blockerId === userId
          ? pair.blockedId
          : pair.blockedId === userId
            ? pair.blockerId
            : null;
      if (other === null) continue;
      rows.push({
        databaseId: `uuid-of:${other}`,
        // Null when the profiles join found nothing — the case the real
        // adapter hits for a member who has never written a profile row.
        subject: this.unresolved.includes(other) ? null : other,
      });
    }
    return rows;
  }
}

const GROUP_ID = "00000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "00000000-0000-4000-8000-0000000000a1";
const TEST_ATTACHMENT_ORIGIN = "https://api.edutu.test";
const TEST_ATTACHMENT_SECRET = "test-community-attachment-secret";
const TEST_STORAGE_USER = "7aacb321-782f-562f-8e1a-02fa88d11332";

function attachmentResourceUrl(extension: "webp" | "pdf"): string {
  const path = `groups/${GROUP_ID}/${TEST_STORAGE_USER}/00000000-0000-4000-8000-000000000099.${extension}`;
  const signature = createHmac("sha256", TEST_ATTACHMENT_SECRET)
    .update(`${GROUP_ID}:${path}`)
    .digest("base64url");
  const url = new URL(
    `/communities/groups/${GROUP_ID}/attachments/download-url`,
    TEST_ATTACHMENT_ORIGIN,
  );
  url.searchParams.set("path", path);
  url.searchParams.set("signature", signature);
  return url.toString();
}

function makeAttachmentStorage() {
  const createSignedUploadUrl = jest.fn(async (path: string) => ({
    data: {
      signedUrl: `https://storage.edutu.test/upload?path=${encodeURIComponent(path)}`,
      token: "upload-token",
      path,
    },
    error: null,
  }));
  const createSignedUrl = jest.fn(async (path: string, expiresIn: number) => ({
    data: {
      signedUrl: `https://storage.edutu.test/download?path=${encodeURIComponent(path)}&ttl=${expiresIn}`,
    },
    error: null,
  }));
  const from = jest.fn(() => ({ createSignedUploadUrl, createSignedUrl }));
  return {
    client: { storage: { from } } as unknown as SupabaseClient,
    from,
    createSignedUploadUrl,
    createSignedUrl,
  };
}

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
  blocks: FakeBlockDirectory = new FakeBlockDirectory(),
  storage: SupabaseClient = makeAttachmentStorage().client,
): MessagesService {
  return new MessagesService(db, directory, blocks, storage);
}

describe("MessagesService", () => {
  const previousApiUrl = process.env.API_PUBLIC_URL;
  const previousSigningSecret = process.env.COMMUNITY_ATTACHMENT_SIGNING_SECRET;

  beforeAll(() => {
    process.env.API_PUBLIC_URL = TEST_ATTACHMENT_ORIGIN;
    process.env.COMMUNITY_ATTACHMENT_SIGNING_SECRET = TEST_ATTACHMENT_SECRET;
  });

  afterAll(() => {
    if (previousApiUrl === undefined) delete process.env.API_PUBLIC_URL;
    else process.env.API_PUBLIC_URL = previousApiUrl;
    if (previousSigningSecret === undefined) {
      delete process.env.COMMUNITY_ATTACHMENT_SIGNING_SECRET;
    } else {
      process.env.COMMUNITY_ATTACHMENT_SIGNING_SECRET = previousSigningSecret;
    }
  });
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

  describe("listResources", () => {
    const imageBody = JSON.stringify({
      url: attachmentResourceUrl("webp"),
      name: "essay-plan.webp",
      mime: "image/webp",
      size: 512_000,
      caption: "My first draft",
    });
    const fileBody = JSON.stringify({
      url: attachmentResourceUrl("pdf"),
      name: "application-guide.pdf",
      mime: "application/pdf",
      size: 2_000_000,
    });

    it("uses the group read boundary for private resources", async () => {
      const service = messagesService(
        fakeDb({
          group: { visibility: "private" },
          messages: [{ userId: "user_owner", kind: "file", body: fileBody }],
        }),
      );

      await expect(
        service.listResources("user_stranger", GROUP_ID),
      ).rejects.toThrow(/not a member/i);
    });

    it("returns only live canonical attachments with sender and date", async () => {
      const deletedAt = new Date("2026-08-03T11:00:00.000Z");
      const db = fakeDb({
        messages: [
          { userId: "user_ada", kind: "image", body: imageBody },
          { userId: "user_bola", kind: "file", body: fileBody },
          { userId: "user_ada", kind: "text", body: "ordinary message" },
          {
            userId: "user_ada",
            kind: "file",
            body: fileBody,
            deletedAt,
          },
          { userId: "user_ada", kind: "image", body: "not json" },
        ],
      });
      const directory = new FakeAuthorDirectory();
      directory.profiles.set("user_ada", {
        fullName: "Ada Student",
        avatarUrl: "https://images.example/ada.png",
      });

      const page = await messagesService(db, directory).listResources(
        "user_reader",
        GROUP_ID,
        { limit: 20 },
      );

      expect(page.resources).toHaveLength(2);
      expect(page.resources[0]).toMatchObject({
        kind: "image",
        attachment: {
          name: "essay-plan.webp",
          mime: "image/webp",
          size: 512_000,
          caption: "My first draft",
        },
        sender: {
          userId: "user_ada",
          displayName: "Ada Student",
          avatarUrl: "https://images.example/ada.png",
        },
      });
      expect(page.resources[0].createdAt).toBeInstanceOf(Date);
      expect(page.resources[1].sender.displayName).toBe(UNNAMED_MEMBER);
      expect(page.nextCursor).toBeNull();
    });

    it("pages tied timestamps with the message id tiebreak", async () => {
      const instant = new Date("2026-08-03T10:00:00.000Z");
      const ids = [
        "00000000-0000-4000-8000-0000000000c3",
        "00000000-0000-4000-8000-0000000000b2",
        "00000000-0000-4000-8000-0000000000a1",
      ];
      const db = fakeDb({
        messages: ids.map((id) => ({
          id,
          userId: "user_ada",
          kind: "file",
          body: fileBody,
          createdAt: instant,
        })),
      });
      const service = messagesService(db);

      const first = await service.listResources("user_reader", GROUP_ID, {
        limit: 1,
      });
      expect(first.resources[0].id).toBe(ids[0]);
      expect(first.nextCursor).toEqual({
        before: instant.toISOString(),
        beforeId: ids[0],
      });

      const second = await service.listResources("user_reader", GROUP_ID, {
        limit: 1,
        before: new Date(first.nextCursor!.before),
        beforeId: first.nextCursor!.beforeId,
      });
      expect(second.resources[0].id).toBe(ids[1]);
    });
  });

  describe("send", () => {
    const imageBody = JSON.stringify({
      url: attachmentResourceUrl("webp"),
      name: "essay-plan.webp",
      mime: "image/webp",
      size: 512_000,
      caption: "My first draft",
    });
    const fileBody = JSON.stringify({
      url: attachmentResourceUrl("pdf"),
      name: "application-guide.pdf",
      mime: "application/pdf",
      size: 2_000_000,
    });

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

    it.each([
      ["image" as const, imageBody],
      ["file" as const, fileBody],
    ])(
      "persists a validated %s attachment in kind/body",
      async (kind, body) => {
        const db = fakeDb({ members: [{ userId: "user_abc" }] });
        const message = await messagesService(db).send("user_abc", GROUP_ID, {
          kind,
          body,
        });

        expect(message.kind).toBe(kind);
        expect(JSON.parse(message.body)).toMatchObject(JSON.parse(body));
        expect(db.groups[0].messageCount).toBe(1);
      },
    );

    it.each([
      [
        "non-HTTPS URL",
        { ...JSON.parse(imageBody), url: "http://cdn.test/x.webp" },
      ],
      ["unsafe name", { ...JSON.parse(imageBody), name: "../secret.webp" }],
      ["wrong image MIME", { ...JSON.parse(imageBody), mime: "image/gif" }],
      [
        "oversized image",
        { ...JSON.parse(imageBody), size: COMMUNITY_IMAGE_MAX_BYTES + 1 },
      ],
    ])(
      "rejects image attachment metadata with a %s",
      async (_case, payload) => {
        const db = fakeDb({ members: [{ userId: "user_abc" }] });
        await expect(
          messagesService(db).send("user_abc", GROUP_ID, {
            kind: "image",
            body: JSON.stringify(payload),
          } as never),
        ).rejects.toThrow(/attachment can't be sent/i);
        expect(db.messages).toHaveLength(0);
      },
    );

    it.each([
      ["wrong PDF MIME", { ...JSON.parse(fileBody), mime: "application/zip" }],
      ["wrong extension", { ...JSON.parse(fileBody), name: "guide.exe" }],
      [
        "oversized PDF",
        { ...JSON.parse(fileBody), size: COMMUNITY_PDF_MAX_BYTES + 1 },
      ],
      ["extra metadata", { ...JSON.parse(fileBody), executable: true }],
    ])("rejects file attachment metadata with a %s", async (_case, payload) => {
      const db = fakeDb({ members: [{ userId: "user_abc" }] });
      await expect(
        messagesService(db).send("user_abc", GROUP_ID, {
          kind: "file",
          body: JSON.stringify(payload),
        } as never),
      ).rejects.toThrow(/attachment can't be sent/i);
      expect(db.messages).toHaveLength(0);
    });

    it("rejects an otherwise valid public attachment URL", async () => {
      const db = fakeDb({ members: [{ userId: "user_abc" }] });
      await expect(
        messagesService(db).send("user_abc", GROUP_ID, {
          kind: "file",
          body: JSON.stringify({
            ...JSON.parse(fileBody),
            url: "https://public-files.example/application-guide.pdf",
          }),
        }),
      ).rejects.toThrow(/not stored securely by Edutu/i);
      expect(db.messages).toHaveLength(0);
    });

    it("canonicalizes attachment JSON so resource messages have one stable shape", () => {
      const parsed = SendMessageSchema.parse({
        kind: "image",
        body: JSON.stringify({
          size: 10,
          mime: "image/png",
          name: "diagram.png",
          url: "https://cdn.edutu.app/diagram.png",
          caption: "  Diagram  ",
        }),
      });
      expect(parsed.body).toBe(
        JSON.stringify({
          url: "https://cdn.edutu.app/diagram.png",
          name: "diagram.png",
          mime: "image/png",
          size: 10,
          caption: "Diagram",
        }),
      );
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

  describe("private attachment storage", () => {
    it("issues a signed upload only to an active group member", async () => {
      const storage = makeAttachmentStorage();
      const db = fakeDb({ members: [{ userId: "user_abc" }] });
      const service = messagesService(
        db,
        new FakeAuthorDirectory(),
        new FakeBlockDirectory(),
        storage.client,
      );

      const reservation = await service.createAttachmentUpload(
        "user_abc",
        GROUP_ID,
        {
          kind: "image",
          name: "evidence.webp",
          mime: "image/webp",
          size: 200,
        },
      );

      expect(storage.from).toHaveBeenCalledWith("community-assets");
      expect(storage.createSignedUploadUrl).toHaveBeenCalledTimes(1);
      expect(reservation.uploadUrl).toMatch(
        /^https:\/\/storage\.edutu\.test\/upload/,
      );
      expect(reservation.resourceUrl).toMatch(
        /^https:\/\/api\.edutu\.test\/communities\/groups\//,
      );
      expect(reservation.resourceUrl).not.toContain("storage.edutu.test");
    });

    it("does not issue an upload URL to a non-member", async () => {
      const storage = makeAttachmentStorage();
      const service = messagesService(
        fakeDb(),
        new FakeAuthorDirectory(),
        new FakeBlockDirectory(),
        storage.client,
      );
      await expect(
        service.createAttachmentUpload("user_stranger", GROUP_ID, {
          kind: "file",
          name: "guide.pdf",
          mime: "application/pdf",
          size: 500,
        }),
      ).rejects.toThrow(/join/i);
      expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
    });

    it("checks private-group membership before signing a download", async () => {
      const storage = makeAttachmentStorage();
      const db = fakeDb({
        group: { visibility: "private" },
        members: [{ userId: "user_member" }],
      });
      const service = messagesService(
        db,
        new FakeAuthorDirectory(),
        new FakeBlockDirectory(),
        storage.client,
      );
      const reservation = await service.createAttachmentUpload(
        "user_member",
        GROUP_ID,
        {
          kind: "file",
          name: "guide.pdf",
          mime: "application/pdf",
          size: 500,
        },
      );
      const resource = new URL(reservation.resourceUrl);
      const path = resource.searchParams.get("path") ?? "";
      const signature = resource.searchParams.get("signature") ?? "";

      await expect(
        service.getAttachmentDownloadUrl(
          "user_stranger",
          GROUP_ID,
          path,
          signature,
        ),
      ).rejects.toThrow(/not a member/i);
      expect(storage.createSignedUrl).not.toHaveBeenCalled();

      await expect(
        service.getAttachmentDownloadUrl(
          "user_member",
          GROUP_ID,
          path,
          signature,
        ),
      ).resolves.toMatchObject({
        url: expect.stringMatching(/^https:\/\/storage\.edutu\.test\/download/),
        expiresIn: 300,
      });
      expect(storage.createSignedUrl).toHaveBeenCalledWith(path, 300);
    });

    it("rejects a tampered storage path before signing a download", async () => {
      const storage = makeAttachmentStorage();
      const db = fakeDb({ members: [{ userId: "user_member" }] });
      const service = messagesService(
        db,
        new FakeAuthorDirectory(),
        new FakeBlockDirectory(),
        storage.client,
      );
      await expect(
        service.getAttachmentDownloadUrl(
          "user_member",
          GROUP_ID,
          `groups/${GROUP_ID}/${TEST_STORAGE_USER}/00000000-0000-4000-8000-000000000098.pdf`,
          "tampered",
        ),
      ).rejects.toThrow(/invalid/i);
      expect(storage.createSignedUrl).not.toHaveBeenCalled();
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

  // -------------------------------------------------------------------------
  // Blocks
  //
  // "Users can block each other" is this feature's App Store justification.
  // Until these passed, the block wrote a durable row and changed nothing a
  // user could see — which is worse than no block, because they believed they
  // were protected.
  // -------------------------------------------------------------------------

  describe("blocks", () => {
    /** Authors newest-first; message N is older than message N-1. */
    function chat(authors: string[]): FakeMessagesStore {
      return fakeDb({ messages: authors.map((userId) => ({ userId })) });
    }

    const ids = (page: Array<{ id: string }>) => page.map((row) => row.id);

    it("hides the messages of someone the reader blocked", async () => {
      const db = chat(["user_ada", "user_troll", "user_bola"]);
      const blocks = new FakeBlockDirectory().block("user_ada", "user_troll");

      const page = await messagesService(
        db,
        new FakeAuthorDirectory(),
        blocks,
      ).list("user_ada", GROUP_ID);

      expect(page.map((message) => message.userId)).toEqual([
        "user_ada",
        "user_bola",
      ]);
    });

    it("hides the blocker's messages from the person they blocked, too", async () => {
      // The other half of the same row. A one-directional block leaves the
      // blocked party still watching, which is what people block to prevent.
      const db = chat(["user_ada", "user_troll", "user_bola"]);
      const blocks = new FakeBlockDirectory().block("user_ada", "user_troll");

      const page = await messagesService(
        db,
        new FakeAuthorDirectory(),
        blocks,
      ).list("user_troll", GROUP_ID);

      expect(page.map((message) => message.userId)).toEqual([
        "user_troll",
        "user_bola",
      ]);
    });

    it("leaves a third party seeing both of them", async () => {
      const db = chat(["user_ada", "user_troll", "user_bola"]);
      const blocks = new FakeBlockDirectory().block("user_ada", "user_troll");

      const page = await messagesService(
        db,
        new FakeAuthorDirectory(),
        blocks,
      ).list("user_bola", GROUP_ID);

      expect(page.map((message) => message.userId)).toEqual([
        "user_ada",
        "user_troll",
        "user_bola",
      ]);
    });

    it("restores visibility once the block is undone", async () => {
      const db = chat(["user_ada", "user_troll"]);
      const blocks = new FakeBlockDirectory().block("user_ada", "user_troll");
      const service = messagesService(db, new FakeAuthorDirectory(), blocks);

      await expect(service.list("user_ada", GROUP_ID)).resolves.toHaveLength(1);

      blocks.pairs = [];
      await expect(service.list("user_ada", GROUP_ID)).resolves.toHaveLength(2);
    });

    it("never hides the reader's own messages", async () => {
      // A stray self-block row would otherwise blank the caller's whole side of
      // every conversation, which reads as total data loss.
      const db = chat(["user_ada", "user_bola"]);
      const blocks = new FakeBlockDirectory().block("user_ada", "user_ada");

      const page = await messagesService(
        db,
        new FakeAuthorDirectory(),
        blocks,
      ).list("user_ada", GROUP_ID);

      expect(page.map((message) => message.userId)).toEqual([
        "user_ada",
        "user_bola",
      ]);
    });

    it("does not send a blocked author's name to the author directory", async () => {
      // The hidden rows are gone before the page is named, so a blocked member
      // is not even looked up — nothing about them reaches the response.
      const db = chat(["user_ada", "user_troll"]);
      const directory = new FakeAuthorDirectory();
      const blocks = new FakeBlockDirectory().block("user_ada", "user_troll");

      await messagesService(db, directory, blocks).list("user_ada", GROUP_ID);

      expect(directory.calls).toEqual([["user_ada"]]);
    });

    // -----------------------------------------------------------------------
    // Pagination
    // -----------------------------------------------------------------------

    it("keeps the page size honest when a block removes rows from it", async () => {
      // Over-fetch-and-trim, not filter-and-return-short: a client pages until
      // it gets fewer rows than it asked for, so a page shortened by a block
      // would read as the end of the group's history.
      const db = chat([
        "user_ada",
        "user_troll",
        "user_bola",
        "user_troll",
        "user_chidi",
      ]);
      const blocks = new FakeBlockDirectory().block("user_ada", "user_troll");

      const page = await messagesService(
        db,
        new FakeAuthorDirectory(),
        blocks,
      ).list("user_ada", GROUP_ID, { limit: 3 });

      expect(page).toHaveLength(3);
      expect(page.map((message) => message.userId)).toEqual([
        "user_ada",
        "user_bola",
        "user_chidi",
      ]);
    });

    it("advances the keyset across a block that straddles a page boundary, with no skips and no repeats", async () => {
      // Eight messages, alternating, with the blocked author sitting exactly on
      // the seam of every page. Paging the way the client does must yield the
      // five visible messages once each, oldest last, in order.
      const db = chat([
        "user_ada", // 1
        "user_troll", // 2  — dropped, on the first page's tail
        "user_ada", // 3
        "user_troll", // 4  — dropped, first row after the boundary
        "user_ada", // 5
        "user_ada", // 6
        "user_troll", // 7  — dropped, on the last seam
        "user_ada", // 8
      ]);
      const blocks = new FakeBlockDirectory().block("user_ada", "user_troll");
      const service = messagesService(db, new FakeAuthorDirectory(), blocks);
      const visible = db.messages
        .filter((message) => message.userId === "user_ada")
        .map((message) => message.id);

      const collected: string[] = [];
      let cursor: { before?: Date; beforeId?: string } = {};
      for (let page = 0; page < 6; page += 1) {
        const rows = await service.list("user_ada", GROUP_ID, {
          limit: 2,
          ...cursor,
        });
        collected.push(...ids(rows));
        if (rows.length < 2) break;
        const last = rows[rows.length - 1];
        cursor = { before: last.createdAt, beforeId: last.id };
      }

      // Every visible message exactly once, in order — and nothing else.
      expect(collected).toEqual(visible);
      expect(new Set(collected).size).toBe(collected.length);
      expect(collected).not.toContain(
        db.messages.find((message) => message.userId === "user_troll")?.id,
      );
    });

    it("refills a page whose whole first read was blocked, rather than reporting the end of history", async () => {
      // limit 2 reads 4 rows a round; the first four are all the blocked
      // author's. Returning [] here would tell the client the group is over.
      const db = chat([
        "user_troll",
        "user_troll",
        "user_troll",
        "user_troll",
        "user_ada",
        "user_bola",
      ]);
      const blocks = new FakeBlockDirectory().block("user_ada", "user_troll");

      const page = await messagesService(
        db,
        new FakeAuthorDirectory(),
        blocks,
      ).list("user_ada", GROUP_ID, { limit: 2 });

      expect(page.map((message) => message.userId)).toEqual([
        "user_ada",
        "user_bola",
      ]);
    });

    it("asks the store for exactly the page when the reader has blocked nobody", async () => {
      // No blocks, no over-fetch: the pre-block query, unchanged, for the
      // overwhelming majority of callers.
      const db = chat(["user_ada", "user_bola"]);
      await messagesService(db).list("user_ada", GROUP_ID, { limit: 2 });
      expect(db.lastLimit).toBe(2);
    });

    // -----------------------------------------------------------------------
    // Cost
    // -----------------------------------------------------------------------

    it("looks the block list up ONCE per list call, whatever the page size", async () => {
      const db = chat(Array.from({ length: 40 }, () => "user_bola"));
      const blocks = new FakeBlockDirectory().block("user_ada", "user_troll");
      const service = messagesService(db, new FakeAuthorDirectory(), blocks);

      await service.list("user_ada", GROUP_ID, { limit: 1 });
      expect(blocks.calls).toEqual(["user_ada"]);

      await service.list("user_ada", GROUP_ID, { limit: 50 });
      expect(blocks.calls).toEqual(["user_ada", "user_ada"]);
    });

    it("looks it up once even when the page needs several refill rounds", async () => {
      const db = chat([
        ...Array.from({ length: 12 }, () => "user_troll"),
        "user_ada",
      ]);
      const blocks = new FakeBlockDirectory().block("user_ada", "user_troll");

      await messagesService(db, new FakeAuthorDirectory(), blocks).list(
        "user_ada",
        GROUP_ID,
        { limit: 2 },
      );

      expect(blocks.calls).toHaveLength(1);
    });

    // -----------------------------------------------------------------------
    // The uuid namespace
    // -----------------------------------------------------------------------

    it("also hides an author whose community rows carry the derived uuid", async () => {
      // `user_blocks` is uuid-keyed and `community_group_messages.user_id` is
      // text; most rows hold the raw subject but some hold the derived uuid, so
      // both keys are matched.
      const db = chat(["user_ada", "uuid-of:user_troll"]);
      const blocks = new FakeBlockDirectory().block("user_ada", "user_troll");

      const page = await messagesService(
        db,
        new FakeAuthorDirectory(),
        blocks,
      ).list("user_ada", GROUP_ID);

      expect(page.map((message) => message.userId)).toEqual(["user_ada"]);
    });

    it("still hides a blocked member whose uuid maps back to no profile row", async () => {
      // `toDatabaseUserId` is one-way, so an unresolvable row yields no
      // subject; the stored uuid is the only key left and it must still work.
      const db = chat(["user_ada", "uuid-of:user_troll"]);
      const blocks = new FakeBlockDirectory().block("user_ada", "user_troll");
      blocks.unresolved.push("user_troll");

      const page = await messagesService(
        db,
        new FakeAuthorDirectory(),
        blocks,
      ).list("user_ada", GROUP_ID);

      expect(page.map((message) => message.userId)).toEqual(["user_ada"]);
    });
  });
});
