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
  "sendMessage",
  "deleteMessage",
  "report",
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
    return this.groups.filter(
      (group) => group.visibility === "public" || visible.has(group.id),
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
  const controller = new CommunitiesController(groups, stub(), stub(), stub());
  return { store, groups, controller };
}

describe("CommunitiesController.listGroups mine filter", () => {
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
