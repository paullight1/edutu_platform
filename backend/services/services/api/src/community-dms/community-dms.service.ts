import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { CommunityDmConversation } from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";
import {
  COMMUNITY_DMS_STORE,
  DrizzleCommunityDmsStore,
  type CommunityDmsStore,
  type DmCursor,
} from "./community-dms.store";
import type {
  CreateDmRequestDto,
  SendDmMessageDto,
} from "./dto/community-dm.dto";
import { DM_MESSAGE_MAX_LENGTH } from "./dto/community-dm.dto";
import type {
  DmConversationDetail,
  DmConversationSummary,
  DmMessageWithSender,
  DmProfile,
  DmRelationship,
  DmRequestDirection,
  DmRequestSummary,
} from "./community-dms.types";

const DEFAULT_PAGE_LIMIT = 25;
const MAX_PAGE_LIMIT = 50;
const MAX_BLOCK_LIST_LIMIT = 100;

@Injectable()
export class CommunityDmsService {
  private readonly store: CommunityDmsStore;
  private readonly notificationsService?: NotificationsService;

  constructor(
    @Optional() @Inject(COMMUNITY_DMS_STORE) store?: CommunityDmsStore,
    @Optional() notificationsService?: NotificationsService,
  ) {
    this.store = store ?? new DrizzleCommunityDmsStore();
    this.notificationsService = notificationsService;
  }

  async relationship(
    userId: string,
    otherUserId: string,
  ): Promise<DmRelationship | null> {
    const actor = this.requireUserId(userId);
    const target = this.requireOtherUserId(actor, otherUserId);
    const [conversation, blocked] = await Promise.all([
      this.store.findConversationBetween(actor, target),
      this.store.isBlocked(actor, target),
    ]);
    if (!conversation) {
      return blocked
        ? {
            conversationId: null,
            status: null,
            direction: null,
            blocked: true,
          }
        : null;
    }
    return {
      conversationId: conversation.id,
      status: this.status(conversation),
      direction:
        conversation.status === "pending"
          ? conversation.requestedBy === actor
            ? "outgoing"
            : "incoming"
          : null,
      blocked,
    };
  }

  async createRequest(userId: string, dto: CreateDmRequestDto) {
    const senderId = this.requireUserId(userId);
    const recipientId = this.requireOtherUserId(senderId, dto.recipientId);
    const body = this.messageBody(dto.body);

    const [blocked, profiles, existing] = await Promise.all([
      this.store.isBlocked(senderId, recipientId),
      this.store.findProfiles([recipientId]),
      this.store.findConversationBetween(senderId, recipientId),
    ]);
    if (blocked) throw this.blockedException();
    if (!profiles.some((profile) => profile.userId === recipientId)) {
      throw new NotFoundException("This community member is unavailable.");
    }
    this.refuseExistingRequest(senderId, existing);

    try {
      const result = await this.store.createRequest(
        senderId,
        recipientId,
        body,
      );
      void this.notificationsService
        ?.broadcast(senderId, {
          title: "New message request",
          body: "Someone in the Edutu community wants to connect with you.",
          kind: "community-request",
          severity: "info",
          audience: "specific",
          targetUserIds: [recipientId],
          channels: { inApp: true, push: true, email: false },
          dedupeKey: `community-request:${result.conversation.id}`,
          metadata: {
            url: `/discussions/dm/${result.conversation.id}`,
            conversationId: result.conversation.id,
            source: "community-dm-request",
          },
        })
        .catch(() => undefined);
      return result;
    } catch (error) {
      // A canonical pair unique constraint closes the simultaneous-request
      // race. Resolve the winner and return the same stable refusal a normal
      // second attempt receives instead of leaking a database error.
      const winner = await this.store.findConversationBetween(
        senderId,
        recipientId,
      );
      if (winner) this.refuseExistingRequest(senderId, winner);
      throw error;
    }
  }

  async listRequests(
    userId: string,
    direction: DmRequestDirection,
    cursor: DmCursor | null,
    limit?: number,
  ): Promise<DmRequestSummary[]> {
    return this.store.listRequests(
      this.requireUserId(userId),
      direction,
      cursor,
      this.resolveLimit(limit),
    );
  }

