import { randomUUID } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type {
  CommunityDmConversation,
  CommunityDmMessage,
} from "../db/schema";
import type {
  CommunityDmsStore,
  DmCursor,
} from "./community-dms.store";
import { CommunityDmsService } from "./community-dms.service";
import type {
  CreateDmRequestResult,
  DmConversationSummary,
  DmProfile,
  DmRequestDirection,
  DmRequestSummary,
} from "./community-dms.types";

const ADA = "user_ada";
const BEN = "user_ben";
const CY = "user_cy";

class MemoryDmStore implements CommunityDmsStore {
  conversations: CommunityDmConversation[] = [];
  messages: CommunityDmMessage[] = [];
  participants = new Map<string, Set<string>>();
  profiles = new Map<string, DmProfile>([
    [ADA, { userId: ADA, displayName: "Ada", avatarUrl: null }],
    [BEN, { userId: BEN, displayName: "Ben", avatarUrl: "https://img/ben" }],
    [CY, { userId: CY, displayName: "Cy", avatarUrl: null }],
  ]);
  blocks = new Set<string>();
  hidden = new Set<string>();
  read = new Set<string>();
  lastLimit = 0;

  async findConversation(id: string) {
    return this.conversations.find((row) => row.id === id) ?? null;
  }

  async findConversationBetween(first: string, second: string) {
    return (
      this.conversations.find(
        (row) =>
          (row.participantA === first && row.participantB === second) ||
          (row.participantA === second && row.participantB === first),
      ) ?? null
    );
  }

  async hasParticipant(conversationId: string, userId: string) {
    return this.participants.get(conversationId)?.has(userId) ?? false;
  }

  async isBlocked(first: string, second: string) {
    return this.blocks.has(`${first}:${second}`) || this.blocks.has(`${second}:${first}`);
  }

  async findProfiles(userIds: string[]) {
    return Array.from(new Set(userIds))
      .map((id) => this.profiles.get(id))
      .filter((row): row is DmProfile => Boolean(row));
  }

  async createRequest(senderId: string, recipientId: string, body: string) {
    const now = new Date();
    const [participantA, participantB] = [senderId, recipientId].sort();
    const conversation: CommunityDmConversation = {
      id: randomUUID(),
      participantA,
      participantB,
      requestedBy: senderId,
      status: "pending",
      createdAt: now,
      acceptedAt: null,
      declinedAt: null,
      lastMessageAt: now,
    };
    const message = this.addMessage(conversation.id, senderId, body, now);
    this.conversations.push(conversation);
    this.participants.set(conversation.id, new Set([senderId, recipientId]));
    return { conversation, message } satisfies CreateDmRequestResult;
  }

  async updateStatus(id: string, status: "accepted" | "declined") {
    const row = await this.findConversation(id);
    if (!row) return null;
    row.status = status;
    if (status === "accepted") row.acceptedAt = new Date();
    else row.declinedAt = new Date();
    return row;
  }

  async listConversations(
    userId: string,
    _cursor: DmCursor | null,
    limit: number,
  ): Promise<DmConversationSummary[]> {
    this.lastLimit = limit;
    return this.conversations
      .filter(
        (row) =>
          row.status === "accepted" &&
          this.participants.get(row.id)?.has(userId) &&
          !this.hidden.has(`${row.id}:${userId}`),
      )
      .slice(0, limit)
      .map((row) => {
        const otherId = row.participantA === userId ? row.participantB : row.participantA;
        const last = this.messages.filter((message) => message.conversationId === row.id).at(-1)!;
        return {
          id: row.id,
          status: "accepted",
          requestedBy: row.requestedBy,
          createdAt: row.createdAt,
          acceptedAt: row.acceptedAt,
          lastMessageAt: row.lastMessageAt,
          otherUser: this.profiles.get(otherId)!,
          blocked: false,
          lastMessage: { body: last.body, senderId: last.senderId, createdAt: last.createdAt },
          unreadCount: this.read.has(`${row.id}:${userId}`) ? 0 : 1,
        };
      });
  }

  async listRequests(
    userId: string,
    direction: DmRequestDirection,
    _cursor: DmCursor | null,
    limit: number,
  ): Promise<DmRequestSummary[]> {
    this.lastLimit = limit;
    return this.conversations
      .filter((row) => {
        if (row.status !== "pending" || !this.participants.get(row.id)?.has(userId)) return false;
        return direction === "incoming" ? row.requestedBy !== userId : row.requestedBy === userId;
      })
      .slice(0, limit)
      .map((row) => {
        const otherId = row.participantA === userId ? row.participantB : row.participantA;
        const first = this.messages.find((message) => message.conversationId === row.id)!;
        return {
          id: row.id,
          direction,
          requestedBy: row.requestedBy,
          createdAt: row.createdAt,
          otherUser: this.profiles.get(otherId)!,
          firstMessage: { body: first.body, senderId: first.senderId, createdAt: first.createdAt },
        };
      });
  }

  async listMessages(conversationId: string, _cursor: DmCursor | null, limit: number) {
    this.lastLimit = limit;
    return this.messages
      .filter((message) => message.conversationId === conversationId)
      .slice(-limit)
      .reverse();
  }

  async insertMessage(conversationId: string, senderId: string, body: string) {
    const message = this.addMessage(conversationId, senderId, body);
    const conversation = await this.findConversation(conversationId);
    if (conversation) conversation.lastMessageAt = message.createdAt;
    for (const participant of this.participants.get(conversationId) ?? []) {
      this.hidden.delete(`${conversationId}:${participant}`);
    }
    return message;
  }

