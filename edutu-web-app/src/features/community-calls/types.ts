import { z } from "zod";

export const callStatusSchema = z.enum([
  "scheduled",
  "starting",
  "live",
  "ended",
  "cancelled",
  "expired",
  "failed",
]);

export const communityRoleSchema = z.enum(["owner", "mod", "member"]);

export const inviteStatusSchema = z.enum([
  "pending",
  "ringing",
  "notified",
  "joined",
  "declined",
  "missed",
  "unreachable",
]);

const isoInstantSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  "Expected an ISO date-time",
);

const participantWireSchema = z
  .object({
    userId: z.string().min(1).optional(),
    user_id: z.string().min(1).optional(),
    displayName: z.string().min(1).max(120).optional(),
    display_name: z.string().min(1).max(120).optional(),
    role: communityRoleSchema.optional(),
    roleAtStart: communityRoleSchema.optional(),
    role_at_start: communityRoleSchema.optional(),
    inviteStatus: inviteStatusSchema.optional(),
    invite_status: inviteStatusSchema.optional(),
    isMuted: z.boolean().optional(),
    is_muted: z.boolean().optional(),
    isSpeaking: z.boolean().optional(),
    is_speaking: z.boolean().optional(),
    joinedAt: isoInstantSchema.nullish(),
    joined_at: isoInstantSchema.nullish(),
  })
  .refine((value) => Boolean(value.userId ?? value.user_id), {
    message: "Participant user id is required",
  })
  .transform((value) => ({
    userId: (value.userId ?? value.user_id) as string,
    displayName:
      value.displayName ?? value.display_name ?? "Community member",
    role: value.role ?? value.roleAtStart ?? value.role_at_start ?? "member",
    inviteStatus: value.inviteStatus ?? value.invite_status ?? "pending",
    isMuted: value.isMuted ?? value.is_muted ?? true,
    isSpeaking: value.isSpeaking ?? value.is_speaking ?? false,
    joinedAt: value.joinedAt ?? value.joined_at ?? null,
  }));

const viewerWireSchema = z
  .object({
    userId: z.string().min(1).optional(),
    user_id: z.string().min(1).optional(),
    role: communityRoleSchema,
    inviteStatus: inviteStatusSchema.optional(),
    invite_status: inviteStatusSchema.optional(),
  })
  .transform((value) => ({
    userId: value.userId ?? value.user_id ?? "",
    role: value.role,
    inviteStatus: value.inviteStatus ?? value.invite_status ?? "pending",
  }));

const callWireSchema = z
  .object({
    id: z.string().uuid(),
    groupId: z.string().uuid().optional(),
    group_id: z.string().uuid().optional(),
    groupName: z.string().min(1).max(160).optional(),
    group_name: z.string().min(1).max(160).optional(),
    title: z.string().min(1).max(160),
    scheduledFor: isoInstantSchema.optional(),
    scheduled_for: isoInstantSchema.optional(),
    durationMinutes: z.number().int().positive().max(1440).optional(),
    duration_minutes: z.number().int().positive().max(1440).optional(),
    status: callStatusSchema,
    startedAt: isoInstantSchema.nullish(),
    started_at: isoInstantSchema.nullish(),
    endedAt: isoInstantSchema.nullish(),
    ended_at: isoInstantSchema.nullish(),
    ringExpiresAt: isoInstantSchema.nullish(),
    ring_expires_at: isoInstantSchema.nullish(),
    failureCode: z.string().max(100).nullish(),
    failure_code: z.string().max(100).nullish(),
    viewer: viewerWireSchema,
    participants: z.array(participantWireSchema).max(500).default([]),
  })
  .refine((value) => Boolean(value.groupId ?? value.group_id), {
    message: "Call group id is required",
  })
  .refine((value) => Boolean(value.scheduledFor ?? value.scheduled_for), {
    message: "Scheduled time is required",
  })
  .transform((value) => ({
    id: value.id,
    groupId: (value.groupId ?? value.group_id) as string,
    groupName: value.groupName ?? value.group_name ?? "Community",
    title: value.title,
    scheduledFor: (value.scheduledFor ?? value.scheduled_for) as string,
    durationMinutes:
      value.durationMinutes ?? value.duration_minutes ?? 60,
    status: value.status,
    startedAt: value.startedAt ?? value.started_at ?? null,
    endedAt: value.endedAt ?? value.ended_at ?? null,
    ringExpiresAt: value.ringExpiresAt ?? value.ring_expires_at ?? null,
    failureCode: value.failureCode ?? value.failure_code ?? null,
    viewer: value.viewer,
    participants: value.participants,
  }));

export const communityCallResponseSchema = z
  .union([callWireSchema, z.object({ call: callWireSchema })])
  .transform((value) => ("call" in value ? value.call : value));

export const joinTokenResponseSchema = z
  .object({
    token: z.string().min(20).max(8192),
    expiresAt: isoInstantSchema.optional(),
    expires_at: isoInstantSchema.optional(),
    signalingUrl: z.string().url().max(2048).optional(),
    signaling_url: z.string().url().max(2048).optional(),
    nodeId: z.string().min(1).max(120).optional(),
    node_id: z.string().min(1).max(120).optional(),
    roomId: z.string().min(1).max(120).optional(),
    room_id: z.string().min(1).max(120).optional(),
  })
  .transform((value) => ({
    token: value.token,
    expiresAt: value.expiresAt ?? value.expires_at ?? null,
    signalingUrl: value.signalingUrl ?? value.signaling_url ?? null,
    nodeId: value.nodeId ?? value.node_id ?? null,
    roomId: value.roomId ?? value.room_id ?? null,
  }));

export type CommunityCall = z.infer<typeof communityCallResponseSchema>;
export type CommunityCallParticipant = CommunityCall["participants"][number];
export type CommunityRole = z.infer<typeof communityRoleSchema>;
export type CallStatus = z.infer<typeof callStatusSchema>;
export type InviteStatus = z.infer<typeof inviteStatusSchema>;
export type JoinToken = z.infer<typeof joinTokenResponseSchema>;

export function canEndCommunityCall(role: CommunityRole): boolean {
  return role === "owner" || role === "mod";
}
