import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  communityGroupMembers,
  communityGroupMessages,
  communityGroups,
  type CommunityGroup,
  type CommunityGroupMember,
  type CommunityGroupMessage,
} from "../db/schema";
import {
  canModerateGroup,
  canPostInGroup,
  canReadGroup,
} from "./community-authz";
import type { SendMessageDto } from "./dto/community.dto";
import { screenMessage } from "./message-screen";

export type { CommunityGroup, CommunityGroupMember, CommunityGroupMessage };

const LIST_LIMIT = 50;

export type NewMessageRow = {
  groupId: string;
  userId: string;
  body: string;
  kind: string;
  opportunityId?: string | null;
};

/**
 * A keyset cursor. `created_at` alone is not unique — it is `defaultNow()`,
 * i.e. transaction time, so any transaction writing two rows (a `kind='system'`
 * post alongside another write) gives them the identical timestamp. Paging on
 * the timestamp alone then skips every row that shares the page boundary's
 * instant, so `id` rides along as the tiebreak.
 */
export type MessageCursor = {
  createdAt: Date;
  id?: string;
};

/**
 * What `softDelete` writes. The SERVICE decides these values; the store only
 * applies them. Keeping the blanking out of the adapter is deliberate: it is a
 * security boundary (the mobile client reads community_group_messages directly
 * over Realtime, so a tombstone that kept its text would still be readable by
 * every member), and a rule that lives in the adapter can only ever be tested
 * against a reimplementation of itself in the spec's double.
 */
export type MessagePatch = {
  body?: string;
  deletedAt?: Date | null;
  deletedBy?: string | null;
};

/**
 * The derived-counter write that accompanies an insert, decided by the service
 * for the same reason as `MessagePatch`. The store applies it inside the insert
 * transaction so a reader can never observe a message without its counter bump.
 */
export type GroupCounterBump = {
  /** Added to `community_groups.message_count`. */
  messageCountDelta: number;
  /** When true, `last_message_at` is set to the inserted row's `created_at`. */
  touchLastMessageAt: boolean;
};

/**
 * The persistence boundary, mirroring `GroupsStore` in groups.service.ts:
 * the service depends on this, not on Drizzle, so the spec can hand it a
 * plain in-memory double instead of mocking a query-builder chain call by
 * call. Every method here is a dumb applier — no method decides *what* to
 * write, only how to write it — so a double cannot accidentally supply a
 * behaviour the production adapter is missing.
 */
export interface MessagesStore {
  findGroup(groupId: string): Promise<CommunityGroup | null>;
  findMembership(
    groupId: string,
    userId: string,
  ): Promise<CommunityGroupMember | null>;
  listMessages(
    groupId: string,
    before: MessageCursor | null,
    limit: number,
  ): Promise<CommunityGroupMessage[]>;
  findMessage(messageId: string): Promise<CommunityGroupMessage | null>;
  insertMessage(
    row: NewMessageRow,
    bump: GroupCounterBump,
  ): Promise<CommunityGroupMessage>;
  updateMessage(
    messageId: string,
    patch: MessagePatch,
  ): Promise<CommunityGroupMessage | null>;
}

/** Token so the module can swap the store without touching the service. */
export const MESSAGES_STORE = Symbol("MESSAGES_STORE");

// ---------------------------------------------------------------------------
// Author directory
// ---------------------------------------------------------------------------

/**
 * The neutral name a member with no usable profile is shown under.
 *
 * ~9 of 43 profile rows in this database carry a `full_name`, so an absent name
 * is the COMMON case, not the edge case. "Unknown" and an empty bubble both
 * read as a bug; this reads as a person who has not filled their profile in.
 *
 * Exported because `ModerationService`'s block list renders the same people and
 * must call them the same thing — a name that differs between the chat bubble
 * and the "Blocked" screen is a name the user cannot match up.
 */
export const UNNAMED_MEMBER = "Edutu member";

/**
 * One profile row, **echoed back under the id that was ASKED for**.
 *
 * That echo is the whole design. `profiles.user_id` is declared `uuid` in
 * `schema.ts` but the LIVE column is `text` and holds the raw Clerk subject in
 * 47 of 50 rows, with the rest holding the derived uuid from
 * `toDatabaseUserId`. Matching across both representations is the adapter's job
 * (it has `public.clerk_id_to_uuid` to do it in SQL); the service must never
 * have to guess which representation came back, so the adapter returns the
 * request key, not the stored key.
 */
