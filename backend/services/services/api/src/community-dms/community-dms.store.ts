import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  communityDmBlocks,
  communityDmConversations,
  communityDmMessages,
  communityDmParticipants,
  type CommunityDmConversation,
  type CommunityDmMessage,
} from "../db/schema";
import type {
  CreateDmRequestResult,
  DmConversationSummary,
  DmProfile,
  DmRequestDirection,
  DmRequestSummary,
} from "./community-dms.types";

export type DmCursor = { createdAt: Date; id?: string };

export interface CommunityDmsStore {
  findConversation(id: string): Promise<CommunityDmConversation | null>;
  findConversationBetween(
    firstUserId: string,
    secondUserId: string,
  ): Promise<CommunityDmConversation | null>;
  hasParticipant(conversationId: string, userId: string): Promise<boolean>;
  isBlocked(firstUserId: string, secondUserId: string): Promise<boolean>;
  findProfiles(userIds: string[]): Promise<DmProfile[]>;
  createRequest(
    senderId: string,
    recipientId: string,
    body: string,
  ): Promise<CreateDmRequestResult>;
  updateStatus(
    conversationId: string,
    status: "accepted" | "declined",
  ): Promise<CommunityDmConversation | null>;
  listConversations(
    userId: string,
    cursor: DmCursor | null,
    limit: number,
  ): Promise<DmConversationSummary[]>;
  listRequests(
    userId: string,
    direction: DmRequestDirection,
    cursor: DmCursor | null,
    limit: number,
  ): Promise<DmRequestSummary[]>;
  listMessages(
    conversationId: string,
    cursor: DmCursor | null,
    limit: number,
  ): Promise<CommunityDmMessage[]>;
  insertMessage(
    conversationId: string,
    senderId: string,
    body: string,
  ): Promise<CommunityDmMessage>;
  markRead(conversationId: string, userId: string): Promise<void>;
  hideConversation(conversationId: string, userId: string): Promise<void>;
  blockUser(blockerId: string, blockedUserId: string): Promise<void>;
  unblockUser(blockerId: string, blockedUserId: string): Promise<void>;
  listBlocks(userId: string, limit: number): Promise<DmProfile[]>;
}

export const COMMUNITY_DMS_STORE = Symbol("COMMUNITY_DMS_STORE");

export class DrizzleCommunityDmsStore implements CommunityDmsStore {
  async findConversation(id: string): Promise<CommunityDmConversation | null> {
    const [row] = await db
      .select()
      .from(communityDmConversations)
      .where(eq(communityDmConversations.id, id))
      .limit(1);
    return row ?? null;
  }

