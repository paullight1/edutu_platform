import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../db";
import {
  communityGroupCallEvents,
  communityGroupCallParticipants,
  communityGroupCallRingJobs,
  communityGroupCalls,
  communityGroupMembers,
  communityGroupMessages,
  communityGroups,
  type CommunityGroupCall,
  type CommunityGroupCallParticipant,
} from "../db/schema";
import type {
  CallContext,
  CallTransitionResult,
  GroupCallContext,
  PreparedRoom,
} from "./community-calls.types";
import type {
  ScheduleCommunityCallDto,
  UpdateCommunityCallDto,
} from "./dto/community-call.dto";

export const COMMUNITY_CALLS_REPOSITORY = Symbol("COMMUNITY_CALLS_REPOSITORY");

export class ActiveCommunityCallConflictError extends Error {
  constructor() {
    super("A call is already starting or live in this group");
    this.name = "ActiveCommunityCallConflictError";
  }
}

export class CommunityCallCapacityError extends Error {
  constructor() {
    super("The call is at capacity");
    this.name = "CommunityCallCapacityError";
  }
}

export type DeliveryOutcome = {
  userId: string;
  status: "notified" | "unreachable";
};

export type ReminderClaim = {
  call: CommunityGroupCall;
  userIds: string[];
};

export type MissedFinalization = {
  call: CommunityGroupCall;
  userIds: string[];
};

export type RingDeliveryClaim = {
  call: CommunityGroupCall;
  groupName: string;
  actorId: string;
  userIds: string[];
  leaseToken: string;
  attemptCount: number;
};

export function buildParticipantSnapshot(
  members: Array<{ userId: string; role: string }>,
  callId: string,
  _actorId: string,
  now: Date,
) {
  return members.map((member) => ({
    callId,
    userId: member.userId,
    roleAtStart: member.role,
    inviteStatus: "ringing",
    firstNotifiedAt: null,
    firstJoinedAt: null,
    lastJoinedAt: null,
    joinedCount: 0,
  }));
}

export interface CommunityCallsRepository {
  getGroupContext(
    groupId: string,
    userId: string,
  ): Promise<GroupCallContext | null>;
  getCallContext(callId: string, userId: string): Promise<CallContext | null>;
  listCalls(
    groupId: string,
    before: Date | null,
    limit: number,
  ): Promise<CommunityGroupCall[]>;
  listActiveMemberIds(groupId: string): Promise<string[]>;
  createScheduled(
    actorId: string,
    groupId: string,
    dto: ScheduleCommunityCallDto,
    idempotencyKey: string,
  ): Promise<CallTransitionResult>;
  updateScheduled(
    actorId: string,
    call: CommunityGroupCall,
    dto: UpdateCommunityCallDto,
    idempotencyKey: string,
  ): Promise<CallTransitionResult>;
  cancelScheduled(
    actorId: string,
    call: CommunityGroupCall,
    idempotencyKey: string,
  ): Promise<CallTransitionResult>;
  claimStart(
    actorId: string,
    call: CommunityGroupCall,
    idempotencyKey: string,
  ): Promise<CallTransitionResult>;
  activateLive(
    actorId: string,
    call: CommunityGroupCall,
    room: PreparedRoom,
    ringExpiresAt: Date,
    idempotencyKey: string,
  ): Promise<{
    transition: CallTransitionResult;
    participants: CommunityGroupCallParticipant[];
  }>;
  failCall(
    callId: string,
    expectedStatuses: Array<"starting" | "live">,
    failureCode: string,
    actorId: string | null,
    idempotencyKey: string,
  ): Promise<CallTransitionResult | null>;
  endLive(
    actorId: string,
    call: CommunityGroupCall,
    idempotencyKey: string,
  ): Promise<CallTransitionResult>;
  reserveJoin(
    actorId: string,
    callId: string,
    participantCap: number,
    reservationJti: string,
    reservedUntil: Date,
  ): Promise<CommunityGroupCallParticipant | null>;
  confirmJoin(
    actorId: string,
    callId: string,
    reservationJti: string,
    callbackJti: string,
  ): Promise<CommunityGroupCallParticipant | null>;
  decline(
    actorId: string,
    callId: string,
    reason: string | undefined,
    idempotencyKey: string,
  ): Promise<CommunityGroupCallParticipant | null>;
  leave(
    actorId: string,
    callId: string,
    idempotencyKey: string,
  ): Promise<CommunityGroupCallParticipant | null>;
  recordDeliveryOutcomes(
    callId: string,
    outcomes: DeliveryOutcome[],
  ): Promise<void>;
  claimRingDeliveries(
    now: Date,
    leaseSeconds: number,
    limit: number,
  ): Promise<RingDeliveryClaim[]>;
  completeRingDelivery(callId: string, leaseToken: string): Promise<boolean>;
  retryRingDelivery(
    callId: string,
    leaseToken: string,
    nextAttemptAt: Date,
    error: string,
  ): Promise<boolean>;
  claimDueReminders(
    now: Date,
    reminderMinutes: number,
    limit: number,
  ): Promise<ReminderClaim[]>;
  finalizeMissed(now: Date, limit: number): Promise<MissedFinalization[]>;
  expireAbandoned(
    now: Date,
    lateMinutes: number,
    limit: number,
  ): Promise<CommunityGroupCall[]>;
  claimOverdue(
    now: Date,
    maximumDurationMinutes: number,
    limit: number,
  ): Promise<CommunityGroupCall[]>;
  failStaleStarting(
    now: Date,
    timeoutMinutes: number,
    limit: number,
  ): Promise<CommunityGroupCall[]>;
}