export type AuthorRow = {
  /** The raw Clerk subject the caller asked about — NOT `profiles.user_id`. */
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
};

/**
 * Names and avatars for a page of messages.
 *
 * A separate boundary from `MessagesStore` on purpose: it is keyed on a
 * different table with a different id convention, and keeping it apart means a
 * double for one is not forced to fake the other.
 */
export interface AuthorDirectory {
  /** ONE query for the whole page. Never called per message. */
  findAuthors(userIds: string[]): Promise<AuthorRow[]>;
}

/** Token so the module can swap the directory without touching the service. */
export const AUTHOR_DIRECTORY = Symbol("AUTHOR_DIRECTORY");

/** What the client renders beside a bubble. Nothing else about the person. */
export type MessageAuthor = {
  displayName: string;
  /** Absent for every row in production today; the column exists and is null. */
  avatarUrl: string | null;
};

/**
 * A message plus its author card.
 *
 * `author` carries a display name and an avatar and NOTHING ELSE. `profiles`
 * also holds email, country, school, cgpa and credits; none of it is selected,
 * so none of it can leak through a spread. The message's own `userId` is
 * unchanged and still present — it is the key the report and block routes take,
 * and removing it would break both.
 */
export type CommunityMessageWithAuthor = CommunityGroupMessage & {
  author: MessageAuthor;
};

// ---------------------------------------------------------------------------
// Drizzle-backed store
// ---------------------------------------------------------------------------

export class DrizzleMessagesStore implements MessagesStore {
  async findGroup(groupId: string): Promise<CommunityGroup | null> {
    const [row] = await db
      .select()
      .from(communityGroups)
      .where(eq(communityGroups.id, groupId))
      .limit(1);
    return row ?? null;
  }