  async acceptRequest(
    userId: string,
    conversationId: string,
  ): Promise<DmConversationDetail> {
    const actor = this.requireUserId(userId);
    const conversation = await this.requireParticipant(actor, conversationId);
    if (conversation.status !== "pending") {
      throw new ConflictException("This message request is no longer pending.");
    }
    if (conversation.requestedBy === actor) {
      throw new ForbiddenException("Only the recipient can accept this request.");
    }
    const otherId = this.otherUserId(conversation, actor);
    if (await this.store.isBlocked(actor, otherId)) {
      throw this.blockedException();
    }
    const updated = await this.store.updateStatus(conversation.id, "accepted");
    if (!updated) throw new NotFoundException("Message request not found.");
    await this.store.markRead(updated.id, actor);
    void this.notificationsService
      ?.broadcast(actor, {
        title: "Message request accepted",
        body: "Your community connection request was accepted.",
        kind: "community-request",
        severity: "success",
        audience: "specific",
        targetUserIds: [conversation.requestedBy],
        channels: { inApp: true, push: true, email: false },
        dedupeKey: `community-request-accepted:${updated.id}`,
        metadata: {
          url: `/discussions/dm/${updated.id}`,
          conversationId: updated.id,
          source: "community-dm-accepted",
        },
      })
      .catch(() => undefined);
    return this.toDetail(updated, actor, false);
  }

  async declineRequest(
    userId: string,
    conversationId: string,
  ): Promise<{ success: true }> {
    const actor = this.requireUserId(userId);
    const conversation = await this.requireParticipant(actor, conversationId);
    if (conversation.status !== "pending") {
      throw new ConflictException("This message request is no longer pending.");
    }
    if (conversation.requestedBy === actor) {
      throw new ForbiddenException("Only the recipient can decline this request.");
    }
    await this.store.updateStatus(conversation.id, "declined");
    await this.store.hideConversation(conversation.id, actor);
    return { success: true };
  }

  async listConversations(
    userId: string,
    cursor: DmCursor | null,
    limit?: number,
  ): Promise<DmConversationSummary[]> {
    return this.store.listConversations(
      this.requireUserId(userId),
      cursor,
      this.resolveLimit(limit),
    );
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<DmConversationDetail> {
    const actor = this.requireUserId(userId);
    const conversation = await this.requireParticipant(actor, conversationId);
    const otherId = this.otherUserId(conversation, actor);
    const blocked = await this.store.isBlocked(actor, otherId);
    return this.toDetail(conversation, actor, blocked);
  }

  async listMessages(
    userId: string,
    conversationId: string,
    cursor: DmCursor | null,
    limit?: number,
  ): Promise<DmMessageWithSender[]> {
    const actor = this.requireUserId(userId);
    const conversation = await this.requireParticipant(actor, conversationId);
    if (conversation.status !== "accepted") {
      throw new ForbiddenException(
        "Accept the message request before opening this conversation.",
      );
    }
    const messages = await this.store.listMessages(
      conversation.id,
      cursor,
      this.resolveLimit(limit),
    );
    const profiles = await this.store.findProfiles(
      messages.map((message) => message.senderId),
    );
    const profileById = new Map(
      profiles.map((profile) => [profile.userId, profile]),
    );
    return messages.map((message) => ({
      ...message,
      sender:
        profileById.get(message.senderId) ?? this.fallbackProfile(message.senderId),
    }));
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendDmMessageDto,
  ): Promise<DmMessageWithSender> {
    const actor = this.requireUserId(userId);
    const conversation = await this.requireParticipant(actor, conversationId);
    if (conversation.status !== "accepted") {
      throw new ForbiddenException(
        "Wait for this message request to be accepted before sending again.",
      );
    }
    const otherId = this.otherUserId(conversation, actor);
    if (await this.store.isBlocked(actor, otherId)) {
      throw this.blockedException();
    }
    const message = await this.store.insertMessage(
      conversation.id,
      actor,
      this.messageBody(dto.body),
    );
    const [sender] = await this.store.findProfiles([actor]);
    void this.notificationsService
      ?.broadcast(actor, {
        title: sender?.displayName
          ? `${sender.displayName} sent you a message`
          : "New community message",
        body: message.body,
        kind: "community-message",
        severity: "info",
        audience: "specific",
        targetUserIds: [otherId],
        channels: { inApp: true, push: true, email: false },
        dedupeKey: `community-message:${message.id}`,
        metadata: {
          url: `/discussions/dm/${conversation.id}`,
          conversationId: conversation.id,
          source: "community-dm",
        },
      })
      .catch(() => undefined);
    return {
      ...message,
      sender: sender ?? this.fallbackProfile(actor),
    };
  }

  async markRead(
    userId: string,
    conversationId: string,
  ): Promise<{ success: true }> {
    const actor = this.requireUserId(userId);
    const conversation = await this.requireParticipant(actor, conversationId);
    if (conversation.status !== "accepted") {
      throw new ForbiddenException("This conversation is not active.");
    }
    await this.store.markRead(conversation.id, actor);
    return { success: true };
  }

  async hideConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ success: true }> {
    const actor = this.requireUserId(userId);
    const conversation = await this.requireParticipant(actor, conversationId);
    if (conversation.status !== "accepted") {
      throw new ForbiddenException("This conversation is not active.");
    }
    await this.store.hideConversation(conversation.id, actor);
    return { success: true };
  }

