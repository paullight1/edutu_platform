import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { toDatabaseUserId } from "../common/user-id";
import { NotificationsService } from "../notifications/notifications.service";
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
import {
  CommunityAttachmentUploadSchema,
  CommunityFileAttachmentSchema,
  CommunityImageAttachmentSchema,
  SendMessageSchema,
  type CommunityAttachmentDto,
  type CommunityAttachmentUploadDto,
  type SendMessageDto,
} from "./dto/community.dto";
import { screenMessage } from "./message-screen";

export type { CommunityGroup, CommunityGroupMember, CommunityGroupMessage };

/** The largest page `list` will ever HAND BACK to a caller. */
const LIST_LIMIT = 50;

/**
 * The largest batch `list` will ever ASK THE STORE FOR in one round.
 *
 * Bigger than `LIST_LIMIT` because blocked authors' messages are dropped after
 * the rows come back, so a 50-row page has to read more than 50 rows to stay a
 * 50-row page. It is still a hard ceiling: the adapter clamps to it, so no
 * arithmetic upstream can turn into an unbounded scan.
 */
const FETCH_CEILING = 150;

/** How much slack to read per round when the caller has any blocks at all. */
const OVERFETCH_FACTOR = 2;

/**
 * How many times `list` will re-read to refill a page emptied by blocks.
 *
 * Bounded on purpose: a caller who has blocked every talkative member of a busy
 * group would otherwise walk the group's whole history inside one request. Five
 * rounds is up to 750 rows — far past any real block list — and the loop stops
 * the instant the page is full or the group is exhausted.
 */
