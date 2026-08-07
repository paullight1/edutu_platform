import type {
  CommunityGroup,
  CommunityGroupCall,
  CommunityGroupCallParticipant,
  CommunityGroupMember,
} from "../db/schema";

export type CommunityCallStatus =
  | "scheduled"
  | "starting"
  | "live"
  | "ended"
  | "cancelled"
  | "expired"
  | "failed";

export type CommunityCallInviteStatus =
  | "pending"
  | "ringing"
  | "notified"
  | "joined"
  | "declined"
  | "missed"
  | "unreachable";

export type CallContext = {
  call: CommunityGroupCall;
  group: CommunityGroup;
  membership: CommunityGroupMember | null;
  participant: CommunityGroupCallParticipant | null;
};

export type GroupCallContext = {
  group: CommunityGroup;
  membership: CommunityGroupMember | null;
};

export type CallTransitionResult = {
  call: CommunityGroupCall;
  changed: boolean;
  replayed: boolean;
};

export type PreparedRoom = {
  nodeId: string;
  roomId: string;
  signalingUrl: string;
};

export type CommunityCallsConfig = {
  enabled: boolean;
  gatewayUrl: string | null;
  tokenSecret: string | null;
  issuer: "edutu-api";
  joinAudience: "edutu-voice";
  gatewayAudience: "edutu-voice-internal";
  callbackIssuer: "edutu-voice";
  callbackAudience: "edutu-api-internal";
  gatewayTimeoutMs: number;
  joinTokenTtlSeconds: number;
  startEarlyMinutes: number;
  startLateMinutes: number;
  reminderMinutes: number;
  ringSeconds: number;
  ringLeaseSeconds: number;
  ringRetryBaseSeconds: number;
  maximumDurationMinutes: number;
  participantCap: number;
  lifecycleBatchSize: number;
  startingTimeoutMinutes: number;
};