function callCard(
  call: Pick<CommunityGroupCall, "id" | "title" | "scheduledFor">,
) {
  return JSON.stringify({
    callId: call.id,
    title: call.title,
    scheduledFor: call.scheduledFor.toISOString(),
  });
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "23505",
  );
}

@Injectable()
export class DrizzleCommunityCallsRepository implements CommunityCallsRepository {
  async getGroupContext(
    groupId: string,
    userId: string,
  ): Promise<GroupCallContext | null> {
    const [group, membership] = await Promise.all([
      db.query.communityGroups.findFirst({
        where: eq(communityGroups.id, groupId),
      }),
      db.query.communityGroupMembers.findFirst({
        where: and(
          eq(communityGroupMembers.groupId, groupId),
          eq(communityGroupMembers.userId, userId),
        ),
      }),
    ]);
    return group ? { group, membership: membership ?? null } : null;
  }

  async getCallContext(
    callId: string,
    userId: string,
  ): Promise<CallContext | null> {
    const [row] = await db
      .select({ call: communityGroupCalls, group: communityGroups })
      .from(communityGroupCalls)
      .innerJoin(
        communityGroups,
        eq(communityGroups.id, communityGroupCalls.groupId),
      )
      .where(eq(communityGroupCalls.id, callId))
      .limit(1);
    if (!row) return null;
    const [membership, participant] = await Promise.all([
      db.query.communityGroupMembers.findFirst({
        where: and(
          eq(communityGroupMembers.groupId, row.call.groupId),
          eq(communityGroupMembers.userId, userId),
        ),
      }),
      db.query.communityGroupCallParticipants.findFirst({
        where: and(
          eq(communityGroupCallParticipants.callId, callId),
          eq(communityGroupCallParticipants.userId, userId),
        ),
      }),
    ]);
    return {
      ...row,
      membership: membership ?? null,
      participant: participant ?? null,
    };
  }

  listCalls(groupId: string, before: Date | null, limit: number) {
    const conditions = [eq(communityGroupCalls.groupId, groupId)];
    if (before) conditions.push(lt(communityGroupCalls.scheduledFor, before));
    return db
      .select()
      .from(communityGroupCalls)
      .where(and(...conditions))
      .orderBy(
        desc(communityGroupCalls.scheduledFor),
        desc(communityGroupCalls.id),
      )
      .limit(limit);
  }

