import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import {
  canModerateGroup,
  canReadGroup,
  resolveAdminRole,
} from "../communities/community-authz";
import { NotificationsService } from "../notifications/notifications.service";
import {
  ActiveCommunityCallConflictError,
  COMMUNITY_CALLS_REPOSITORY,
  CommunityCallCapacityError,
  DrizzleCommunityCallsRepository,
  type CommunityCallsRepository,
  type MissedFinalization,
  type ReminderClaim,
  type RingDeliveryClaim,
} from "./community-calls.repository";
import {
  COMMUNITY_CALLS_CONFIG,
  communityCallsConfig,
} from "./community-calls.config";
import { callError } from "./community-calls.errors";
import { CommunityCallGatewayClient } from "./community-call-gateway.client";
import { isInsideCallStartWindow } from "./community-call-state-machine";
import { CommunityCallTokenService } from "./community-call-token.service";
import { NativeCallDeliveryService } from "./native-call-delivery.service";
import type {
  CallContext,
  CommunityCallsConfig,
} from "./community-calls.types";
import type {
  CommunityCallListQueryDto,
  DeclineCommunityCallDto,
  ScheduleCommunityCallDto,
  UpdateCommunityCallDto,
} from "./dto/community-call.dto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CommunityCallsService {
  private readonly logger = new Logger(CommunityCallsService.name);
  private readonly repository: CommunityCallsRepository;
  private ringQueueRunning = false;

  constructor(
    @Optional()
    @Inject(COMMUNITY_CALLS_REPOSITORY)
    repository: CommunityCallsRepository | undefined,
    private readonly gateway: CommunityCallGatewayClient,
    private readonly tokens: CommunityCallTokenService,
    private readonly notifications: NotificationsService,
    private readonly nativeDelivery: NativeCallDeliveryService,
    @Inject(COMMUNITY_CALLS_CONFIG)
    private readonly config: CommunityCallsConfig = communityCallsConfig(),
  ) {
    this.repository = repository ?? new DrizzleCommunityCallsRepository();
  }

  async list(
    userId: string,
    groupId: string,
    query: CommunityCallListQueryDto,
  ) {
    const actor = this.userId(userId);
    const context = await this.groupContext(groupId, actor);
    if (!canReadGroup(context.group, context.membership))
      throw callError.forbidden();
    const before = query.before ? new Date(query.before) : null;
    return this.repository.listCalls(groupId, before, query.limit);
  }

  async get(userId: string, callId: string) {
    const actor = this.userId(userId);
    const context = await this.callContext(callId, actor);
    if (!canReadGroup(context.group, context.membership))
      throw callError.forbidden();
    const adminRole = resolveAdminRole(
      context.group,
      actor,
      context.membership,
    );
    const activeMemberRole =
      context.membership?.status === "active" &&
      context.membership.role === "member"
        ? "member"
        : null;
    return {
      ...context.call,
      viewer: {
        userId: actor,
        role: adminRole ?? activeMemberRole ?? "member",
        inviteStatus: context.participant?.inviteStatus ?? "pending",
      },
      viewerParticipant: context.participant,
    };
  }

  async schedule(
    userId: string,
    groupId: string,
    dto: ScheduleCommunityCallDto,
    idempotencyKey: string,
  ) {
    this.assertEnabled();
    const actor = this.userId(userId);
    const key = this.idempotencyKey(idempotencyKey);
    const context = await this.groupContext(groupId, actor);
    this.assertModerator(context.group, actor, context.membership);
    if (context.group.archivedAt) {
      throw callError.invalidTransition(
        "Archived groups cannot schedule calls.",
      );
    }
    this.assertScheduleInput(dto.scheduledFor, dto.durationMinutes);
    return (await this.repository.createScheduled(actor, groupId, dto, key))
      .call;
  }

  async update(
    userId: string,
    callId: string,
    dto: UpdateCommunityCallDto,
    idempotencyKey: string,
  ) {
    this.assertEnabled();
    const actor = this.userId(userId);
    const context = await this.callContext(callId, actor);
    this.assertModerator(context.group, actor, context.membership);
    if (context.call.status !== "scheduled") throw callError.notScheduled();
    this.assertScheduleInput(
      dto.scheduledFor ?? context.call.scheduledFor.toISOString(),
      dto.durationMinutes ?? context.call.durationMinutes,
    );
    const result = await this.repository.updateScheduled(
      actor,
      context.call,
      dto,
      this.idempotencyKey(idempotencyKey),
    );
    if (
      !result.changed &&
      !result.replayed &&
      result.call.status !== "scheduled"
    ) {
      throw callError.notScheduled();
    }
    return result.call;
  }

  async cancel(userId: string, callId: string, idempotencyKey: string) {
    const actor = this.userId(userId);
    const key = this.idempotencyKey(idempotencyKey);
    const context = await this.callContext(callId, actor);
    this.assertModerator(context.group, actor, context.membership);
    if (context.call.status === "cancelled") return context.call;
    if (context.call.status !== "scheduled") throw callError.notScheduled();
    const result = await this.repository.cancelScheduled(
      actor,
      context.call,
      key,
    );
    if (!result.changed && result.call.status !== "cancelled") {
      throw callError.notScheduled();
    }
    return result.call;
  }

  async start(userId: string, callId: string, idempotencyKey: string) {
    this.assertEnabled();
    const actor = this.userId(userId);
    const key = this.idempotencyKey(idempotencyKey);
    const context = await this.callContext(callId, actor);
    this.assertModerator(context.group, actor, context.membership);
    if (context.call.status === "live") {
      const room = await this.gateway.prepare({
        callId: context.call.id,
        groupId: context.call.groupId,
        participantCap: this.config.participantCap,
      });
      return { ...context.call, signalingUrl: room.signalingUrl };
    }
    if (context.call.status === "starting") {
      return context.call;
    }
    if (context.call.status !== "scheduled") throw callError.notScheduled();
    if (
      !isInsideCallStartWindow(
        context.call.scheduledFor,
        new Date(),
        this.config.startEarlyMinutes,
        this.config.startLateMinutes,
      )
    ) {
      throw callError.outsideStartWindow();
    }
    let claimed;
    try {
      claimed = await this.repository.claimStart(actor, context.call, key);
    } catch (error) {
      if (error instanceof ActiveCommunityCallConflictError)
        throw callError.alreadyLive();
      throw error;
    }
    if (!claimed.changed) {
      if (claimed.call.status === "live") {
        const existingRoom = await this.gateway.prepare({
          callId: claimed.call.id,
          groupId: claimed.call.groupId,
          participantCap: this.config.participantCap,
        });
        return {
          ...claimed.call,
          signalingUrl: existingRoom.signalingUrl,
        };
      }
      if (claimed.call.status === "starting") {
        return claimed.call;
      }
      throw callError.notScheduled();
    }

    let room;
    try {
      room = await this.gateway.prepare({
        callId: claimed.call.id,
        groupId: claimed.call.groupId,
        participantCap: this.config.participantCap,
      });
    } catch (error) {
      await this.repository.failCall(
        claimed.call.id,
        ["starting"],
        "MEDIA_PREPARE_FAILED",
        actor,
        `prepare-failed:${key}`,
      );
      throw error;
    }

    const ringExpiresAt = new Date(Date.now() + this.config.ringSeconds * 1000);
    const activated = await this.repository.activateLive(
      actor,
      claimed.call,
      room,
      ringExpiresAt,
      key,
    );
    if (
      !activated.transition.changed &&
      activated.transition.call.status !== "live"
    ) {
      void this.gateway.close(callId).catch(() => undefined);
      throw callError.mediaUnavailable();
    }
    return {
      ...activated.transition.call,
      signalingUrl: room.signalingUrl,
    };
  }

  async end(userId: string, callId: string, idempotencyKey: string) {
    const actor = this.userId(userId);
    const key = this.idempotencyKey(idempotencyKey);
    const context = await this.callContext(callId, actor);
    this.assertModerator(context.group, actor, context.membership);
    if (context.call.status === "ended") return context.call;
    if (context.call.status !== "live") throw callError.notLive();
    const result = await this.repository.endLive(actor, context.call, key);
    if (result.changed) {
      void this.gateway.close(callId).catch(() => {
        this.logger.warn(`Media room close failed for call ${callId}`);
      });
    }
    return result.call;
  }

  async joinToken(userId: string, callId: string, idempotencyKey: string) {
    this.assertEnabled();
    const actor = this.userId(userId);
    const key = this.idempotencyKey(idempotencyKey);
    const context = await this.callContext(callId, actor);
    if (context.membership?.status !== "active")
      throw callError.membershipRequired();
    if (context.call.status !== "live") throw callError.notLive();
    if (!context.participant) throw callError.notInvited();
    try {
      const signed = await this.tokens.signJoinToken({
        userId: actor,
        callId,
        groupId: context.call.groupId,
        role: context.participant.roleAtStart,
        idempotencyKey: key,
      });
      const participant = await this.repository.reserveJoin(
        actor,
        callId,
        this.config.participantCap,
        signed.jti,
        new Date(signed.expiresAt),
      );
      if (!participant) throw callError.notInvited();
      const room = await this.gateway.prepare({
        callId,
        groupId: context.call.groupId,
        participantCap: this.config.participantCap,
      });
      return {
        token: signed.token,
        expiresAt: signed.expiresAt,
        callId,
        roomId: room.roomId,
        nodeId: room.nodeId,
        signalingUrl: room.signalingUrl,
      };
    } catch (error) {
      if (error instanceof CommunityCallCapacityError) throw callError.full();
      throw error;
    }
  }

  async decline(
    userId: string,
    callId: string,
    dto: DeclineCommunityCallDto,
    idempotencyKey: string,
  ) {
    const actor = this.userId(userId);
    const key = this.idempotencyKey(idempotencyKey);
    const context = await this.callContext(callId, actor);
    if (!context.participant) throw callError.notInvited();
    if (context.call.status !== "live") throw callError.notLive();
    return this.repository.decline(actor, callId, dto.reason, key);
  }

  async leave(userId: string, callId: string, idempotencyKey: string) {
    const actor = this.userId(userId);
    const key = this.idempotencyKey(idempotencyKey);
    const context = await this.callContext(callId, actor);
    if (!context.participant) throw callError.notInvited();
    return this.repository.leave(actor, callId, key);
  }

  async failFromGateway(
    callId: string,
    authorization: string | undefined,
    failureCode: string,
  ) {
    this.uuid(callId);
    const token = this.bearerToken(authorization);
    const claims = await this.tokens.verifyGatewayCallbackToken(token, callId);
    const result = await this.repository.failCall(
      callId,
      ["starting", "live"],
      failureCode,
      null,
      `gateway:${String(claims.jti)}`,
    );
    if (!result) throw callError.notFound();
    return result.call;
  }

  async confirmJoinedFromGateway(
    callId: string,
    userId: string,
    authorization: string | undefined,
    joinTokenJti: string,
  ) {
    this.uuid(callId);
    const actor = this.userId(userId);
    const token = this.bearerToken(authorization);
    const claims = await this.tokens.verifyGatewayParticipationToken(
      token,
      callId,
      actor,
      joinTokenJti,
    );
    const participant = await this.repository.confirmJoin(
      actor,
      callId,
      joinTokenJti,
      `gateway:${actor}:${String(claims.jti)}`,
    );
    if (!participant) throw callError.forbidden();
    return participant;
  }

  async processRingDeliveries(limit = this.config.lifecycleBatchSize) {
    if (this.ringQueueRunning) return;
    this.ringQueueRunning = true;
    try {
      const claims = await this.repository.claimRingDeliveries(
        new Date(),
        this.config.ringLeaseSeconds,
        limit,
      );
      const results = await Promise.allSettled(
        claims.map((claim) => this.deliverRingClaim(claim)),
      );
      const failures = results.filter(
        (result) => result.status === "rejected",
      ).length;
      if (failures) {
        this.logger.warn(
          `Community call ring queue completed with ${failures} retryable failure(s)`,
        );
      }
    } finally {
      this.ringQueueRunning = false;
    }
  }

  async sendReminder(claim: ReminderClaim) {
    if (!claim.userIds.length) return;
    await this.notifications.broadcast("system", {
      title: "Upcoming group call",
      body: `${claim.call.title} starts soon`,
      kind: "community-call-reminder",
      audience: "specific",
      targetUserIds: claim.userIds,
      dedupeKey: `community-call-reminder:${claim.call.id}:v${claim.call.version}`,
      channels: { inApp: true, push: true, email: false },
      metadata: {
        callId: claim.call.id,
        groupId: claim.call.groupId,
        scheduledFor: claim.call.scheduledFor.toISOString(),
      },
    });
  }

  async sendMissed(finalization: MissedFinalization) {
    if (!finalization.userIds.length) return;
    await this.notifications.broadcast("system", {
      title: "Missed group call",
      body: `You missed ${finalization.call.title}`,
      kind: "community-call-missed",
      audience: "specific",
      targetUserIds: finalization.userIds,
      dedupeKey: `community-call-missed:${finalization.call.id}`,
      channels: { inApp: true, push: true, email: false },
      metadata: {
        callId: finalization.call.id,
        groupId: finalization.call.groupId,
        stillLive: finalization.call.status === "live",
      },
    });
  }

  private async deliverRingClaim(claim: RingDeliveryClaim) {
    try {
      const ringExpiresAt = claim.call.ringExpiresAt;
      if (!ringExpiresAt || ringExpiresAt.getTime() <= Date.now()) {
        await this.repository.retryRingDelivery(
          claim.call.id,
          claim.leaseToken,
          new Date(),
          "ring window expired",
        );
        return;
      }
      await this.notifications.broadcast("system", {
        title: claim.groupName,
        body: `${claim.call.title} is live`,
        kind: "community-call-started",
        severity: "critical",
        audience: "specific",
        targetUserIds: claim.userIds,
        dedupeKey: `community-call-started:${claim.call.id}`,
        channels: { inApp: true, push: false, email: false },
        metadata: {
          callId: claim.call.id,
          groupId: claim.call.groupId,
          ringExpiresAt: ringExpiresAt.toISOString(),
        },
      });
      const ringAudience = claim.userIds.filter(
        (userId) => userId !== claim.actorId,
      );
      const summary = await this.nativeDelivery.ring(
        ringAudience,
        {
          callId: claim.call.id,
          groupId: claim.call.groupId,
          groupName: claim.groupName,
          title: claim.call.title,
          ringExpiresAt: ringExpiresAt.toISOString(),
          deepLink: `edutu://discussions/${claim.call.groupId}/calls/${claim.call.id}`,
        },
        Math.max(1, Math.ceil((ringExpiresAt.getTime() - Date.now()) / 1000)),
      );
      await this.repository.recordDeliveryOutcomes(
        claim.call.id,
        summary.outcomes,
      );
      if (summary.retryableUserIds.length) {
        throw new Error(
          `${summary.retryableUserIds.length} recipient transport(s) unavailable`,
        );
      }
      const completed = await this.repository.completeRingDelivery(
        claim.call.id,
        claim.leaseToken,
      );
      if (!completed) {
        this.logger.warn(
          `Community call ring lease was lost before completion for ${claim.call.id}`,
        );
      }
      this.logger.log(
        `Community call ring dispatch ${claim.call.id}: ${JSON.stringify(summary.telemetry)}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown delivery error";
      const delaySeconds = Math.min(
        30,
        this.config.ringRetryBaseSeconds * 2 ** (claim.attemptCount - 1),
      );
      await this.repository.retryRingDelivery(
        claim.call.id,
        claim.leaseToken,
        new Date(Date.now() + delaySeconds * 1000),
        message,
      );
      throw error;
    }
  }

  private async groupContext(groupId: string, userId: string) {
    this.uuid(groupId);
    const context = await this.repository.getGroupContext(groupId, userId);
    if (!context) throw callError.notFound();
    return context;
  }

  private async callContext(
    callId: string,
    userId: string,
  ): Promise<CallContext> {
    this.uuid(callId);
    const context = await this.repository.getCallContext(callId, userId);
    if (!context) throw callError.notFound();
    return context;
  }

  private assertModerator(
    group: CallContext["group"],
    actor: string,
    membership: CallContext["membership"],
  ) {
    if (!canModerateGroup(group, actor, membership))
      throw callError.forbidden();
  }

  private assertScheduleInput(scheduledFor: string, durationMinutes: number) {
    if (new Date(scheduledFor).getTime() <= Date.now()) {
      throw callError.invalidTransition("Schedule the call for a future time.");
    }
    if (durationMinutes > this.config.maximumDurationMinutes) {
      throw callError.invalidTransition(
        `Calls can be scheduled for at most ${this.config.maximumDurationMinutes} minutes.`,
      );
    }
  }

  private assertEnabled() {
    if (!this.config.enabled) throw callError.disabled();
  }

  private userId(value: string): string {
    const userId = value?.trim();
    if (!userId) throw callError.forbidden();
    return userId;
  }

  private uuid(value: string) {
    if (!UUID_PATTERN.test(value)) throw callError.notFound();
  }

  private idempotencyKey(value: string): string {
    const key = value?.trim();
    if (
      !key ||
      key.length < 8 ||
      key.length > 128 ||
      !/^[A-Za-z0-9._:-]+$/.test(key)
    ) {
      throw callError.idempotencyRequired();
    }
    return key;
  }

  private bearerToken(value: string | undefined): string {
    const match = /^Bearer\s+(.+)$/i.exec(value || "");
    if (!match) throw callError.forbidden();
    return match[1];
  }
}