  async findMembership(
    groupId: string,
    userId: string,
  ): Promise<CommunityGroupMember | null> {
    const [row] = await db
      .select()
      .from(communityGroupMembers)
      .where(
        and(
          eq(communityGroupMembers.groupId, groupId),
          eq(communityGroupMembers.userId, userId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async listMessages(
    groupId: string,
    before: MessageCursor | null,
    limit: number,
  ): Promise<CommunityGroupMessage[]> {
    const conditions = [eq(communityGroupMessages.groupId, groupId)];
    if (before) {
      conditions.push(
        before.id
          ? // Keyset, not offset: strictly-older, or same instant and a
            // strictly-smaller id, matching the (created_at desc, id desc) sort.
            (or(
              lt(communityGroupMessages.createdAt, before.createdAt),
              and(
                eq(communityGroupMessages.createdAt, before.createdAt),
                lt(communityGroupMessages.id, before.id),
              ),
            ) ?? sql`true`)
          : lt(communityGroupMessages.createdAt, before.createdAt),
      );
    }
    return db
      .select()
      .from(communityGroupMessages)
      .where(and(...conditions))
      .orderBy(
        desc(communityGroupMessages.createdAt),
        desc(communityGroupMessages.id),
      )
      .limit(Math.min(limit, LIST_LIMIT));
  }

  async findMessage(messageId: string): Promise<CommunityGroupMessage | null> {
    const [row] = await db
      .select()
      .from(communityGroupMessages)
      .where(eq(communityGroupMessages.id, messageId))
      .limit(1);
    return row ?? null;
  }

  async insertMessage(
    row: NewMessageRow,
    bump: GroupCounterBump,
  ): Promise<CommunityGroupMessage> {
    // One transaction: the group's message_count/last_message_at are derived
    // from this row, so writing them apart would let a reader observe a
    // message with no counter bump, or a bump with no message.
    return db.transaction(async (tx) => {
      const [message] = await tx
        .insert(communityGroupMessages)
        .values({
          groupId: row.groupId,
          userId: row.userId,
          body: row.body,
          kind: row.kind,
          opportunityId: row.opportunityId ?? null,
        })
        .returning();
      const counters: Record<string, unknown> = {};
      if (bump.messageCountDelta !== 0) {
        counters.messageCount = sql`${communityGroups.messageCount} + ${bump.messageCountDelta}`;
      }
      if (bump.touchLastMessageAt) counters.lastMessageAt = message.createdAt;
      if (Object.keys(counters).length > 0) {
        await tx
          .update(communityGroups)
          .set(counters)
          .where(eq(communityGroups.id, row.groupId));
      }
      return message;
    });
  }

  /** Applies exactly the patch it is handed; it decides nothing itself. */
  async updateMessage(
    messageId: string,
    patch: MessagePatch,
  ): Promise<CommunityGroupMessage | null> {
    if (Object.keys(patch).length === 0) return this.findMessage(messageId);
    const [row] = await db
      .update(communityGroupMessages)
      .set(patch)
      .where(eq(communityGroupMessages.id, messageId))
      .returning();
    return row ?? null;
  }
}

/**
 * Reads `profiles` for a page's distinct authors in ONE round trip.
 *
 * THE JOIN IS DUAL-KEYED AND THAT IS NOT OPTIONAL. `schema.ts` declares
 * `profiles.user_id` as `uuid`; the live column is `text`, and it holds the raw
 * Clerk subject for most rows and the `toDatabaseUserId` uuid for the rest.
 * `eq(profiles.userId, subject)` type-checks, runs, and returns nothing for the
 * minority — a silent, partial blank-out that no error would ever surface. This
 * mirrors `matchProfileUserId` in `common/user-id.ts`, written out here because
 * the match is against a per-request VALUES list rather than a single column,
 * and because `clerk_id_to_uuid` has to be applied to BOTH sides: the requested
 * id is a raw subject and the stored id may already be derived.
 *
 * `unnest(array[...])` rather than a query per message: 50 messages from 12
 * people is one query, not twelve. The array is parameterised, never spliced.
 */
export class DrizzleAuthorDirectory implements AuthorDirectory {
  async findAuthors(userIds: string[]): Promise<AuthorRow[]> {
    const ids = Array.from(
      new Set((userIds ?? []).map((id) => (id || "").trim()).filter(Boolean)),
    );
    // No authors, no query. This is also what keeps a spec that never lists a
    // message from touching the database at all.
    if (ids.length === 0) return [];

    const result = await db.execute(sql`
      select
        w.user_id                          as user_id,
        max(p.full_name)                   as full_name,
        max(p.avatar_url)                  as avatar_url
      from unnest(array[${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}]::text[]) as w(user_id)
      left join public.profiles p
        on p.user_id::text = w.user_id
        or public.clerk_id_to_uuid(p.user_id::text) = public.clerk_id_to_uuid(w.user_id)
      group by w.user_id
    `);

    // SELECTS ONLY name AND avatar. `select *` here would put every member's
    // email in front of every other member the first time somebody spread the
    // row into a response.
    return extractRows<{
      user_id: string;
      full_name: string | null;
      avatar_url: string | null;
    }>(result).map((row) => ({
      userId: row.user_id,
      fullName: row.full_name ?? null,
      avatarUrl: row.avatar_url ?? null,
    }));
  }
}

/** `db.execute` is a pg `QueryResult` on some paths and a bare array on others. */
function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows?: T[] }).rows ?? [];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ListMessagesOptions = {
  /** Page boundary: return messages strictly older than this instant. */
  before?: Date;
  /** The boundary row's id, breaking ties on an identical `before`. */
  beforeId?: string;
  limit?: number;
};

/**
 * Deliberately does NOT import `GroupsService`: that service posts
 * `kind: 'system'` messages on membership changes, so a dependency the other
 * way would be circular. Membership is read directly off
 * `community_group_members` instead.
 */
@Injectable()
export class MessagesService {
  private readonly store: MessagesStore;
  private readonly authors: AuthorDirectory;

  constructor(
    @Optional() @Inject(MESSAGES_STORE) store?: MessagesStore,
    @Optional() @Inject(AUTHOR_DIRECTORY) authors?: AuthorDirectory,
  ) {
    this.store = store ?? new DrizzleMessagesStore();
    this.authors = authors ?? new DrizzleAuthorDirectory();
  }

  /**
   * Does not mirror `GroupsService.get`'s visibility rule — it IS that rule.
   * Both call `canReadGroup`, which is the whole reason community-authz.ts
   * exists: the previous copy here admitted `pending` and refused `invited`
   * while `get` did the opposite, so unvetted applicants got the full message
   * history and genuine invitees could not load the invite preview.
   *
   * The membership row is read for every group, not only private ones, so this
   * asks the shared predicate the same question `get` asks rather than
   * second-guessing when the answer could depend on the row. One indexed point
   * select; `get` has always paid it.
   *
   * This line is the entire boundary — the backend connects as `service_role`,
   * so RLS is bypassed, not a second line of defence.
   */
  async list(
    userId: string,
    groupId: string,
    options: ListMessagesOptions = {},
  ): Promise<CommunityMessageWithAuthor[]> {
    const readerId = this.requireUserId(userId);
    const group = await this.requireGroup(groupId);
    const membership = await this.store.findMembership(groupId, readerId);
    if (!canReadGroup(group, membership)) {
      throw new ForbiddenException("You're not a member of this group.");
    }
    const before: MessageCursor | null = options.before
      ? { createdAt: options.before, id: options.beforeId }
      : null;
    const messages = await this.store.listMessages(
      groupId,
      before,
      this.resolveLimit(options.limit),
    );
    return this.withAuthors(messages);
  }

  async send(
    userId: string,
    groupId: string,
    dto: SendMessageDto,
  ): Promise<CommunityMessageWithAuthor> {
    const senderId = this.requireUserId(userId);
    const group = await this.requireGroup(groupId);
    if (group.archivedAt) {
      throw new BadRequestException(
        "This group has been archived, so new messages can't be sent here.",
      );
    }

    const membership = await this.store.findMembership(groupId, senderId);
    // Banned gets its own terminal sentence. "Join before you post" is advice,
    // and advice a banned member cannot act on is worse than none: following it
    // lands them on `join`'s flat "You can't join this group."
    if (membership?.status === "banned") {
      throw new ForbiddenException(
        "You can no longer post in this group. This decision was made by the group's owners.",
      );
    }
    if (!canPostInGroup(group, membership)) {
      throw new ForbiddenException(
        "You need to join this group before you can post in it.",
      );
    }

    // The screener grades the raw text a member typed, not metadata, so its
    // machine token ("scam_pattern") never reaches them — only a sentence
    // explaining what reads as unsafe, without accusing them of anything.
    // An empty body is a different failure and gets a different sentence: an
    // internal caller posting blank text has not tried to scam anybody.
    const verdict = screenMessage(dto.body);
    if (!verdict.allowed) {
      if (verdict.reason === "empty") {
        throw new BadRequestException("Type a message before sending it.");
      }
      throw new BadRequestException(
        "That message can't be sent — it reads like it's asking for money, secrets, or to move the conversation off Edutu, which we block to keep members safe from scams.",
      );
    }

    const stored = await this.store.insertMessage(
      {
        groupId,
        userId: senderId,
        body: dto.body,
        kind: "text",
        opportunityId: dto.opportunityId ?? null,
      },
      // The counters are this service's decision, not the adapter's: one more
      // message, and this row becomes the group's most recent activity.
      { messageCountDelta: 1, touchLastMessageAt: true },
    );
    // The SAME shape `list` returns. The client appends this response straight
    // into the page it is already rendering; a message with no `author` would
    // show the sender's own bubble under the fallback name until they refreshed.
    const [withAuthor] = await this.withAuthors([stored]);
    return withAuthor;
  }

  /**
   * Tombstones a message: the row survives so the moderation record does, but
   * the text goes. **The blanking is decided here, not in the adapter**, because
   * it is a security boundary — the mobile client subscribes to
   * `community_group_messages` over Realtime, so a deleted row that kept its
   * body would still be readable by every member of the group.
   */
  async softDelete(
    actorId: string,
    messageId: string,
  ): Promise<CommunityMessageWithAuthor> {
    const acting = this.requireUserId(actorId);
    // `messageId` is the one identifier a client hands straight in, and the
    // column is `uuid`: without this, "abc" reaches Postgres and comes back as
    // 22P02 — a raw 500 where the user should get a sentence.
    this.assertUuid(messageId, "message");
    const message = await this.store.findMessage(messageId);
    if (!message) throw new NotFoundException("That message was not found.");

    if (message.userId !== acting) {
      await this.assertCanModerate(message.groupId, acting);
    }

    const updated = await this.store.updateMessage(messageId, {
      body: "",
      deletedAt: new Date(),
      deletedBy: acting,
    });
    if (!updated) throw new NotFoundException("That message was not found.");
    // A tombstone is folded back into the open page by the client, so it keeps
    // the author card the row it replaces had.
    const [withAuthor] = await this.withAuthors([updated]);
    return withAuthor;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Attaches an author card to every message in a page using ONE directory
   * call for the page's DISTINCT authors — never one per message. A 50-message
   * page from a dozen people is one query; the naive shape is twelve to fifty,
   * each a round trip, on the screen users open most.
   *
   * The fallback and the trimming are decided HERE, not in the directory, so a
   * double cannot supply them on the service's behalf: the store returns the
   * raw column values and this method turns them into what a bubble renders.
   */
  private async withAuthors(
    messages: CommunityGroupMessage[],
  ): Promise<CommunityMessageWithAuthor[]> {
    const distinct = Array.from(
      new Set(
        messages
          .map((message) => (message.userId || "").trim())
          .filter(Boolean),
      ),
    );
    const rows = distinct.length
      ? await this.authors.findAuthors(distinct)
      : [];
    const byId = new Map(rows.map((row) => [row.userId, row]));
    return messages.map((message) => ({
      ...message,
      author: this.toAuthor(byId.get((message.userId || "").trim())),
    }));
  }

  /**
   * A missing profile row is the COMMON case here, not an error: most members
   * have never filled a name in. It resolves to a neutral display name rather
   * than a null the client has to special-case, or a throw that would blank an
   * entire page of chat over one absent row.
   */
  private toAuthor(row: AuthorRow | undefined): MessageAuthor {
    const displayName = (row?.fullName || "").trim();
    const avatarUrl = (row?.avatarUrl || "").trim();
    return {
      displayName: displayName || UNNAMED_MEMBER,
      avatarUrl: avatarUrl || null,
    };
  }

  private async requireGroup(groupId: string): Promise<CommunityGroup> {
    this.assertUuid(groupId, "group");
    const group = await this.store.findGroup(groupId);
    if (!group) throw new NotFoundException("That group was not found.");
    return group;
  }

  /**
   * The same function `GroupsService.assertCanAdminister` calls — literally the
   * same, not a restatement. Importing GroupsService would be circular (it posts
   * `kind='system'` messages through this service), and that constraint is what
   * produced the copy this replaces; a dependency-free module dissolves it.
   */
  private async assertCanModerate(
    groupId: string,
    userId: string,
  ): Promise<void> {
    const group = await this.store.findGroup(groupId);
    const membership = await this.store.findMembership(groupId, userId);
    if (!canModerateGroup(group, userId, membership)) {
      throw new ForbiddenException(
        "You're not allowed to delete this message.",
      );
    }
  }

  /**
   * The 50-row cap belongs beside the authorization it accompanies, not only in
   * the adapter: an unclamped `limit: -1` reaches Drizzle as `LIMIT -1`, which
   * is a SQL error and therefore a 500. Negatives and fractions are floored
   * into range rather than rejected — a bad page size is not worth an error
   * screen when a sane page is available.
   */
  private resolveLimit(limit?: number): number {
    if (limit === undefined || !Number.isFinite(limit)) return LIST_LIMIT;
    return Math.max(1, Math.min(Math.floor(limit), LIST_LIMIT));
  }

  private requireUserId(userId: string): string {
    // Raw Clerk subject, never toDatabaseUserId: these columns are `text` and
    // the RLS policies (bypassed only because this runs as service_role, not
    // enforced by it) compare them straight against auth.jwt() ->> 'sub'.
    const trimmed = (userId || "").trim();
    if (!trimmed) throw new BadRequestException("You need to be signed in.");
    return trimmed;
  }

  private assertUuid(value: string, label: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException(`That ${label} link isn't valid.`);
    }
  }
}
