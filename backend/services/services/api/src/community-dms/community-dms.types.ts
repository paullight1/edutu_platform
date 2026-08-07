import type {
  CommunityDmConversation,
  CommunityDmMessage,
} from "../db/schema";

export type DmStatus = "pending" | "accepted" | "declined";
export type DmRequestDirection = "incoming" | "outgoing";

export type DmProfile = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
};

export type DmConversationDetail = {
  id: string;
  status: DmStatus;
  requestedBy: string;
  createdAt: Date;
  acceptedAt: Date | null;
  lastMessageAt: Date;
  otherUser: DmProfile;
  blocked: boolean;
};

export type DmConversationSummary = DmConversationDetail & {
  lastMessage: {
    body: string;
    senderId: string;
    createdAt: Date;
  };
  unreadCount: number;
};

export type DmRequestSummary = {
  id: string;
  direction: DmRequestDirection;
  requestedBy: string;
  createdAt: Date;
  otherUser: DmProfile;
  firstMessage: {
    body: string;
    senderId: string;
    createdAt: Date;
  };
};

export type DmMessageWithSender = CommunityDmMessage & {
  sender: DmProfile;
};

export type DmRelationship = {
  conversationId: string | null;
  status: DmStatus | null;
  direction: DmRequestDirection | null;
  blocked: boolean;
};

export type CreateDmRequestResult = {
  conversation: CommunityDmConversation;
  message: CommunityDmMessage;
};