  async blockUser(
    userId: string,
    blockedUserId: string,
  ): Promise<{ success: true }> {
    const actor = this.requireUserId(userId);
    const target = this.requireOtherUserId(actor, blockedUserId);
    const profiles = await this.store.findProfiles([target]);
    if (!profiles.some((profile) => profile.userId === target)) {
      throw new NotFoundException("This community member is unavailable.");
    }
    await this.store.blockUser(actor, target);
    return { success: true };
  }

  async unblockUser(
    userId: string,
    blockedUserId: string,
  ): Promise<{ success: true }> {
    const actor = this.requireUserId(userId);
    const target = this.requireOtherUserId(actor, blockedUserId);
    await this.store.unblockUser(actor, target);
    return { success: true };
  }

  listBlocks(userId: string, limit?: number): Promise<DmProfile[]> {
    const resolvedLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(Math.trunc(limit!), MAX_BLOCK_LIST_LIMIT))
      : DEFAULT_PAGE_LIMIT;
    return this.store.listBlocks(this.requireUserId(userId), resolvedLimit);
  }

  private async requireParticipant(
    userId: string,
    conversationId: string,
  ): Promise<CommunityDmConversation> {
    const id = (conversationId || "").trim();
    if (!UUID_PATTERN.test(id)) {
      throw new NotFoundException("Conversation not found.");
    }
    const conversation = await this.store.findConversation(id);
    // Deliberately return the same 404 for a missing conversation and for one
    // belonging to somebody else, so ids cannot be probed for existence.
    if (!conversation || !(await this.store.hasParticipant(id, userId))) {
      throw new NotFoundException("Conversation not found.");
    }
    return conversation;
  }

  private async toDetail(
    conversation: CommunityDmConversation,
    actor: string,
    blocked: boolean,
  ): Promise<DmConversationDetail> {
    const otherId = this.otherUserId(conversation, actor);
    const [profile] = await this.store.findProfiles([otherId]);
    return {
      id: conversation.id,
      status: this.status(conversation),
      requestedBy: conversation.requestedBy,
      createdAt: conversation.createdAt,
      acceptedAt: conversation.acceptedAt,
      lastMessageAt: conversation.lastMessageAt,
      otherUser: profile ?? this.fallbackProfile(otherId),
      blocked,
    };
  }

  private refuseExistingRequest(
    actor: string,
    conversation: CommunityDmConversation | null,
  ): void {
    if (!conversation) return;
    if (conversation.status === "accepted") {
      throw new ConflictException("You already have a conversation with this person.");
    }
    if (conversation.status === "declined") {
      throw new ForbiddenException("This person isn't accepting messages from you.");
    }
    if (conversation.requestedBy === actor) {
      throw new ConflictException(
        "Your message request is still waiting for a response.",
      );
    }
    throw new ConflictException(
      "This person already sent you a message request. Review it in Chats.",
    );
  }

  private requireUserId(userId: string): string {
    const id = (userId || "").trim();
    if (!id) throw new ForbiddenException("Sign in to use messages.");
    return id;
  }

  private requireOtherUserId(actor: string, userId: string): string {
    const target = (userId || "").trim();
    if (!target) throw new BadRequestException("Choose someone to message.");
    if (target === actor) {
      throw new BadRequestException("You can't message yourself.");
    }
    return target;
  }

  private messageBody(value: string): string {
    const body = (value || "").trim();
    if (!body) throw new BadRequestException("Write a message first.");
    if (body.length > DM_MESSAGE_MAX_LENGTH) {
      throw new BadRequestException("Messages can be up to 2,000 characters.");
    }
    return body;
  }

  private resolveLimit(limit?: number): number {
    if (!Number.isFinite(limit)) return DEFAULT_PAGE_LIMIT;
    return Math.max(1, Math.min(Math.trunc(limit!), MAX_PAGE_LIMIT));
  }

  private otherUserId(
    conversation: CommunityDmConversation,
    actor: string,
  ): string {
    return conversation.participantA === actor
      ? conversation.participantB
      : conversation.participantA;
  }

  private status(conversation: CommunityDmConversation) {
    return conversation.status as "pending" | "accepted" | "declined";
  }

  private fallbackProfile(userId: string): DmProfile {
    return { userId, displayName: "Edutu member", avatarUrl: null };
  }

  private blockedException(): ForbiddenException {
    return new ForbiddenException("Messages aren't available for this person.");
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