  async markRead(conversationId: string, userId: string) {
    this.read.add(`${conversationId}:${userId}`);
  }

  async hideConversation(conversationId: string, userId: string) {
    this.hidden.add(`${conversationId}:${userId}`);
  }

  async blockUser(blockerId: string, blockedUserId: string) {
    this.blocks.add(`${blockerId}:${blockedUserId}`);
    const conversation = await this.findConversationBetween(blockerId, blockedUserId);
    if (conversation) this.hidden.add(`${conversation.id}:${blockerId}`);
  }

  async unblockUser(blockerId: string, blockedUserId: string) {
    this.blocks.delete(`${blockerId}:${blockedUserId}`);
  }

  async listBlocks(userId: string, limit: number) {
    return Array.from(this.blocks)
      .filter((key) => key.startsWith(`${userId}:`))
      .slice(0, limit)
      .map((key) => this.profiles.get(key.split(":")[1]))
      .filter((row): row is DmProfile => Boolean(row));
  }

  private addMessage(
    conversationId: string,
    senderId: string,
    body: string,
    createdAt = new Date(),
  ): CommunityDmMessage {
    const message: CommunityDmMessage = {
      id: randomUUID(),
      conversationId,
      senderId,
      body,
      createdAt,
    };
    this.messages.push(message);
    return message;
  }
}

function setup() {
  const store = new MemoryDmStore();
  return { store, service: new CommunityDmsService(store) };
}

describe("CommunityDmsService message requests", () => {
  it("creates one pending request with exactly one first message", async () => {
    const { service, store } = setup();

    const result = await service.createRequest(ADA, {
      recipientId: BEN,
      body: "  Hello Ben  ",
    });

    expect(result.conversation.status).toBe("pending");
    expect(result.conversation.requestedBy).toBe(ADA);
    expect(result.message.body).toBe("Hello Ben");
    expect(store.messages).toHaveLength(1);
  });

  it("prevents a pending sender from spamming another message", async () => {
    const { service, store } = setup();
    await service.createRequest(ADA, { recipientId: BEN, body: "First" });

    await expect(
      service.createRequest(ADA, { recipientId: BEN, body: "Second" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(store.messages.map((message) => message.body)).toEqual(["First"]);
  });

  it("only lets the recipient accept or decline", async () => {
    const { service } = setup();
    const { conversation } = await service.createRequest(ADA, {
      recipientId: BEN,
      body: "Hi",
    });

    await expect(service.acceptRequest(ADA, conversation.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const accepted = await service.acceptRequest(BEN, conversation.id);
    expect(accepted.status).toBe("accepted");
    expect(accepted.otherUser).toEqual({
      userId: ADA,
      displayName: "Ada",
      avatarUrl: null,
    });
  });

  it("makes a declined relationship unavailable for new requests", async () => {
    const { service } = setup();
    const { conversation } = await service.createRequest(ADA, {
      recipientId: BEN,
      body: "Hi",
    });
    await service.declineRequest(BEN, conversation.id);

    await expect(
      service.createRequest(ADA, { recipientId: BEN, body: "Try again" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("CommunityDmsService accepted conversations", () => {
  it("supports history, send, read and per-user hide without deleting history", async () => {
    const { service, store } = setup();
    const { conversation } = await service.createRequest(ADA, {
      recipientId: BEN,
      body: "Request",
    });
    await service.acceptRequest(BEN, conversation.id);
    await service.sendMessage(BEN, conversation.id, { body: "Welcome" });

    expect((await service.listMessages(ADA, conversation.id, null, 20)).map((row) => row.body)).toEqual([
      "Welcome",
      "Request",
    ]);
    await service.markRead(ADA, conversation.id);
    expect((await service.listConversations(ADA, null, 20))[0].unreadCount).toBe(0);

    await service.hideConversation(ADA, conversation.id);
    expect(await service.listConversations(ADA, null, 20)).toEqual([]);
    expect(await service.listConversations(BEN, null, 20)).toHaveLength(1);
    expect(store.messages).toHaveLength(2);

    await service.sendMessage(BEN, conversation.id, { body: "New activity" });
    expect(await service.listConversations(ADA, null, 20)).toHaveLength(1);
  });

  it("returns 404 to non-participants without revealing conversation existence", async () => {
    const { service } = setup();
    const { conversation } = await service.createRequest(ADA, {
      recipientId: BEN,
      body: "Private",
    });
    await service.acceptRequest(BEN, conversation.id);

    await expect(
      service.listMessages(CY, conversation.id, null, 20),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.hideConversation(CY, conversation.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("blocks sends in either block direction and keeps the block idempotent", async () => {
    const { service } = setup();
    const { conversation } = await service.createRequest(ADA, {
      recipientId: BEN,
      body: "Request",
    });
    await service.acceptRequest(BEN, conversation.id);
    await service.blockUser(ADA, BEN);
    await service.blockUser(ADA, BEN);

    await expect(
      service.sendMessage(ADA, conversation.id, { body: "No" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.sendMessage(BEN, conversation.id, { body: "Also no" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await service.listBlocks(ADA)).toEqual([
      { userId: BEN, displayName: "Ben", avatarUrl: "https://img/ben" },
    ]);
  });

  it("caps all requested page sizes", async () => {
    const { service, store } = setup();
    await service.listConversations(ADA, null, 5000);
    expect(store.lastLimit).toBe(50);
    await service.listRequests(ADA, "incoming", null, 0);
    expect(store.lastLimit).toBe(1);
  });
});
