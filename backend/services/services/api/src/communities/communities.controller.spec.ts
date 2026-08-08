import { randomUUID } from "node:crypto";
import type { ExecutionContext } from "@nestjs/common";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { CommunitiesController } from "./communities.controller";
import { GroupFormSchema } from "./dto/community.dto";
import type {
  CommunityGroup,
  CommunityGroupMember,
  GroupListFilter,
  GroupsStore,
} from "./groups.service";
import { GroupsService } from "./groups.service";
import type { ModerationStore } from "./moderation.service";
import { ModerationService } from "./moderation.service";

const stub = () => ({}) as never;

/**
 * The raw Clerk subject, and the uuid `ClerkAuthGuard` DERIVES from it. Every
 * `community_*` table keys on the first; `toDatabaseUserId` produces the
 * second, and it is what `@CurrentUser("id")` would hand a handler.
 */
const RAW_SUBJECT = "user_2abcRAWclerksub";
const DERIVED_UUID = "6f9619ff-8b86-4d011-b42d-00cf4fc964ff";

/**
 * Resolves a handler's parameters the way Nest does at request time: by running
 * the custom param decorators' own factories against a request.
 *
 * THIS IS THE POINT OF THE TEST. Calling `controller.createGroup("raw", dto)`
 * directly passes whatever string the spec chose and never touches
 * `@CurrentUser` at all, so it stays green whether the decorator says `authId`
 * or `id` — a test that proves only that the spec can pass a string to a
 * method. Reading `ROUTE_ARGS_METADATA` and invoking the stored factory
 * exercises the decorator itself, which is the thing that can be wrong.
 */
function resolveCustomArgs(
  method: keyof CommunitiesController,
  user: Record<string, string>,
): unknown[] {
  const metadata: Record<
    string,
    {
      index: number;
      data: unknown;
      factory?: (data: unknown, ctx: ExecutionContext) => unknown;
    }
  > =
    Reflect.getMetadata(ROUTE_ARGS_METADATA, CommunitiesController, method) ??
    {};
  const ctx = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return Object.values(metadata)
    .filter((entry) => typeof entry.factory === "function")
    .map((entry) => entry.factory!(entry.data, ctx));
}

/** Every route on the controller, so none of them can be forgotten. */
const HANDLERS: (keyof CommunitiesController)[] = [
  "listGroups",
  "getGroup",
  "listGroupMembers",
  "createGroup",
  "updateGroup",
  "joinGroup",
  "archiveGroup",
  "inviteToGroup",
  "setMemberRole",
  "removeMember",
  "getForm",
  "setForm",
  "listRequests",
  "decideRequest",
  "listMessages",
  "listResources",
  "sendMessage",
  "createAttachmentUpload",
  "createGroupCoverImageUpload",
  "getAttachmentDownloadUrl",
  "deleteMessage",
  "report",
  "block",
  "listBlocks",
  "unblock",
  "listOwnContent",
];

describe("CommunitiesController identity", () => {
  it("keys every handler on the RAW Clerk subject, not the derived uuid", () => {
    // `id` is toDatabaseUserId(sub); the community tables are `text` columns
    // compared straight against auth.jwt() ->> 'sub'. A handler that took `id`
    // would write rows the RLS policy can never match — messages that vanish
    // for the person who sent them, with no error anywhere.
    const user = { id: DERIVED_UUID, authId: RAW_SUBJECT };
    for (const handler of HANDLERS) {
      const args = resolveCustomArgs(handler, user);
      expect({ handler, args }).toEqual({ handler, args: [RAW_SUBJECT] });
    }
  });

  it("covers every route the controller declares", () => {
    // Guards the list above: a route added without an entry here would never be
    // checked by the assertion that matters.
    const declared = Object.getOwnPropertyNames(
      CommunitiesController.prototype,
    ).filter(
      (name) =>
        name !== "constructor" &&
        Reflect.getMetadata(ROUTE_ARGS_METADATA, CommunitiesController, name),
    );
    expect(declared.sort()).toEqual([...HANDLERS].sort());
  });
});

// ---------------------------------------------------------------------------
// `mine` — the browse screen's primary section
// ---------------------------------------------------------------------------

/**
 * A store that answers the two reads `list` performs and DECIDES NOTHING: it
 * deliberately ignores `restrictToGroupIds`, so what the assertions below
 * observe is the SERVICE's narrowing rather than a reimplementation of it in
 * the double. (The real adapter applies the hint in SQL so the 50-row cap
 * counts the right rows; that is an efficiency, not the rule.)
 *
 * `listMembershipsForUser` likewise returns EVERY row, `banned` included — it
 * used to filter to the three live statuses, which meant the assertions below
 * about who is excluded were checking this class rather than the service.
 */
class ListOnlyStore implements Partial<GroupsStore> {
  groups: CommunityGroup[] = [];
  members: CommunityGroupMember[] = [];
  lastFilter: GroupListFilter | null = null;

  async listMembershipsForUser(
    userId: string,
  ): Promise<CommunityGroupMember[]> {
    return this.members.filter((row) => row.userId === userId);
  }

