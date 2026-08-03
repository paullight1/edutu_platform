import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  communityGroupMembers,
  communityGroupMessages,
  communityGroups,
  type CommunityGroup,
  type CommunityGroupMember,
  type CommunityGroupMessage,
} from "../db/schema";
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
 * The persistence boundary, mirroring `GroupsStore` in groups.service.ts:
 * the service depends on this, not on Drizzle, so the spec can hand it a
 * plain in-memory double instead of mocking a query-builder chain call by
 * call.
 */
export interface MessagesStore {
  findGroup(groupId: string): Promise<CommunityGroup | null>;
  findMembership(
    groupId: string,
    userId: string,
  ): Promise<CommunityGroupMember | null>;
  listMessages(
    groupId: string,
    before: Date | null,
    limit: number,
  ): Promise<CommunityGroupMessage[]>;
  findMessage(messageId: string): Promise<CommunityGroupMessage | null>;
  insertMessage(row: NewMessageRow): Promise<CommunityGroupMessage>;
  softDeleteMessage(
    messageId: string,
    actorId: string,
  ): Promise<CommunityGroupMessage | null>;
}

/** Token so the module can swap the store without touching the service. */
export const MESSAGES_STORE = Symbol("MESSAGES_STORE");

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
    before: Date | null,
    limit: number,
  ): Promise<CommunityGroupMessage[]> {
    const conditions = [eq(communityGroupMessages.groupId, groupId)];
    if (before) conditions.push(lt(communityGroupMessages.createdAt, before));
    return db
      .select()
      .from(communityGroupMessages)
      .where(and(...conditions))
      .orderBy(desc(communityGroupMessages.createdAt))
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

  async insertMessage(row: NewMessageRow): Promise<CommunityGroupMessage> {
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
      await tx
        .update(communityGroups)
        .set({
          messageCount: sql`${communityGroups.messageCount} + 1`,
          lastMessageAt: message.createdAt,
        })
        .where(eq(communityGroups.id, row.groupId));
      return message;
    });
  }

  async softDeleteMessage(
    messageId: string,
    actorId: string,
  ): Promise<CommunityGroupMessage | null> {
    const [row] = await db
      .update(communityGroupMessages)
      .set({ body: "", deletedAt: new Date(), deletedBy: actorId })
      .where(eq(communityGroupMessages.id, messageId))
      .returning();
    return row ?? null;
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ListMessagesOptions = {
  before?: Date;
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

  constructor(@Optional() @Inject(MESSAGES_STORE) store?: MessagesStore) {
    this.store = store ?? new DrizzleMessagesStore();
  }

  /**
   * Mirrors `GroupsService.get`'s visibility rule: a private group is
   * members-only, a public one is readable by any signed-in user, joined or
   * not — read-before-join is intended. Archived groups stay readable; only
   * `send` treats archiving as a wall.
   */
  async list(
    userId: string,
    groupId: string,
    options: ListMessagesOptions = {},
  ): Promise<CommunityGroupMessage[]> {
    const group = await this.requireGroup(groupId);
    if (group.visibility === "private") {
      const membership = await this.store.findMembership(groupId, userId);
      const invitedOrIn =
        membership?.status === "active" || membership?.status === "pending";
      if (!invitedOrIn) {
        throw new ForbiddenException("You're not a member of this group.");
      }
    }
    return this.store.listMessages(
      groupId,
      options.before ?? null,
      options.limit ?? LIST_LIMIT,
    );
  }

  async send(
    userId: string,
    groupId: string,
    dto: SendMessageDto,
  ): Promise<CommunityGroupMessage> {
    const senderId = this.requireUserId(userId);
    const group = await this.requireGroup(groupId);
    if (group.archivedAt) {
      throw new BadRequestException(
        "This group has been archived, so new messages can't be sent here.",
      );
    }

    const membership = await this.store.findMembership(groupId, senderId);
    if (membership?.status !== "active") {
      throw new BadRequestException(
        "You need to join this group before you can post in it.",
      );
    }

    // The screener grades the raw text a member typed, not metadata, so its
    // machine token ("scam_pattern") never reaches them — only a sentence
    // explaining what reads as unsafe, without accusing them of anything.
    const verdict = screenMessage(dto.body);
    if (!verdict.allowed) {
      throw new BadRequestException(
        "That message can't be sent — it reads like it's asking for money, secrets, or to move the conversation off Edutu, which we block to keep members safe from scams.",
      );
    }

    return this.store.insertMessage({
      groupId,
      userId: senderId,
      body: dto.body,
      kind: "text",
      opportunityId: dto.opportunityId ?? null,
    });
  }

  async softDelete(
    actorId: string,
    messageId: string,
  ): Promise<CommunityGroupMessage> {
    const acting = this.requireUserId(actorId);
    const message = await this.store.findMessage(messageId);
    if (!message) throw new NotFoundException("That message was not found.");

    if (message.userId !== acting) {
      const membership = await this.store.findMembership(
        message.groupId,
        acting,
      );
      const canModerate =
        membership?.status === "active" &&
        (membership.role === "owner" || membership.role === "mod");
      if (!canModerate) {
        throw new ForbiddenException(
          "You're not allowed to delete this message.",
        );
      }
    }

    const updated = await this.store.softDeleteMessage(messageId, acting);
    if (!updated) throw new NotFoundException("That message was not found.");
    return updated;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async requireGroup(groupId: string): Promise<CommunityGroup> {
    this.assertUuid(groupId, "group");
    const group = await this.store.findGroup(groupId);
    if (!group) throw new NotFoundException("That group was not found.");
    return group;
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