  async findConversationBetween(
    firstUserId: string,
    secondUserId: string,
  ): Promise<CommunityDmConversation | null> {
    const [participantA, participantB] = orderedPair(
      firstUserId,
      secondUserId,
    );
    const [row] = await db
      .select()
      .from(communityDmConversations)
      .where(
        and(
          eq(communityDmConversations.participantA, participantA),
          eq(communityDmConversations.participantB, participantB),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async hasParticipant(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    const [row] = await db
      .select({ conversationId: communityDmParticipants.conversationId })
      .from(communityDmParticipants)
      .where(
        and(
          eq(communityDmParticipants.conversationId, conversationId),
          eq(communityDmParticipants.userId, userId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async isBlocked(firstUserId: string, secondUserId: string): Promise<boolean> {
    const [row] = await db
      .select({ blockerId: communityDmBlocks.blockerId })
      .from(communityDmBlocks)
      .where(
        or(
          and(
            eq(communityDmBlocks.blockerId, firstUserId),
            eq(communityDmBlocks.blockedUserId, secondUserId),
          ),
          and(
            eq(communityDmBlocks.blockerId, secondUserId),
            eq(communityDmBlocks.blockedUserId, firstUserId),
          ),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async findProfiles(userIds: string[]): Promise<DmProfile[]> {
    const ids = uniqueIds(userIds);
    if (ids.length === 0) return [];
    const result = await db.execute(sql`
      select
        wanted.user_id as user_id,
        max(profile.full_name) as full_name,
        max(profile.avatar_url) as avatar_url,
        bool_or(profile.user_id is not null)
          or exists (
            select 1 from public.community_group_members member
            where member.user_id = wanted.user_id
          ) as known_user
      from unnest(array[${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}]::text[]) as wanted(user_id)
      left join public.profiles profile
        on profile.user_id::text = wanted.user_id
        or public.clerk_id_to_uuid(profile.user_id::text)
          = public.clerk_id_to_uuid(wanted.user_id)
      group by wanted.user_id
    `);
    return extractRows<{
      user_id: string;
      full_name: string | null;
      avatar_url: string | null;
      known_user: boolean;
    }>(result)
      .filter((row) => row.known_user)
      .map(profileFromRow);
  }

  async createRequest(
    senderId: string,
    recipientId: string,
    body: string,
  ): Promise<CreateDmRequestResult> {
    const [participantA, participantB] = orderedPair(senderId, recipientId);
    return db.transaction(async (tx) => {
      const [conversation] = await tx
        .insert(communityDmConversations)
        .values({
          participantA,
          participantB,
          requestedBy: senderId,
          status: "pending",
        })
        .returning();
      await tx.insert(communityDmParticipants).values([
        { conversationId: conversation.id, userId: senderId },
        { conversationId: conversation.id, userId: recipientId },
      ]);
      const [message] = await tx
        .insert(communityDmMessages)
        .values({ conversationId: conversation.id, senderId, body })
        .returning();
      await tx
        .update(communityDmConversations)
        .set({ lastMessageAt: message.createdAt })
        .where(eq(communityDmConversations.id, conversation.id));
      return {
        conversation: { ...conversation, lastMessageAt: message.createdAt },
        message,
      };
    });
  }

  async updateStatus(
    conversationId: string,
    status: "accepted" | "declined",
  ): Promise<CommunityDmConversation | null> {
    const now = new Date();
    const [row] = await db
      .update(communityDmConversations)
      .set(
        status === "accepted"
          ? { status, acceptedAt: now, declinedAt: null }
          : { status, declinedAt: now },
      )
      .where(eq(communityDmConversations.id, conversationId))
      .returning();
    return row ?? null;
  }

  async listConversations(
    userId: string,
    cursor: DmCursor | null,
    limit: number,
  ): Promise<DmConversationSummary[]> {
    const cursorClause = cursor
      ? cursor.id
        ? sql`and (conversation.last_message_at, conversation.id) < (${cursor.createdAt}, ${cursor.id}::uuid)`
        : sql`and conversation.last_message_at < ${cursor.createdAt}`
      : sql``;
    const result = await db.execute(sql`
      select
        conversation.id,
        conversation.status,
        conversation.requested_by,
        conversation.created_at,
        conversation.accepted_at,
        conversation.last_message_at,
        other_user.user_id as other_user_id,
        max(profile.full_name) as other_full_name,
        max(profile.avatar_url) as other_avatar_url,
        last_message.body as last_body,
        last_message.sender_id as last_sender_id,
        last_message.created_at as last_created_at,
        count(distinct unread.id)::int as unread_count,
        exists (
          select 1 from public.community_dm_blocks block
          where (block.blocker_id = ${userId} and block.blocked_user_id = other_user.user_id)
             or (block.blocker_id = other_user.user_id and block.blocked_user_id = ${userId})
        ) as blocked
      from public.community_dm_conversations conversation
      join public.community_dm_participants mine
        on mine.conversation_id = conversation.id and mine.user_id = ${userId}
      cross join lateral (
        select case
          when conversation.participant_a = ${userId} then conversation.participant_b
          else conversation.participant_a
        end as user_id
      ) other_user
      join lateral (
        select message.body, message.sender_id, message.created_at
        from public.community_dm_messages message
        where message.conversation_id = conversation.id
        order by message.created_at desc, message.id desc
        limit 1
      ) last_message on true
      left join public.profiles profile
        on profile.user_id::text = other_user.user_id
        or public.clerk_id_to_uuid(profile.user_id::text)
          = public.clerk_id_to_uuid(other_user.user_id)
      left join public.community_dm_messages unread
        on unread.conversation_id = conversation.id
        and unread.sender_id <> ${userId}
        and (mine.last_read_at is null or unread.created_at > mine.last_read_at)
      where conversation.status = 'accepted'
        and mine.hidden_at is null
        ${cursorClause}
      group by conversation.id, other_user.user_id,
        last_message.body, last_message.sender_id, last_message.created_at
      order by conversation.last_message_at desc, conversation.id desc
      limit ${limit}
    `);
    return extractRows<ConversationSummaryRow>(result).map((row) => ({
      id: row.id,
      status: "accepted",
      requestedBy: row.requested_by,
      createdAt: asDate(row.created_at),
      acceptedAt: nullableDate(row.accepted_at),
      lastMessageAt: asDate(row.last_message_at),
      otherUser: profileFromRow({
        user_id: row.other_user_id,
        full_name: row.other_full_name,
        avatar_url: row.other_avatar_url,
      }),
      blocked: row.blocked,
      lastMessage: {
        body: row.last_body,
        senderId: row.last_sender_id,
        createdAt: asDate(row.last_created_at),
      },
      unreadCount: Number(row.unread_count) || 0,
    }));
  }

  async listRequests(
    userId: string,
    direction: DmRequestDirection,
    cursor: DmCursor | null,
    limit: number,
  ): Promise<DmRequestSummary[]> {
    const directionClause =
      direction === "incoming"
        ? sql`conversation.requested_by <> ${userId}`
        : sql`conversation.requested_by = ${userId}`;
    const cursorClause = cursor
      ? cursor.id
        ? sql`and (conversation.created_at, conversation.id) < (${cursor.createdAt}, ${cursor.id}::uuid)`
        : sql`and conversation.created_at < ${cursor.createdAt}`
      : sql``;
    const result = await db.execute(sql`
      select
        conversation.id,
        conversation.requested_by,
        conversation.created_at,
        other_user.user_id as other_user_id,
        max(profile.full_name) as other_full_name,
        max(profile.avatar_url) as other_avatar_url,
        first_message.body as first_body,
        first_message.sender_id as first_sender_id,
        first_message.created_at as first_created_at
      from public.community_dm_conversations conversation
      join public.community_dm_participants mine
        on mine.conversation_id = conversation.id and mine.user_id = ${userId}
      cross join lateral (
        select case
          when conversation.participant_a = ${userId} then conversation.participant_b
          else conversation.participant_a
        end as user_id
      ) other_user
      join lateral (
        select message.body, message.sender_id, message.created_at
        from public.community_dm_messages message
        where message.conversation_id = conversation.id
        order by message.created_at asc, message.id asc
        limit 1
      ) first_message on true
      left join public.profiles profile
        on profile.user_id::text = other_user.user_id
        or public.clerk_id_to_uuid(profile.user_id::text)
          = public.clerk_id_to_uuid(other_user.user_id)
      where conversation.status = 'pending'
        and ${directionClause}
        and not exists (
          select 1 from public.community_dm_blocks block
          where (block.blocker_id = ${userId} and block.blocked_user_id = other_user.user_id)
             or (block.blocker_id = other_user.user_id and block.blocked_user_id = ${userId})
        )
        ${cursorClause}
      group by conversation.id, other_user.user_id,
        first_message.body, first_message.sender_id, first_message.created_at
      order by conversation.created_at desc, conversation.id desc
      limit ${limit}
    `);
    return extractRows<RequestSummaryRow>(result).map((row) => ({
      id: row.id,
      direction,
      requestedBy: row.requested_by,
      createdAt: asDate(row.created_at),
      otherUser: profileFromRow({
        user_id: row.other_user_id,
        full_name: row.other_full_name,
        avatar_url: row.other_avatar_url,
      }),
      firstMessage: {
        body: row.first_body,
        senderId: row.first_sender_id,
        createdAt: asDate(row.first_created_at),
      },
    }));
  }

  async listMessages(
    conversationId: string,
    cursor: DmCursor | null,
    limit: number,
  ): Promise<CommunityDmMessage[]> {
    const conditions = [
      eq(communityDmMessages.conversationId, conversationId),
    ];
    if (cursor) {
      conditions.push(
        cursor.id
          ? (or(
              lt(communityDmMessages.createdAt, cursor.createdAt),
              and(
                eq(communityDmMessages.createdAt, cursor.createdAt),
                lt(communityDmMessages.id, cursor.id),
              ),
            ) ?? sql`true`)
          : lt(communityDmMessages.createdAt, cursor.createdAt),
      );
    }
    return db
      .select()
      .from(communityDmMessages)
      .where(and(...conditions))
      .orderBy(
        desc(communityDmMessages.createdAt),
        desc(communityDmMessages.id),
      )
      .limit(limit);
  }

  async insertMessage(
    conversationId: string,
    senderId: string,
    body: string,
  ): Promise<CommunityDmMessage> {
    return db.transaction(async (tx) => {
      const [message] = await tx
        .insert(communityDmMessages)
        .values({ conversationId, senderId, body })
        .returning();
      await tx
        .update(communityDmConversations)
        .set({ lastMessageAt: message.createdAt })
        .where(eq(communityDmConversations.id, conversationId));
      await tx
        .update(communityDmParticipants)
        .set({ hiddenAt: null })
        .where(eq(communityDmParticipants.conversationId, conversationId));
      return message;
    });
  }

  async markRead(conversationId: string, userId: string): Promise<void> {
    await db
      .update(communityDmParticipants)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(communityDmParticipants.conversationId, conversationId),
          eq(communityDmParticipants.userId, userId),
        ),
      );
  }

  async hideConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    await db
      .update(communityDmParticipants)
      .set({ hiddenAt: new Date() })
      .where(
        and(
          eq(communityDmParticipants.conversationId, conversationId),
          eq(communityDmParticipants.userId, userId),
        ),
      );
  }

  async blockUser(blockerId: string, blockedUserId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .insert(communityDmBlocks)
        .values({ blockerId, blockedUserId })
        .onConflictDoNothing();
      const conversation = await tx.query.communityDmConversations.findFirst({
        where: and(
          eq(
            communityDmConversations.participantA,
            orderedPair(blockerId, blockedUserId)[0],
          ),
          eq(
            communityDmConversations.participantB,
            orderedPair(blockerId, blockedUserId)[1],
          ),
        ),
      });
      if (conversation) {
        await tx
          .update(communityDmParticipants)
          .set({ hiddenAt: new Date() })
          .where(
            and(
              eq(communityDmParticipants.conversationId, conversation.id),
              eq(communityDmParticipants.userId, blockerId),
            ),
          );
      }
    });
  }

  async unblockUser(blockerId: string, blockedUserId: string): Promise<void> {
    await db
      .delete(communityDmBlocks)
      .where(
        and(
          eq(communityDmBlocks.blockerId, blockerId),
          eq(communityDmBlocks.blockedUserId, blockedUserId),
        ),
      );
  }

  async listBlocks(userId: string, limit: number): Promise<DmProfile[]> {
    const result = await db.execute(sql`
      select
        block.blocked_user_id as user_id,
        max(profile.full_name) as full_name,
        max(profile.avatar_url) as avatar_url
      from public.community_dm_blocks block
      left join public.profiles profile
        on profile.user_id::text = block.blocked_user_id
        or public.clerk_id_to_uuid(profile.user_id::text)
          = public.clerk_id_to_uuid(block.blocked_user_id)
      where block.blocker_id = ${userId}
      group by block.blocked_user_id, block.created_at
      order by block.created_at desc
      limit ${limit}
    `);
    return extractRows<ProfileRow>(result).map(profileFromRow);
  }
}

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type ConversationSummaryRow = {
  id: string;
  requested_by: string;
  created_at: Date | string;
  accepted_at: Date | string | null;
  last_message_at: Date | string;
  other_user_id: string;
  other_full_name: string | null;
  other_avatar_url: string | null;
  last_body: string;
  last_sender_id: string;
  last_created_at: Date | string;
  unread_count: number | string;
  blocked: boolean;
};

type RequestSummaryRow = {
  id: string;
  requested_by: string;
  created_at: Date | string;
  other_user_id: string;
  other_full_name: string | null;
  other_avatar_url: string | null;
  first_body: string;
  first_sender_id: string;
  first_created_at: Date | string;
};

function orderedPair(first: string, second: string): [string, string] {
  return first < second ? [first, second] : [second, first];
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function profileFromRow(row: ProfileRow): DmProfile {
  const displayName = (row.full_name || "").trim() || "Edutu member";
  const avatarUrl = (row.avatar_url || "").trim();
  return {
    userId: row.user_id,
    displayName,
    avatarUrl: avatarUrl || null,
  };
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function nullableDate(value: Date | string | null): Date | null {
  return value ? asDate(value) : null;
}

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows?: T[] }).rows ?? [];
  }
  return [];
}