  async listGroups(filter: GroupListFilter): Promise<CommunityGroup[]> {
    this.lastFilter = filter;
    const visible = new Set(filter.visibleGroupIds ?? []);
    const restricted = filter.restrictToGroupIds
      ? new Set(filter.restrictToGroupIds)
      : null;
    return this.groups
      .filter(
        (group) =>
          !restricted ||
          restricted.has(group.id) ||
          group.ownerId === filter.includeOwnedBy,
      )
      .filter(
        (group) =>
          group.visibility === "public" ||
          visible.has(group.id) ||
          group.ownerId === filter.includeOwnedBy,
      );
  }

  addGroup(overrides: Partial<CommunityGroup> = {}): CommunityGroup {
    const row: CommunityGroup = {
      id: randomUUID(),
      slug: `group-${this.groups.length}`,
      name: `Group ${this.groups.length}`,
      description: null,
      opportunityId: null,
      ownerId: "user_owner",
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

  addMember(groupId: string, userId: string, status: string): void {
    this.members.push({
      id: randomUUID(),
      groupId,
      userId,
      role: "member",
      status,
      joinedAt: new Date(),
    });
  }
}

function listSetup() {
  const store = new ListOnlyStore();
  const groups = new GroupsService(store as unknown as GroupsStore);
  const controller = new CommunitiesController(groups, stub(), stub(), stub(), stub());
  return { store, groups, controller };
}

describe("CommunitiesController.listGroups mine filter", () => {
  it("returns a group created by the caller even when its owner membership row is missing", async () => {
    const { store, controller } = listSetup();
    const owned = store.addGroup({
      name: "Created earlier",
      ownerId: RAW_SUBJECT,
      visibility: "private",
    });

    const rows = await controller.listGroups(RAW_SUBJECT, "true");

    expect(rows.map((row) => row.group.id)).toEqual([owned.id]);
    expect(rows[0].membership).toBeNull();
  });

  it("returns only the groups the caller has a live membership on", async () => {
    const { store, controller } = listSetup();
    const mine = store.addGroup({ name: "Mine" });
    store.addGroup({ name: "Someone else's" });
    store.addMember(mine.id, RAW_SUBJECT, "active");

    const rows = await controller.listGroups(RAW_SUBJECT, "true");

    expect(rows.map((row) => row.group.name)).toEqual(["Mine"]);
  });

  it("counts a group the caller applied to, MARKED pending", async () => {
    // This used to be excluded, on the reasoning that listing an undecided
    // application under "your groups" tells the applicant they are in. The row
    // now carries `pending`, so the screen says "waiting for approval" instead
    // of claiming membership — and an application that appears nowhere is an
    // applicant with no way to see they already applied.
    const { store, controller } = listSetup();
    const applied = store.addGroup({ name: "Applied to" });
    store.addMember(applied.id, RAW_SUBJECT, "pending");

    const rows = await controller.listGroups(RAW_SUBJECT, "true");

    expect(rows.map((row) => [row.group.name, row.membership?.status])).toEqual(
      [["Applied to", "pending"]],
    );
  });

  it("counts an unaccepted invitation, MARKED invited", async () => {
    // The dead end this fix closes: a private group cannot be self-joined, so
    // the `invited` row is the ONLY way in, and while `mine` meant `active` the
    // invitee had nowhere in the app to find it.
    const { store, controller } = listSetup();
    const invited = store.addGroup({
      name: "Invited to",
      visibility: "private",
    });
    store.addMember(invited.id, RAW_SUBJECT, "invited");

    const rows = await controller.listGroups(RAW_SUBJECT, "true");

    expect(rows.map((row) => [row.group.name, row.membership?.status])).toEqual(
      [["Invited to", "invited"]],
    );
  });

  it("counts neither a removal nor a ban as a group of theirs", async () => {
    const { store, controller } = listSetup();
    const removed = store.addGroup({
      name: "Removed from",
      visibility: "private",
    });
    const banned = store.addGroup({
      name: "Banned from",
      visibility: "private",
    });
    store.addMember(removed.id, RAW_SUBJECT, "removed");
    store.addMember(banned.id, RAW_SUBJECT, "banned");

    expect(await controller.listGroups(RAW_SUBJECT, "true")).toEqual([]);
    // And neither id was offered to the store as visible, so the real adapter's
    // WHERE clause never unlocks them either.
    expect(store.lastFilter?.visibleGroupIds).toEqual([]);
  });

  it("still browses every public group when mine is absent", async () => {
    const { store, controller } = listSetup();
    const mine = store.addGroup({ name: "Mine" });
    store.addGroup({ name: "Someone else's" });
    store.addMember(mine.id, RAW_SUBJECT, "active");

    const rows = await controller.listGroups(RAW_SUBJECT);

    expect(rows.map((row) => row.group.name).sort()).toEqual([
      "Mine",
      "Someone else's",
    ]);
  });

  it("narrows to nothing rather than to everything for a caller in no groups", async () => {
    // The bug this filter exists to fix: with no `mine` parameter the flag was
    // ignored and "your groups" rendered every group in the system.
    const { store, controller } = listSetup();
    store.addGroup({ name: "Someone else's" });

    expect(await controller.listGroups(RAW_SUBJECT, "true")).toEqual([]);
    // And the store is told to restrict to the empty set, so the real adapter
    // short-circuits instead of falling through to every public group.
    expect(store.lastFilter?.restrictToGroupIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Blocks — the routes that make a block server state
// ---------------------------------------------------------------------------

/**
 * The REAL `ModerationService` over a tiny in-memory `user_blocks`. A stub of
 * the service would only prove that the controller can call a mock; what has to
 * be true is that a block written through `POST /communities/blocks` is the one
 * `GET` returns and `DELETE` removes.
 *
 * The store applies and reports. Every decision — the returned id, the fallback
 * name, whether an absent row is an error — belongs to the service.
 */
function blocksSetup() {
  const rows: { blockerId: string; blockedId: string }[] = [];
  const profiles = new Map<string, string>();
  const store: ModerationStore = {
    findGroup: async () => null,
    findMembership: async () => null,
    findMessage: async () => null,
    findOpenReport: async () => null,
    insertReport: () => {
      throw new Error("insertReport is not reached by the block routes");
    },
    insertBlock: async (row) => {
      const already = rows.some(
        (existing) =>
          existing.blockerId === row.blockerId &&
          existing.blockedId === row.blockedId,
      );
      if (!already) rows.push({ ...row });
    },
    listBlocks: async (blockerId) =>
      rows
        .filter((row) => row.blockerId === blockerId)
        .map((row) => ({
          blockedDatabaseId: `derived-uuid-of:${row.blockedId}`,
          profileUserId: profiles.has(row.blockedId) ? row.blockedId : null,
          fullName: profiles.get(row.blockedId) ?? null,
          avatarUrl: null,
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
        })),
    deleteBlock: async (row) => {
      const index = rows.findIndex(
        (existing) =>
          existing.blockerId === row.blockerId &&
          existing.blockedId === row.blockedId,
      );
      if (index === -1) return false;
      rows.splice(index, 1);
      return true;
    },
  };
  const moderation = new ModerationService(store, {
    broadcast: async () => ({}),
  });
  const controller = new CommunitiesController(
    stub(),
    stub(),
    stub(),
    moderation,
    stub(),
  );
  return { rows, profiles, controller };
}

describe("CommunitiesController block routes", () => {
  it("persists a block through the route and hands it back on the next read", async () => {
    // The gap: `ModerationService.block` existed with no route, so the chat
    // screen kept blocks in AsyncStorage — gone on reinstall, invisible to the
    // member's other device, unknown to the server.
    const { controller, profiles } = blocksSetup();
    profiles.set("user_offender", "Ada Nwosu");

    await controller.block(RAW_SUBJECT, { userId: "user_offender" });

    await expect(controller.listBlocks(RAW_SUBJECT)).resolves.toEqual([
      {
        userId: "user_offender",
        displayName: "Ada Nwosu",
        avatarUrl: null,
        blockedAt: new Date("2026-08-01T00:00:00.000Z"),
        resolved: true,
      },
    ]);
  });

  it("unblocks, and the block is gone", async () => {
    const { controller } = blocksSetup();
    await controller.block(RAW_SUBJECT, { userId: "user_offender" });

    await expect(
      controller.unblock(RAW_SUBJECT, "user_offender"),
    ).resolves.toMatchObject({ success: true, wasBlocked: true });
    await expect(controller.listBlocks(RAW_SUBJECT)).resolves.toEqual([]);
  });

  it("shows a caller only their own blocks", async () => {
    const { controller } = blocksSetup();
    await controller.block(RAW_SUBJECT, { userId: "user_offender" });

    await expect(controller.listBlocks("user_someone_else")).resolves.toEqual(
      [],
    );
  });

  it("stores the RAW subject, which is what a message carries", async () => {
    // A block keyed on the derived uuid would never match `message.userId`.
    const { rows, controller } = blocksSetup();
    await controller.block(RAW_SUBJECT, { userId: "user_offender" });
    expect(rows).toEqual([
      { blockerId: RAW_SUBJECT, blockedId: "user_offender" },
    ]);
  });
});

describe("block route refusals", () => {
  it("answers an empty target with a sentence, not a driver error", async () => {
    // Belt and braces behind `BlockSchema`: the route's pipe rejects this
    // first in production, but a caller that reaches the service still gets a
    // sentence rather than a Postgres 22P02 on a uuid cast.
    const { controller } = blocksSetup();
    await expect(
      controller.block(RAW_SUBJECT, { userId: "  " }),
    ).rejects.toThrow(/who to block/i);
  });
});

describe("GroupFormSchema", () => {
  it("rejects a 6th custom question", () => {
    const six = Array.from({ length: 6 }, (_, index) => ({
      id: `q${index}`,
      type: "short_text",
      label: `Q${index}`,
      required: false,
    }));
    expect(() => GroupFormSchema.parse({ questions: six })).toThrow();
  });
});