const MAX_FETCH_ROUNDS = 5;

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
  /** Active member subjects used to fan out group activity notifications. */
  listActiveMemberUserIds?(groupId: string): Promise<string[]>;
  listMessages(
    groupId: string,
    before: MessageCursor | null,
    limit: number,
  ): Promise<CommunityGroupMessage[]>;
  /** Attachment-only history used by the Resources surface. */
  listResourceMessages?(
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

// ---------------------------------------------------------------------------
// Block directory
// ---------------------------------------------------------------------------

/**
 * One person on the other side of a block from the caller, in RAW COLUMN
 * VALUES — no decisions. The service turns these into the set it filters on.
 *
 * `databaseId` is the `uuid` stored in `user_blocks`. `subject` is the raw
 * Clerk subject recovered by joining back through `profiles`, or null when no
 * profile row matched: `toDatabaseUserId` is one-way, so a join is the only
 * route back from the uuid namespace `user_blocks` uses to the raw-subject
 * namespace `community_group_messages.user_id` uses.
 */
export type BlockedPartyRow = {
  databaseId: string;
  subject: string | null;
};

/**
 * Everyone in a MUTUAL block relationship with one caller.
 *
 * A separate boundary from `AuthorDirectory` for the same reason that one is
 * separate from `MessagesStore`: a different table, a different id convention
 * (`user_blocks` is `uuid` on both sides where the `community_*` tables are
 * `text`), and a double for one should not be forced to fake the other.
 */
export interface BlockDirectory {
  /**
   * BOTH DIRECTIONS. Rows where the caller is the blocker AND rows where the
   * caller is the blocked — a one-directional block would let the person who
   * was blocked keep reading, which is the exact outcome people block to stop.
   *
   * ONE query per `list` call. Never per message, never per page round.
   */
  findBlockedParties(userId: string): Promise<BlockedPartyRow[]>;
}

/** Token so the module can swap the directory without touching the service. */
export const BLOCK_DIRECTORY = Symbol("BLOCK_DIRECTORY");

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

  async listActiveMemberUserIds(groupId: string): Promise<string[]> {
    const rows = await db
      .select({ userId: communityGroupMembers.userId })
      .from(communityGroupMembers)
      .where(
        and(
          eq(communityGroupMembers.groupId, groupId),
          eq(communityGroupMembers.status, "active"),
        ),
      );
    return rows.map((row) => row.userId);
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
    return (
      db
        .select()
        .from(communityGroupMessages)
        .where(and(...conditions))
        .orderBy(
          desc(communityGroupMessages.createdAt),
          desc(communityGroupMessages.id),
        )
        // Clamped to the FETCH ceiling, not the page ceiling: `list` reads more
        // rows than it returns so that dropping a blocked author's messages does
        // not shrink the page. The page cap still lives in `resolveLimit`.
        .limit(Math.min(limit, FETCH_CEILING))
    );
  }

  async listResourceMessages(
    groupId: string,
    before: MessageCursor | null,
    limit: number,
  ): Promise<CommunityGroupMessage[]> {
    const conditions = [
      eq(communityGroupMessages.groupId, groupId),
      inArray(communityGroupMessages.kind, ["image", "file"]),
      isNull(communityGroupMessages.deletedAt),
    ];
    if (before) {
      conditions.push(
        before.id
          ? (or(
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
      .limit(Math.min(limit, FETCH_CEILING));
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

/**
 * Reads the caller's block relationships in ONE round trip, in both directions,
 * and maps each stored uuid back to the raw Clerk subject a message carries.
 *
 * THE ID TRANSLATION LIVES HERE, in the adapter that knows the column types,
 * and nowhere in the service — the same arrangement, and the same single
 * sanctioned exception to this feature's "never call `toDatabaseUserId`" rule,
 * as `DrizzleModerationStore.insertBlock`. `user_blocks` predates Group
 * Discussions, is `uuid` on both sides, and is shared with roadmap comments;
 * handing it a raw `user_2abc…` subject is not merely inconsistent, it is
 * Postgres 22P02.
 *
 * The `union` is what makes the block symmetric. The left half is "people I
 * blocked", the right half is "people who blocked me", and both halves have to
 * be here: filtering only the left one leaves the blocked party watching.
 *
 * The `profiles` join is dual-keyed for the reason `DrizzleAuthorDirectory`
 * documents — `profiles.user_id` is declared `uuid` in `schema.ts` and is
 * `text` in the LIVE database (verified against it, not against the schema
 * file), holding the raw subject for most rows and the derived uuid for the
 * rest. Matching only one representation would silently un-block the minority.
 */
export class DrizzleBlockDirectory implements BlockDirectory {
  async findBlockedParties(userId: string): Promise<BlockedPartyRow[]> {
    const me = toDatabaseUserId((userId || "").trim());
    if (!me) return [];

    const result = await db.execute(sql`
      with parties as (
        select ub.blocked_user_id as database_id
          from public.user_blocks ub
         where ub.blocker_user_id = ${me}::uuid
        union
        select ub.blocker_user_id as database_id
          from public.user_blocks ub
         where ub.blocked_user_id = ${me}::uuid
      )
      select
        parties.database_id::text as database_id,
        max(p.user_id::text)      as subject
      from parties
      left join public.profiles p
        on p.user_id::text = parties.database_id::text
        or public.clerk_id_to_uuid(p.user_id::text) = parties.database_id::text
      group by parties.database_id
    `);

    // TWO COLUMNS, both of them ids. A block list is not a place to select a
    // name, an email or anything else about a person the caller has chosen to
    // stop seeing — `ModerationService.listBlocks` renders the "Blocked"
    // screen, and this only decides what disappears from a chat.
    return extractRows<{ database_id: string; subject: string | null }>(
      result,
    ).map((row) => ({
      databaseId: row.database_id,
      subject: row.subject ?? null,
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
const COMMUNITY_ASSET_BUCKET = "community-assets";
const COMMUNITY_DOWNLOAD_TTL_SECONDS = 300;
export const COMMUNITY_STORAGE_CLIENT = Symbol("COMMUNITY_STORAGE_CLIENT");

export type ListMessagesOptions = {
  /** Page boundary: return messages strictly older than this instant. */
  before?: Date;
  /** The boundary row's id, breaking ties on an identical `before`. */
  beforeId?: string;
  limit?: number;
};

export type CommunityResourceKind = "image" | "file";

export type CommunityGroupResource = {
  id: string;
  groupId: string;
  kind: CommunityResourceKind;
  attachment: CommunityAttachmentDto;
  sender: MessageAuthor & { userId: string };
  createdAt: Date;
};

export type CommunityResourceCursor = {
  before: string;
  beforeId: string;
};

export type CommunityResourcesPage = {
  resources: CommunityGroupResource[];
  nextCursor: CommunityResourceCursor | null;
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
  private readonly blocks: BlockDirectory;
  private readonly storageOverride?: SupabaseClient;
  private cachedStorage?: SupabaseClient;
  private readonly notificationsService?: NotificationsService;

  constructor(
    @Optional() @Inject(MESSAGES_STORE) store?: MessagesStore,
    @Optional() @Inject(AUTHOR_DIRECTORY) authors?: AuthorDirectory,
    @Optional() @Inject(BLOCK_DIRECTORY) blocks?: BlockDirectory,
    @Optional()
    @Inject(COMMUNITY_STORAGE_CLIENT)
    storageOverride?: SupabaseClient,
    @Optional() notificationsService?: NotificationsService,
  ) {
    this.store = store ?? new DrizzleMessagesStore();
    this.authors = authors ?? new DrizzleAuthorDirectory();
    // Falls back to the real adapter rather than to an empty list, for the same
    // reason ModerationService falls back to a real notifier: a silent no-op
    // here would ship a Block button that records a block and hides nothing.
    this.blocks = blocks ?? new DrizzleBlockDirectory();
    this.storageOverride = storageOverride;
    this.notificationsService = notificationsService;
  }

  private get storage(): SupabaseClient {
    if (this.storageOverride) return this.storageOverride;
    if (!this.cachedStorage) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        throw new BadRequestException(
          "Community attachments are not configured right now.",
        );
      }
      this.cachedStorage = createClient(url, key, {
        auth: { persistSession: false },
      });
    }
    return this.cachedStorage;
  }

  /**
   * Reserve a direct-to-storage upload after checking posting rights. The
   * object remains private; the returned resource URL points back to this API,
   * not to Supabase, and therefore cannot be opened without a fresh membership
   * check and a short-lived signed download URL.
   */
  async createAttachmentUpload(
    userId: string,
    groupId: string,
    input: CommunityAttachmentUploadDto,
  ): Promise<{
    uploadUrl: string;
    resourceUrl: string;
    storagePath: string;
  }> {
    const senderId = this.requireUserId(userId);
    const validation = CommunityAttachmentUploadSchema.safeParse(input);
    if (!validation.success) {
      throw new BadRequestException(
        "Choose a JPEG, PNG, or WebP image up to 5 MB, or a PDF up to 10 MB.",
      );
    }

    const group = await this.requireGroup(groupId);
    if (group.archivedAt) {
      throw new BadRequestException(
        "This group has been archived, so new attachments can't be added.",
      );
    }
    const membership = await this.store.findMembership(groupId, senderId);
    if (!canPostInGroup(group, membership)) {
      throw new ForbiddenException(
        "You need to join this group before you can add an attachment.",
      );
    }

    const extension = this.attachmentExtension(validation.data.mime);
    const storagePath = `groups/${groupId}/${toDatabaseUserId(senderId)}/${randomUUID()}.${extension}`;
    const { data, error } = await this.storage.storage
      .from(COMMUNITY_ASSET_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error || !data?.signedUrl) {
      throw new BadRequestException(
        "The upload could not be started. Please try again.",
      );
    }

    return {
      uploadUrl: data.signedUrl,
      resourceUrl: this.buildAttachmentResourceUrl(groupId, storagePath),
      storagePath,
    };
  }

  /** Exchange an authorized resource URL for a five-minute storage URL. */
  async getAttachmentDownloadUrl(
    userId: string,
    groupId: string,
    storagePath: string,
    signature: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const readerId = this.requireUserId(userId);
    const group = await this.requireGroup(groupId);
    const membership = await this.store.findMembership(groupId, readerId);
    if (!canReadGroup(group, membership)) {
      throw new ForbiddenException("You're not a member of this group.");
    }
    this.assertAttachmentSignature(groupId, storagePath, signature);

    const { data, error } = await this.storage.storage
      .from(COMMUNITY_ASSET_BUCKET)
      .createSignedUrl(storagePath, COMMUNITY_DOWNLOAD_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      throw new NotFoundException("That attachment is no longer available.");
    }
    return { url: data.signedUrl, expiresIn: COMMUNITY_DOWNLOAD_TTL_SECONDS };
  }

  /** Validate the stable value persisted on a group before it is written. */
  assertGroupImageResourceUrl(groupId: string, rawUrl: string): void {
    this.assertAttachmentResourceUrl(groupId, rawUrl);
    const storagePath = new URL(rawUrl).searchParams.get("path") ?? "";
    if (!/\.(?:jpg|png|webp)$/i.test(storagePath)) {
      throw new BadRequestException(
        "Choose a JPEG, PNG, or WebP image for the group photo.",
      );
    }
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
   *
   * BLOCKS ARE ENFORCED HERE, and the shape is over-fetch-and-trim rather than
   * filter-and-return-short. Callers — the mobile chat screen and the web one,
   * both being written against this contract right now — page by asking for N
   * and stopping when they get fewer than N back. A page that came back short
   * because a block removed rows would read to them as "end of history", so a
   * member who blocked one chatty person would see the group's past simply
   * stop. Reading extra rows and trimming to N keeps that signal honest.
   *
   * The cursor is UNAFFECTED by the filtering: the next page is always asked
   * for relative to the last row actually RETURNED, so rows trimmed off the end
   * are strictly older than it and come back on the following page. Nothing is
   * skipped and nothing repeats, including when the block sits across a page
   * boundary.
   *
   * Blanking a blocked message's body instead was rejected outright: an empty
   * bubble still tells the caller that the person they blocked is here, still
   * here, and talking this often.
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

    const limit = this.resolveLimit(options.limit);
    // EXACTLY ONE block lookup per call, reused across every refill round and
    // every message on the page. One per message is fifty round trips on the
    // screen users open most; one per round would grow with the block list.
    const hidden = await this.loadHiddenAuthors(readerId);

    let cursor: MessageCursor | null = options.before
      ? { createdAt: options.before, id: options.beforeId }
      : null;
    // With nothing hidden there is nothing to trim, so the store is asked for
    // exactly the page — the pre-block query, unchanged, for the overwhelming
    // majority of callers who have never blocked anybody.
    const fetchSize =
      hidden.size === 0
        ? limit
        : Math.min(limit * OVERFETCH_FACTOR, FETCH_CEILING);

    const visible: CommunityGroupMessage[] = [];
    for (let round = 0; round < MAX_FETCH_ROUNDS; round += 1) {
      const batch = await this.store.listMessages(groupId, cursor, fetchSize);
      if (batch.length === 0) break;
      for (const message of batch) {
        if (!this.isHidden(message, hidden)) visible.push(message);
      }
      // The raw batch's last row, not the last VISIBLE one: the next round has
      // to resume where the read stopped, or the rows a block removed at the
      // tail would be read a second time.
      const last = batch[batch.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
      // Short batch means the group is exhausted; a full page means we are done.
      if (batch.length < fetchSize || visible.length >= limit) break;
    }

    return this.withAuthors(visible.slice(0, limit));
  }

  /**
   * Lists persisted image/PDF messages as durable group resources.
   *
   * The storage object itself remains private. `attachment.url` is the same
   * signed Edutu resource URL accepted at send-time; opening it still goes
   * through `getAttachmentDownloadUrl`, which repeats `canReadGroup` and emits
   * only a five-minute storage URL.
   */
  async listResources(
    userId: string,
    groupId: string,
    options: ListMessagesOptions = {},
  ): Promise<CommunityResourcesPage> {
    const readerId = this.requireUserId(userId);
    const group = await this.requireGroup(groupId);
    const membership = await this.store.findMembership(groupId, readerId);
    if (!canReadGroup(group, membership)) {
      throw new ForbiddenException("You're not a member of this group.");
    }

    const limit = this.resolveLimit(options.limit);
    const target = limit + 1;
    const hidden = await this.loadHiddenAuthors(readerId);
    const fetchSize = Math.min(
      hidden.size === 0 ? target : target * OVERFETCH_FACTOR,
      FETCH_CEILING,
    );
    let cursor: MessageCursor | null = options.before
      ? { createdAt: options.before, id: options.beforeId }
      : null;
    let exhausted = false;
    const candidates: Array<{
      message: CommunityGroupMessage;
      attachment: CommunityAttachmentDto;
    }> = [];

    for (let round = 0; round < MAX_FETCH_ROUNDS; round += 1) {
      const batch = await this.listResourceRows(groupId, cursor, fetchSize);
      if (batch.length === 0) {
        exhausted = true;
        break;
      }
      for (const message of batch) {
        if (message.deletedAt || this.isHidden(message, hidden)) continue;
        const attachment = this.parseStoredAttachment(groupId, message);
        if (attachment) candidates.push({ message, attachment });
      }
      const last = batch[batch.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
      exhausted = batch.length < fetchSize;
      if (exhausted || candidates.length >= target) break;
    }

    const selected = candidates.slice(0, limit);
    const withAuthors = await this.withAuthors(
      selected.map(({ message }) => message),
    );
    const resources = selected.map(({ attachment }, index) => {
      const message = withAuthors[index];
      return {
        id: message.id,
        groupId: message.groupId,
        kind: message.kind as CommunityResourceKind,
        attachment,
        sender: { userId: message.userId, ...message.author },
        createdAt: message.createdAt,
      };
    });

    const hasMore = candidates.length > limit || !exhausted;
    const boundary = selected[selected.length - 1]?.message ??
      (hasMore ? cursor && { createdAt: cursor.createdAt, id: cursor.id ?? "" } : null);
    return {
      resources,
      nextCursor:
        hasMore && boundary?.id
          ? {
              before: boundary.createdAt.toISOString(),
              beforeId: boundary.id,
            }
          : null,
    };
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

    // Do not rely on the controller pipe as the only validation boundary.
    // Tests, jobs and future transports can call this service directly, and an
    // invalid attachment must never become a persisted resource simply because
    // it bypassed HTTP.
    const validation = SendMessageSchema.safeParse(dto);
    if (!validation.success) {
      if (typeof dto.body === "string" && dto.body.trim().length === 0) {
        throw new BadRequestException("Type a message before sending it.");
      }
      if (dto.kind === "image" || dto.kind === "file") {
        throw new BadRequestException(
          "That attachment can't be sent. Choose a JPEG, PNG, or WebP image up to 5 MB, or a PDF up to 10 MB.",
        );
      }
      throw new BadRequestException(
        "That message can't be sent. Check its length and try again.",
      );
    }
    const message = validation.data;
    const kind = message.kind ?? "text";

    // The screener grades the raw text a member typed, not metadata, so its
    // machine token ("scam_pattern") never reaches them — only a sentence
    // explaining what reads as unsafe, without accusing them of anything.
    // An empty body is a different failure and gets a different sentence: an
    // internal caller posting blank text has not tried to scam anybody.
    let screenableBody = message.body;
    if (kind === "image" || kind === "file") {
      const attachment = JSON.parse(message.body) as CommunityAttachmentDto;
      this.assertAttachmentResourceUrl(groupId, attachment.url);
      screenableBody = attachment.caption ?? "attachment";
    }
    const verdict = screenMessage(screenableBody);
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
        body: message.body,
        kind,
        opportunityId: message.opportunityId ?? null,
      },
      // The counters are this service's decision, not the adapter's: one more
      // message, and this row becomes the group's most recent activity.
      { messageCountDelta: 1, touchLastMessageAt: true },
    );
    // The SAME shape `list` returns. The client appends this response straight
    // into the page it is already rendering; a message with no `author` would
    // show the sender's own bubble under the fallback name until they refreshed.
    const [withAuthor] = await this.withAuthors([stored]);

    // Group activity has two delivery paths: the Realtime inbox updates open
    // group lists immediately, while this fan-out covers members who are
    // offline or currently elsewhere in the app. System posts are created by
    // separate flows and do not enter this member-authored send path.
    if (
      this.notificationsService &&
      this.store.listActiveMemberUserIds
    ) {
      void this.notifyGroupMembers(group, senderId, withAuthor).catch(
        () => undefined,
      );
    }
    return withAuthor;
  }

  private async notifyGroupMembers(
    group: CommunityGroup,
    senderId: string,
    message: CommunityMessageWithAuthor,
  ): Promise<void> {
    const memberIds = await this.store.listActiveMemberUserIds?.(group.id);
    const targetUserIds = (memberIds ?? []).filter(
      (memberId) => memberId !== senderId,
    );
    if (!targetUserIds.length) return;

    const body =
      message.kind === "image" || message.kind === "file"
        ? `${message.author.displayName} shared an attachment in ${group.name}.`
        : `${message.author.displayName}: ${message.body.trim().slice(0, 240)}`;
    await this.notificationsService?.broadcast(senderId, {
      title: group.name,
      body,
      kind: "community-message",
      audience: "specific",
      targetUserIds,
      channels: { inApp: true, push: true, email: false },
      dedupeKey: `community-group-message:${message.id}`,
      metadata: {
        url: `/discussions/${group.id}`,
        groupId: group.id,
        messageId: message.id,
        source: "community-group-message",
      },
    });
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

  private attachmentExtension(mime: string): "jpg" | "png" | "webp" | "pdf" {
    switch (mime) {
      case "image/jpeg":
        return "jpg";
      case "image/png":
        return "png";
      case "image/webp":
        return "webp";
      case "application/pdf":
        return "pdf";
      default:
        throw new BadRequestException("That attachment type is not supported.");
    }
  }

  private attachmentApiBaseUrl(): URL {
    const raw =
      process.env.API_PUBLIC_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      "https://edutu-platform.onrender.com";
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:") throw new Error("HTTPS required");
      return url;
    } catch {
      throw new BadRequestException(
        "Community attachments require a configured HTTPS API URL.",
      );
    }
  }

  private attachmentSigningSecret(): string {
    const secret =
      process.env.COMMUNITY_ATTACHMENT_SIGNING_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) {
      throw new BadRequestException(
        "Community attachments are not configured right now.",
      );
    }
    return secret;
  }

  private signAttachment(groupId: string, storagePath: string): string {
    return createHmac("sha256", this.attachmentSigningSecret())
      .update(`${groupId}:${storagePath}`)
      .digest("base64url");
  }

  private buildAttachmentResourceUrl(
    groupId: string,
    storagePath: string,
  ): string {
    const url = new URL(
      `/communities/groups/${encodeURIComponent(groupId)}/attachments/download-url`,
      this.attachmentApiBaseUrl(),
    );
    url.searchParams.set("path", storagePath);
    url.searchParams.set("signature", this.signAttachment(groupId, storagePath));
    return url.toString();
  }

  private assertAttachmentSignature(
    groupId: string,
    storagePath: string,
    signature: string,
  ): void {
    const expectedPrefix = `groups/${groupId}/`;
    if (
      !storagePath.startsWith(expectedPrefix) ||
      storagePath.includes("..") ||
      !/^groups\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp|pdf)$/i.test(
        storagePath,
      )
    ) {
      throw new BadRequestException("That attachment link is invalid.");
    }

    const expected = Buffer.from(this.signAttachment(groupId, storagePath));
    const actual = Buffer.from(signature || "");
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new BadRequestException("That attachment link is invalid.");
    }
  }

  private assertAttachmentResourceUrl(groupId: string, rawUrl: string): void {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException("That attachment link is invalid.");
    }
    const base = this.attachmentApiBaseUrl();
    const expectedPath = `/communities/groups/${encodeURIComponent(groupId)}/attachments/download-url`;
    if (url.origin !== base.origin || url.pathname !== expectedPath) {
      throw new BadRequestException(
        "That attachment can't be sent because it is not stored securely by Edutu.",
      );
    }
    this.assertAttachmentSignature(
      groupId,
      url.searchParams.get("path") ?? "",
      url.searchParams.get("signature") ?? "",
    );
  }

  private async listResourceRows(
    groupId: string,
    before: MessageCursor | null,
    limit: number,
  ): Promise<CommunityGroupMessage[]> {
    if (this.store.listResourceMessages) {
      return this.store.listResourceMessages(groupId, before, limit);
    }
    // Compatibility path for older injected stores. Production uses the
    // attachment-filtered query above; this remains bounded by FETCH_CEILING.
    const rows = await this.store.listMessages(groupId, before, limit);
    return rows.filter(
      (message) =>
        (message.kind === "image" || message.kind === "file") &&
        !message.deletedAt,
    );
  }

  /**
   * Historical rows are untrusted even though new sends pass the DTO schema.
   * Skip an invalid row rather than returning an arbitrary URL or failing the
   * entire Resources screen because one old message predates validation.
   */
  private parseStoredAttachment(
    groupId: string,
    message: CommunityGroupMessage,
  ): CommunityAttachmentDto | null {
    let decoded: unknown;
    try {
      decoded = JSON.parse(message.body);
    } catch {
      return null;
    }
    const parsed =
      message.kind === "image"
        ? CommunityImageAttachmentSchema.safeParse(decoded)
        : message.kind === "file"
          ? CommunityFileAttachmentSchema.safeParse(decoded)
          : null;
    if (!parsed?.success) return null;
    try {
      this.assertAttachmentResourceUrl(groupId, parsed.data.url);
    } catch {
      return null;
    }
    return parsed.data;
  }

  /**
   * The set of author ids whose messages this reader must not see.
   *
   * DECIDED HERE, not in the directory. The directory hands back raw column
   * values; this turns them into a set, and every judgement in between is the
   * service's: dropping the rows whose subject could not be recovered from the
   * uuid, keeping the stored uuid as a second key for the rows whose community
   * id happens to be the derived one, trimming, and refusing to hide the reader
   * from themselves. A double that returned a ready-made set would be testing
   * its own reimplementation of all four.
   *
   * The self-guard is belt and braces — `ModerationService.block` already
   * refuses a self-block — but a stray legacy row would otherwise blank the
   * caller's entire side of every conversation, which reads as total data loss.
   */
  private async loadHiddenAuthors(readerId: string): Promise<Set<string>> {
    const parties = await this.blocks.findBlockedParties(readerId);
    const hidden = new Set<string>();
    for (const party of parties ?? []) {
      // Both keys. `community_group_messages.user_id` holds the raw subject,
      // which is what `subject` recovers; `databaseId` covers the rows whose
      // community id was written as the derived uuid instead.
      for (const key of [party?.subject, party?.databaseId]) {
        const trimmed = (key || "").trim();
        if (trimmed && trimmed !== readerId) hidden.add(trimmed);
      }
    }
    return hidden;
  }

  /** A message is hidden when its author is on either side of a block. */
  private isHidden(
    message: CommunityGroupMessage,
    hidden: Set<string>,
  ): boolean {
    if (hidden.size === 0) return false;
    return hidden.has((message.userId || "").trim());
  }

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