  async listActiveMemberIds(groupId: string): Promise<string[]> {
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

  async createScheduled(
    actorId: string,
    groupId: string,
    dto: ScheduleCommunityCallDto,
    idempotencyKey: string,
  ): Promise<CallTransitionResult> {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`community-call:create:${groupId}:${actorId}:${idempotencyKey}`}))`,
      );
      const [replay] = await tx
        .select({ call: communityGroupCalls })
        .from(communityGroupCallEvents)
        .innerJoin(
          communityGroupCalls,
          eq(communityGroupCalls.id, communityGroupCallEvents.callId),
        )
        .where(
          and(
            eq(communityGroupCallEvents.actorId, actorId),
            eq(communityGroupCallEvents.type, "call.scheduled"),
            eq(communityGroupCallEvents.idempotencyKey, idempotencyKey),
            eq(communityGroupCalls.groupId, groupId),
          ),
        )
        .limit(1);
      if (replay) return { call: replay.call, changed: false, replayed: true };

      const [call] = await tx
        .insert(communityGroupCalls)
        .values({
          groupId,
          title: dto.title,
          scheduledFor: new Date(dto.scheduledFor),
          durationMinutes: dto.durationMinutes,
          createdBy: actorId,
        })
        .returning();
      await tx.insert(communityGroupCallEvents).values({
        callId: call.id,
        actorId,
        type: "call.scheduled",
        idempotencyKey,
        payload: {
          scheduledFor: dto.scheduledFor,
          durationMinutes: dto.durationMinutes,
        },
      });
      const [message] = await tx
        .insert(communityGroupMessages)
        .values({
          groupId,
          userId: actorId,
          body: callCard(call),
          kind: "call",
          callId: call.id,
        })
        .returning({ createdAt: communityGroupMessages.createdAt });
      await tx
        .update(communityGroups)
        .set({
          messageCount: sql`${communityGroups.messageCount} + 1`,
          lastMessageAt: message.createdAt,
        })
        .where(eq(communityGroups.id, groupId));
      return { call, changed: true, replayed: false };
    });
  }

  async updateScheduled(
    actorId: string,
    call: CommunityGroupCall,
    dto: UpdateCommunityCallDto,
    idempotencyKey: string,
  ): Promise<CallTransitionResult> {
    return db.transaction(async (tx) => {
      const [replay] = await tx
        .select({ id: communityGroupCallEvents.id })
        .from(communityGroupCallEvents)
        .where(
          and(
            eq(communityGroupCallEvents.callId, call.id),
            eq(communityGroupCallEvents.type, "call.rescheduled"),
            eq(communityGroupCallEvents.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (replay) {
        const current = await this.findCallIn(tx, call.id);
        return { call: current!, changed: false, replayed: true };
      }
      const patch = {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.scheduledFor !== undefined
          ? { scheduledFor: new Date(dto.scheduledFor) }
          : {}),
        ...(dto.durationMinutes !== undefined
          ? { durationMinutes: dto.durationMinutes }
          : {}),
        updatedAt: new Date(),
        version: sql`${communityGroupCalls.version} + 1`,
      };
      const [updated] = await tx
        .update(communityGroupCalls)
        .set(patch)
        .where(
          and(
            eq(communityGroupCalls.id, call.id),
            eq(communityGroupCalls.status, "scheduled"),
            eq(communityGroupCalls.version, call.version),
          ),
        )
        .returning();
      if (!updated) {
        const current = await this.findCallIn(tx, call.id);
        return { call: current!, changed: false, replayed: false };
      }
      await tx.insert(communityGroupCallEvents).values({
        callId: call.id,
        actorId,
        type: "call.rescheduled",
        idempotencyKey,
        payload: dto,
      });
      await tx
        .update(communityGroupMessages)
        .set({ body: callCard(updated) })
        .where(eq(communityGroupMessages.callId, call.id));
      return { call: updated, changed: true, replayed: false };
    });
  }

  cancelScheduled(
    actorId: string,
    call: CommunityGroupCall,
    idempotencyKey: string,
  ) {
    return this.transition(call, "cancelled", actorId, idempotencyKey, {
      cancelledAt: new Date(),
    });
  }

  async claimStart(
    actorId: string,
    call: CommunityGroupCall,
    idempotencyKey: string,
  ): Promise<CallTransitionResult> {
    try {
      return await this.transition(call, "starting", actorId, idempotencyKey, {
        startedBy: actorId,
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ActiveCommunityCallConflictError();
      throw error;
    }
  }

  async activateLive(
    actorId: string,
    call: CommunityGroupCall,
    room: PreparedRoom,
    ringExpiresAt: Date,
    idempotencyKey: string,
  ) {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [live] = await tx
        .update(communityGroupCalls)
        .set({
          status: "live",
          startedAt: now,
          ringExpiresAt,
          mediaNodeId: room.nodeId,
          mediaRoomId: room.roomId,
          updatedAt: now,
          version: sql`${communityGroupCalls.version} + 1`,
        })
        .where(
          and(
            eq(communityGroupCalls.id, call.id),
            eq(communityGroupCalls.status, "starting"),
            eq(communityGroupCalls.version, call.version),
          ),
        )
        .returning();
      if (!live) {
        const current = await this.findCallIn(tx, call.id);
        const participants = await tx
          .select()
          .from(communityGroupCallParticipants)
          .where(eq(communityGroupCallParticipants.callId, call.id));
        return {
          transition: { call: current!, changed: false, replayed: false },
          participants,
        };
      }

      const members = await tx
        .select({
          userId: communityGroupMembers.userId,
          role: communityGroupMembers.role,
        })
        .from(communityGroupMembers)
        .where(
          and(
            eq(communityGroupMembers.groupId, call.groupId),
            eq(communityGroupMembers.status, "active"),
          ),
        )
        .orderBy(communityGroupMembers.joinedAt);
      if (members.length) {
        await tx
          .insert(communityGroupCallParticipants)
          .values(buildParticipantSnapshot(members, call.id, actorId, now))
          .onConflictDoNothing();
      }
      await tx.insert(communityGroupCallEvents).values([
        {
          callId: call.id,
          actorId,
          type: "media.ready",
          idempotencyKey: `media:${idempotencyKey}`,
          payload: { nodeId: room.nodeId, roomId: room.roomId },
        },
        {
          callId: call.id,
          actorId,
          type: "call.live",
          idempotencyKey: `live:${idempotencyKey}`,
          payload: { ringExpiresAt: ringExpiresAt.toISOString() },
        },
      ]);
      await tx
        .insert(communityGroupCallRingJobs)
        .values({ callId: call.id, nextAttemptAt: now })
        .onConflictDoNothing();
      const participants = await tx
        .select()
        .from(communityGroupCallParticipants)
        .where(eq(communityGroupCallParticipants.callId, call.id));
      return {
        transition: { call: live, changed: true, replayed: false },
        participants,
      };
    });
  }

  async failCall(
    callId: string,
    expectedStatuses: Array<"starting" | "live">,
    failureCode: string,
    actorId: string | null,
    idempotencyKey: string,
  ): Promise<CallTransitionResult | null> {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(communityGroupCalls)
        .where(eq(communityGroupCalls.id, callId))
        .limit(1);
      if (!current) return null;
      if (current.status === "failed") {
        return { call: current, changed: false, replayed: true };
      }
      if (!expectedStatuses.includes(current.status as "starting" | "live")) {
        return { call: current, changed: false, replayed: false };
      }
      const now = new Date();
      const [failed] = await tx
        .update(communityGroupCalls)
        .set({
          status: "failed",
          failureCode,
          endedAt: current.status === "live" ? now : current.endedAt,
          updatedAt: now,
          version: sql`${communityGroupCalls.version} + 1`,
        })
        .where(
          and(
            eq(communityGroupCalls.id, callId),
            eq(communityGroupCalls.status, current.status),
            eq(communityGroupCalls.version, current.version),
          ),
        )
        .returning();
      if (!failed) {
        const raced = await this.findCallIn(tx, callId);
        return { call: raced!, changed: false, replayed: false };
      }
      await tx
        .insert(communityGroupCallEvents)
        .values({
          callId,
          actorId,
          type: "call.failed",
          idempotencyKey,
          payload: { failureCode },
        })
        .onConflictDoNothing();
      return { call: failed, changed: true, replayed: false };
    });
  }

  endLive(actorId: string, call: CommunityGroupCall, idempotencyKey: string) {
    return this.transition(call, "ended", actorId, idempotencyKey, {
      endedBy: actorId,
      endedAt: new Date(),
    });
  }

  async reserveJoin(
    actorId: string,
    callId: string,
    participantCap: number,
    reservationJti: string,
    reservedUntil: Date,
  ): Promise<CommunityGroupCallParticipant | null> {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`community-call:join:${callId}`}))`,
      );
      const [row] = await tx
        .select({ participant: communityGroupCallParticipants })
        .from(communityGroupCallParticipants)
        .innerJoin(
          communityGroupCalls,
          eq(communityGroupCalls.id, communityGroupCallParticipants.callId),
        )
        .where(
          and(
            eq(communityGroupCallParticipants.callId, callId),
            eq(communityGroupCallParticipants.userId, actorId),
            eq(communityGroupCalls.status, "live"),
          ),
        )
        .limit(1);
      const participant = row?.participant;
      if (!participant) return null;
      const [replay] = await tx
        .select({ id: communityGroupCallEvents.id })
        .from(communityGroupCallEvents)
        .where(
          and(
            eq(communityGroupCallEvents.callId, callId),
            eq(communityGroupCallEvents.type, "participant.join-reserved"),
            eq(communityGroupCallEvents.idempotencyKey, reservationJti),
          ),
        )
        .limit(1);
      if (replay) {
        const [renewed] = await tx
          .update(communityGroupCallParticipants)
          .set({
            joinReservationJti: reservationJti,
            joinReservedUntil: reservedUntil,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(communityGroupCallParticipants.callId, callId),
              eq(communityGroupCallParticipants.userId, actorId),
            ),
          )
          .returning();
        return renewed ?? participant;
      }
      const now = new Date();
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(communityGroupCallParticipants)
        .where(
          and(
            eq(communityGroupCallParticipants.callId, callId),
            ne(communityGroupCallParticipants.userId, actorId),
            or(
              and(
                eq(communityGroupCallParticipants.inviteStatus, "joined"),
                isNull(communityGroupCallParticipants.leftAt),
              ),
              and(
                isNotNull(communityGroupCallParticipants.joinReservationJti),
                gt(communityGroupCallParticipants.joinReservedUntil, now),
              ),
            ),
          ),
        );
      if (count >= participantCap) throw new CommunityCallCapacityError();
      const [reserved] = await tx
        .update(communityGroupCallParticipants)
        .set({
          joinReservationJti: reservationJti,
          joinReservedUntil: reservedUntil,
          updatedAt: now,
        })
        .where(
          and(
            eq(communityGroupCallParticipants.callId, callId),
            eq(communityGroupCallParticipants.userId, actorId),
          ),
        )
        .returning();
      await tx.insert(communityGroupCallEvents).values({
        callId,
        actorId,
        type: "participant.join-reserved",
        idempotencyKey: reservationJti,
        payload: { reservedUntil: reservedUntil.toISOString() },
      });
      return reserved;
    });
  }

  async confirmJoin(
    actorId: string,
    callId: string,
    reservationJti: string,
    callbackJti: string,
  ): Promise<CommunityGroupCallParticipant | null> {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`community-call:join:${callId}`}))`,
      );
      const [replay] = await tx
        .select({ participant: communityGroupCallParticipants })
        .from(communityGroupCallEvents)
        .innerJoin(
          communityGroupCallParticipants,
          and(
            eq(communityGroupCallParticipants.callId, callId),
            eq(communityGroupCallParticipants.userId, actorId),
          ),
        )
        .where(
          and(
            eq(communityGroupCallEvents.callId, callId),
            eq(communityGroupCallEvents.type, "participant.joined"),
            eq(communityGroupCallEvents.idempotencyKey, callbackJti),
          ),
        )
        .limit(1);
      if (replay) return replay.participant;

      const [participant] = await tx
        .select()
        .from(communityGroupCallParticipants)
        .innerJoin(
          communityGroupCalls,
          eq(communityGroupCalls.id, communityGroupCallParticipants.callId),
        )
        .where(
          and(
            eq(communityGroupCallParticipants.callId, callId),
            eq(communityGroupCallParticipants.userId, actorId),
            eq(
              communityGroupCallParticipants.joinReservationJti,
              reservationJti,
            ),
            eq(communityGroupCalls.status, "live"),
          ),
        )
        .limit(1);
      if (!participant) return null;

      const now = new Date();
      const current = participant.community_group_call_participants;
      const [joined] = await tx
        .update(communityGroupCallParticipants)
        .set({
          inviteStatus: "joined",
          firstJoinedAt: current.firstJoinedAt ?? now,
          lastJoinedAt: now,
          leftAt: null,
          joinReservationJti: null,
          joinReservedUntil: null,
          joinedCount: sql`${communityGroupCallParticipants.joinedCount} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(communityGroupCallParticipants.callId, callId),
            eq(communityGroupCallParticipants.userId, actorId),
            eq(
              communityGroupCallParticipants.joinReservationJti,
              reservationJti,
            ),
          ),
        )
        .returning();
      if (!joined) return null;
      await tx.insert(communityGroupCallEvents).values({
        callId,
        actorId,
        type: "participant.joined",
        idempotencyKey: callbackJti,
        payload: { reservationJti },
      });
      return joined;
    });
  }

  async decline(
    actorId: string,
    callId: string,
    reason: string | undefined,
    idempotencyKey: string,
  ) {
    return this.participantTransition(
      actorId,
      callId,
      "declined",
      idempotencyKey,
      {
        reason: reason ?? null,
      },
    );
  }

  async leave(actorId: string, callId: string, idempotencyKey: string) {
    return this.participantTransition(
      actorId,
      callId,
      "left",
      idempotencyKey,
      {},
    );
  }

  async recordDeliveryOutcomes(callId: string, outcomes: DeliveryOutcome[]) {
    const now = new Date();
    for (const outcome of outcomes) {
      await db
        .update(communityGroupCallParticipants)
        .set({
          inviteStatus: outcome.status,
          ...(outcome.status === "notified"
            ? {
                firstNotifiedAt: sql`coalesce(${communityGroupCallParticipants.firstNotifiedAt}, ${now})`,
              }
            : {}),
          updatedAt: now,
        })
        .where(
          and(
            eq(communityGroupCallParticipants.callId, callId),
            eq(communityGroupCallParticipants.userId, outcome.userId),
            inArray(communityGroupCallParticipants.inviteStatus, [
              "pending",
              "ringing",
              "notified",
            ]),
          ),
        );
    }
    const totals = outcomes.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});
    await db
      .insert(communityGroupCallEvents)
      .values({
        callId,
        actorId: null,
        type: "ring.delivery",
        idempotencyKey: "ring-delivery-v1",
        payload: totals,
      })
      .onConflictDoNothing();
  }

  async claimRingDeliveries(
    now: Date,
    leaseSeconds: number,
    limit: number,
  ): Promise<RingDeliveryClaim[]> {
    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);

    await db.execute(sql`
      update ${communityGroupCallRingJobs} as job
      set status = 'expired',
          lease_token = null,
          lease_expires_at = null,
          updated_at = ${now}
      from ${communityGroupCalls} as call
      where job.call_id = call.id
        and job.status = 'pending'
        and (
          call.status <> 'live'
          or call.ring_expires_at is null
          or call.ring_expires_at <= ${now}
        )
    `);

    const result = await db.execute(sql`
      with due as (
        select job.call_id
        from ${communityGroupCallRingJobs} as job
        inner join ${communityGroupCalls} as call on call.id = job.call_id
        where job.status = 'pending'
          and job.next_attempt_at <= ${now}
          and (job.lease_expires_at is null or job.lease_expires_at <= ${now})
          and call.status = 'live'
          and call.ring_expires_at > ${now}
        order by job.next_attempt_at, job.call_id
        for update of job skip locked
        limit ${limit}
      )
      update ${communityGroupCallRingJobs} as job
      set lease_token = ${leaseToken}::uuid,
          lease_expires_at = ${leaseExpiresAt},
          attempt_count = job.attempt_count + 1,
          updated_at = ${now}
      from due
      where job.call_id = due.call_id
      returning job.call_id as "callId", job.attempt_count as "attemptCount"
    `);
    const leased = queryRows<{ callId: string; attemptCount: number }>(result);
    const claims: RingDeliveryClaim[] = [];
    for (const lease of leased) {
      const [context] = await db
        .select({ call: communityGroupCalls, groupName: communityGroups.name })
        .from(communityGroupCalls)
        .innerJoin(
          communityGroups,
          eq(communityGroups.id, communityGroupCalls.groupId),
        )
        .where(eq(communityGroupCalls.id, lease.callId))
        .limit(1);
      if (!context?.call.startedBy) continue;
      const participants = await db
        .select({ userId: communityGroupCallParticipants.userId })
        .from(communityGroupCallParticipants)
        .where(
          and(
            eq(communityGroupCallParticipants.callId, lease.callId),
            inArray(communityGroupCallParticipants.inviteStatus, [
              "pending",
              "ringing",
            ]),
          ),
        );
      claims.push({
        call: context.call,
        groupName: context.groupName,
        actorId: context.call.startedBy,
        userIds: participants.map((participant) => participant.userId),
        leaseToken,
        attemptCount: lease.attemptCount,
      });
    }
    return claims;
  }

  async completeRingDelivery(callId: string, leaseToken: string) {
    const now = new Date();
    const [completed] = await db
      .update(communityGroupCallRingJobs)
      .set({
        status: "completed",
        completedAt: now,
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(communityGroupCallRingJobs.callId, callId),
          eq(communityGroupCallRingJobs.status, "pending"),
          eq(communityGroupCallRingJobs.leaseToken, leaseToken),
        ),
      )
      .returning({ callId: communityGroupCallRingJobs.callId });
    return Boolean(completed);
  }

  async retryRingDelivery(
    callId: string,
    leaseToken: string,
    nextAttemptAt: Date,
    error: string,
  ) {
    const [released] = await db
      .update(communityGroupCallRingJobs)
      .set({
        nextAttemptAt,
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: error.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(communityGroupCallRingJobs.callId, callId),
          eq(communityGroupCallRingJobs.status, "pending"),
          eq(communityGroupCallRingJobs.leaseToken, leaseToken),
        ),
      )
      .returning({ callId: communityGroupCallRingJobs.callId });
    return Boolean(released);
  }

  async claimDueReminders(now: Date, reminderMinutes: number, limit: number) {
    const horizon = new Date(now.getTime() + reminderMinutes * 60_000);
    const calls = await db
      .select()
      .from(communityGroupCalls)
      .where(
        and(
          eq(communityGroupCalls.status, "scheduled"),
          lte(communityGroupCalls.scheduledFor, horizon),
          sql`${communityGroupCalls.scheduledFor} > ${now}`,
        ),
      )
      .orderBy(communityGroupCalls.scheduledFor)
      .limit(limit);
    const claimed: ReminderClaim[] = [];
    for (const call of calls) {
      const key = `reminder:v${call.version}`;
      const [event] = await db
        .insert(communityGroupCallEvents)
        .values({
          callId: call.id,
          actorId: null,
          type: "reminder.claimed",
          idempotencyKey: key,
          payload: { scheduledFor: call.scheduledFor.toISOString() },
        })
        .onConflictDoNothing()
        .returning({ id: communityGroupCallEvents.id });
      if (!event) continue;
      claimed.push({
        call,
        userIds: await this.listActiveMemberIds(call.groupId),
      });
    }
    return claimed;
  }

  async finalizeMissed(
    now: Date,
    limit: number,
  ): Promise<MissedFinalization[]> {
    const calls = await db
      .select()
      .from(communityGroupCalls)
      .where(
        and(
          inArray(communityGroupCalls.status, ["live", "ended", "failed"]),
          lte(communityGroupCalls.ringExpiresAt, now),
        ),
      )
      .limit(limit);
    const finalized: MissedFinalization[] = [];
    for (const call of calls) {
      const result = await db.transaction(async (tx) => {
        const [claim] = await tx
          .insert(communityGroupCallEvents)
          .values({
            callId: call.id,
            actorId: null,
            type: "missed.finalized",
            idempotencyKey: "missed-v1",
            payload: {},
          })
          .onConflictDoNothing()
          .returning({ id: communityGroupCallEvents.id });
        if (!claim) return [];
        const unreachable = await tx
          .select({ userId: communityGroupCallParticipants.userId })
          .from(communityGroupCallParticipants)
          .where(
            and(
              eq(communityGroupCallParticipants.callId, call.id),
              isNull(communityGroupCallParticipants.firstJoinedAt),
              eq(communityGroupCallParticipants.inviteStatus, "unreachable"),
            ),
          );
        const missed = await tx
          .update(communityGroupCallParticipants)
          .set({ inviteStatus: "missed", updatedAt: now })
          .where(
            and(
              eq(communityGroupCallParticipants.callId, call.id),
              isNull(communityGroupCallParticipants.firstJoinedAt),
              inArray(communityGroupCallParticipants.inviteStatus, [
                "pending",
                "ringing",
                "notified",
              ]),
            ),
          )
          .returning({ userId: communityGroupCallParticipants.userId });
        // Preserve `unreachable` as the delivery outcome while still creating
        // the durable missed-call inbox entry for that invitee.
        return [...missed, ...unreachable];
      });
      if (result.length)
        finalized.push({ call, userIds: result.map((row) => row.userId) });
    }
    return finalized;
  }

  async expireAbandoned(now: Date, lateMinutes: number, limit: number) {
    const cutoff = new Date(now.getTime() - lateMinutes * 60_000);
    const candidates = await db
      .select()
      .from(communityGroupCalls)
      .where(
        and(
          eq(communityGroupCalls.status, "scheduled"),
          lte(communityGroupCalls.scheduledFor, cutoff),
        ),
      )
      .limit(limit);
    return this.claimLifecycle(candidates, "expired", "schedule.expired", now);
  }

  async claimOverdue(now: Date, maximumDurationMinutes: number, limit: number) {
    const candidates = await db
      .select()
      .from(communityGroupCalls)
      .where(
        and(
          eq(communityGroupCalls.status, "live"),
          sql`${communityGroupCalls.startedAt} + (least(${communityGroupCalls.durationMinutes}, ${maximumDurationMinutes}) * interval '1 minute') <= ${now}`,
        ),
      )
      .limit(limit);
    return this.claimLifecycle(candidates, "ended", "duration.ended", now);
  }

  async failStaleStarting(now: Date, timeoutMinutes: number, limit: number) {
    const cutoff = new Date(now.getTime() - timeoutMinutes * 60_000);
    const candidates = await db
      .select()
      .from(communityGroupCalls)
      .where(
        and(
          eq(communityGroupCalls.status, "starting"),
          lte(communityGroupCalls.updatedAt, cutoff),
        ),
      )
      .limit(limit);
    return this.claimLifecycle(candidates, "failed", "starting.timed_out", now);
  }

  private async transition(
    call: CommunityGroupCall,
    target: "starting" | "cancelled" | "ended",
    actorId: string,
    idempotencyKey: string,
    fields: Partial<CommunityGroupCall>,
  ): Promise<CallTransitionResult> {
    const eventType = `call.${target}`;
    return db.transaction(async (tx) => {
      const [replay] = await tx
        .select({ id: communityGroupCallEvents.id })
        .from(communityGroupCallEvents)
        .where(
          and(
            eq(communityGroupCallEvents.callId, call.id),
            eq(communityGroupCallEvents.type, eventType),
            eq(communityGroupCallEvents.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (replay) {
        const current = await this.findCallIn(tx, call.id);
        return { call: current!, changed: false, replayed: true };
      }
      const expected =
        target === "starting" || target === "cancelled" ? "scheduled" : "live";
      const [updated] = await tx
        .update(communityGroupCalls)
        .set({
          ...fields,
          status: target,
          updatedAt: new Date(),
          version: sql`${communityGroupCalls.version} + 1`,
        })
        .where(
          and(
            eq(communityGroupCalls.id, call.id),
            eq(communityGroupCalls.status, expected),
            eq(communityGroupCalls.version, call.version),
          ),
        )
        .returning();
      if (!updated) {
        const current = await this.findCallIn(tx, call.id);
        return { call: current!, changed: false, replayed: false };
      }
      await tx.insert(communityGroupCallEvents).values({
        callId: call.id,
        actorId,
        type: eventType,
        idempotencyKey,
        payload: {},
      });
      return { call: updated, changed: true, replayed: false };
    });
  }

  private async participantTransition(
    actorId: string,
    callId: string,
    action: "declined" | "left",
    idempotencyKey: string,
    payload: Record<string, unknown>,
  ) {
    return db.transaction(async (tx) => {
      const eventType = `participant.${action}`;
      const [replay] = await tx
        .select({ id: communityGroupCallEvents.id })
        .from(communityGroupCallEvents)
        .where(
          and(
            eq(communityGroupCallEvents.callId, callId),
            eq(communityGroupCallEvents.type, eventType),
            eq(communityGroupCallEvents.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (replay) {
        return (
          (await tx.query.communityGroupCallParticipants.findFirst({
            where: and(
              eq(communityGroupCallParticipants.callId, callId),
              eq(communityGroupCallParticipants.userId, actorId),
            ),
          })) ?? null
        );
      }
      const now = new Date();
      const [participant] = await tx
        .update(communityGroupCallParticipants)
        .set(
          action === "declined"
            ? { inviteStatus: "declined", updatedAt: now }
            : { leftAt: now, updatedAt: now },
        )
        .where(
          and(
            eq(communityGroupCallParticipants.callId, callId),
            eq(communityGroupCallParticipants.userId, actorId),
          ),
        )
        .returning();
      if (!participant) return null;
      await tx.insert(communityGroupCallEvents).values({
        callId,
        actorId,
        type: eventType,
        idempotencyKey,
        payload,
      });
      return participant;
    });
  }

  private async claimLifecycle(
    candidates: CommunityGroupCall[],
    target: "expired" | "ended" | "failed",
    eventType: string,
    now: Date,
  ) {
    const changed: CommunityGroupCall[] = [];
    for (const call of candidates) {
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(communityGroupCalls)
          .set({
            status: target,
            endedAt: target === "ended" ? now : call.endedAt,
            failureCode:
              target === "failed" ? "MEDIA_PREPARE_TIMEOUT" : call.failureCode,
            updatedAt: now,
            version: sql`${communityGroupCalls.version} + 1`,
          })
          .where(
            and(
              eq(communityGroupCalls.id, call.id),
              eq(communityGroupCalls.status, call.status),
              eq(communityGroupCalls.version, call.version),
            ),
          )
          .returning();
        if (!row) return null;
        await tx
          .insert(communityGroupCallEvents)
          .values({
            callId: call.id,
            actorId: null,
            type: eventType,
            idempotencyKey: `${eventType}:v${call.version}`,
            payload: {},
          })
          .onConflictDoNothing();
        return row;
      });
      if (!updated) continue;
      changed.push(updated);
    }
    return changed;
  }

  private async findCallIn(
    tx: any,
    callId: string,
  ): Promise<CommunityGroupCall | null> {
    const [row] = await tx
      .select()
      .from(communityGroupCalls)
      .where(eq(communityGroupCalls.id, callId))
      .limit(1);
    return row ?? null;
  }
}

function queryRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}
