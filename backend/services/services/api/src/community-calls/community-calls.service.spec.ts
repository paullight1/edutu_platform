import { CommunityCallDomainError, callError } from "./community-calls.errors";
import { CommunityCallCapacityError } from "./community-calls.repository";
import { CommunityCallsService } from "./community-calls.service";
import type { CommunityCallsConfig } from "./community-calls.types";

const groupId = "11111111-1111-4111-8111-111111111111";
const callId = "22222222-2222-4222-8222-222222222222";
const now = new Date();
const group = {
  id: groupId,
  ownerId: "owner",
  name: "Scholarship circle",
  visibility: "private",
  archivedAt: null,
} as any;
const ownerMembership = {
  userId: "owner",
  role: "owner",
  status: "active",
} as any;
const memberMembership = {
  userId: "member",
  role: "member",
  status: "active",
} as any;

function call(status = "scheduled", version = 1) {
  return {
    id: callId,
    groupId,
    title: "Weekly voice room",
    scheduledFor: new Date(now.getTime() + 60_000),
    durationMinutes: 30,
    status,
    version,
    createdBy: "owner",
    startedBy: null,
    endedBy: null,
    startedAt: null,
    ringExpiresAt: null,
    endedAt: null,
    cancelledAt: null,
    mediaNodeId: null,
    mediaRoomId: null,
    failureCode: null,
    createdAt: now,
    updatedAt: now,
  } as any;
}

const config = {
  enabled: true,
  startEarlyMinutes: 5,
  startLateMinutes: 30,
  ringSeconds: 45,
  ringLeaseSeconds: 30,
  ringRetryBaseSeconds: 2,
  maximumDurationMinutes: 120,
  participantCap: 2,
} as CommunityCallsConfig;

function setup(repositoryOverrides: Record<string, any> = {}) {
  const repository: any = {
    getGroupContext: jest
      .fn()
      .mockResolvedValue({ group, membership: ownerMembership }),
    getCallContext: jest.fn().mockResolvedValue({
      call: call(),
      group,
      membership: ownerMembership,
      participant: null,
    }),
    createScheduled: jest.fn(),
    claimStart: jest.fn(),
    activateLive: jest.fn(),
    failCall: jest.fn().mockResolvedValue(null),
    reserveJoin: jest.fn(),
    confirmJoin: jest.fn(),
    claimRingDeliveries: jest.fn().mockResolvedValue([]),
    completeRingDelivery: jest.fn().mockResolvedValue(true),
    retryRingDelivery: jest.fn().mockResolvedValue(true),
    recordDeliveryOutcomes: jest.fn().mockResolvedValue(undefined),
    ...repositoryOverrides,
  };
  const gateway: any = {
    prepare: jest.fn().mockResolvedValue({
      nodeId: "node-1",
      roomId: "room-1",
      signalingUrl: "wss://voice.test/ws",
    }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const tokens: any = {
    signJoinToken: jest.fn().mockResolvedValue({
      token: "jwt",
      expiresAt: "2026-08-06T12:01:00.000Z",
      jti: "a".repeat(64),
    }),
    verifyGatewayCallbackToken: jest.fn().mockResolvedValue({
      sub: "edutu-voice",
      callId,
      action: "media-failed",
      jti: "worker-failure-1",
    }),
    verifyGatewayParticipationToken: jest.fn().mockResolvedValue({
      sub: "edutu-voice",
      callId,
      action: "participant-joined",
      userId: "member",
      joinTokenJti: "a".repeat(64),
      jti: "participant-callback-1",
    }),
  };
  const notifications: any = {
    broadcast: jest.fn().mockResolvedValue({ push: { sent: 1 } }),
  };
  const native: any = {
    ring: jest
      .fn()
      .mockResolvedValue({ outcomes: [], retryableUserIds: [], telemetry: {} }),
  };
  return {
    service: new CommunityCallsService(
      repository,
      gateway,
      tokens,
      notifications,
      native,
      config,
    ),
    repository,
    gateway,
    tokens,
    notifications,
    native,
  };
}

describe("CommunityCallsService", () => {
  it("returns the authenticated viewer in the web response shape", async () => {
    const participant = {
      userId: "owner",
      roleAtStart: "owner",
      inviteStatus: "joined",
    };
    const { service } = setup({
      getCallContext: jest.fn().mockResolvedValue({
        call: call("live", 3),
        group,
        membership: ownerMembership,
        participant,
      }),
    });

    await expect(service.get("owner", callId)).resolves.toMatchObject({
      viewer: {
        userId: "owner",
        role: "owner",
        inviteStatus: "joined",
      },
      viewerParticipant: participant,
    });
  });

  it("does not grant a public non-member an administrative viewer role", async () => {
    const { service } = setup({
      getCallContext: jest.fn().mockResolvedValue({
        call: call(),
        group: { ...group, visibility: "public" },
        membership: null,
        participant: null,
      }),
    });

    await expect(service.get("public-viewer", callId)).resolves.toMatchObject({
      viewer: {
        userId: "public-viewer",
        role: "member",
        inviteStatus: "pending",
      },
      viewerParticipant: null,
    });
  });

  it("uses existing group authorization and refuses a regular member schedule", async () => {
    const { service } = setup({
      getGroupContext: jest
        .fn()
        .mockResolvedValue({ group, membership: memberMembership }),
    });
    await expect(
      service.schedule(
        "member",
        groupId,
        {
          title: "No authority",
          scheduledFor: new Date(Date.now() + 60_000).toISOString(),
          durationMinutes: 30,
        },
        "schedule-member-1",
      ),
    ).rejects.toMatchObject({ code: "CALL_FORBIDDEN" });
  });

  it("allows only one concurrent start claim and one gateway prepare", async () => {
    let claimed = false;
    const starting = call("starting", 2);
    const live = { ...call("live", 3), startedAt: new Date() };
    const { service, repository, gateway } = setup({
      claimStart: jest.fn().mockImplementation(async () => {
        if (claimed) return { call: starting, changed: false, replayed: false };
        claimed = true;
        return { call: starting, changed: true, replayed: false };
      }),
      activateLive: jest.fn().mockResolvedValue({
        transition: { call: live, changed: true, replayed: false },
        participants: [],
      }),
    });
    const results = await Promise.all([
      service.start("owner", callId, "concurrent-start-1"),
      service.start("owner", callId, "concurrent-start-2"),
    ]);
    expect(results).toHaveLength(2);
    expect(gateway.prepare).toHaveBeenCalledTimes(1);
    expect(repository.activateLive).toHaveBeenCalledTimes(1);
  });

  it("moves a claimed call to failed and never rings when prepare fails", async () => {
    const starting = call("starting", 2);
    const { service, repository, gateway, notifications } = setup({
      claimStart: jest
        .fn()
        .mockResolvedValue({ call: starting, changed: true, replayed: false }),
    });
    gateway.prepare.mockRejectedValue(callError.mediaUnavailable());
    await expect(
      service.start("owner", callId, "prepare-failure-1"),
    ).rejects.toMatchObject({ code: "MEDIA_UNAVAILABLE" });
    expect(repository.failCall).toHaveBeenCalledWith(
      callId,
      ["starting"],
      "MEDIA_PREPARE_FAILED",
      "owner",
      "prepare-failed:prepare-failure-1",
    );
    expect(notifications.broadcast).not.toHaveBeenCalled();
  });

  it("returns CALL_FULL when excess members try to join concurrently", async () => {
    const { service, repository, gateway } = setup({
      getCallContext: jest.fn().mockResolvedValue({
        call: call("live", 3),
        group,
        membership: memberMembership,
        participant: { userId: "member", roleAtStart: "member" },
      }),
      reserveJoin: jest
        .fn()
        .mockRejectedValue(new CommunityCallCapacityError()),
    });
    await expect(
      service.joinToken("member", callId, "join-over-cap-1"),
    ).rejects.toMatchObject({ code: "CALL_FULL" });
    expect(repository.reserveJoin).toHaveBeenCalledWith(
      "member",
      callId,
      2,
      "a".repeat(64),
      new Date("2026-08-06T12:01:00.000Z"),
    );
    expect(gateway.prepare).not.toHaveBeenCalled();
  });

  it("reserves capacity when minting a token without marking attendance", async () => {
    const participant = {
      userId: "member",
      roleAtStart: "member",
      inviteStatus: "ringing",
    };
    const { service, repository } = setup({
      getCallContext: jest.fn().mockResolvedValue({
        call: call("live", 3),
        group,
        membership: memberMembership,
        participant,
      }),
      reserveJoin: jest.fn().mockResolvedValue(participant),
    });

    await expect(
      service.joinToken("member", callId, "join-reservation-1"),
    ).resolves.toEqual(
      expect.objectContaining({
        token: "jwt",
        signalingUrl: "wss://voice.test/ws",
      }),
    );
    expect(repository.reserveJoin).toHaveBeenCalledTimes(1);
    expect(repository.confirmJoin).not.toHaveBeenCalled();
  });

  it("records attendance only from a callback bound to the join token", async () => {
    const joined = {
      userId: "member",
      inviteStatus: "joined",
      firstJoinedAt: new Date(),
    };
    const { service, repository, tokens } = setup({
      confirmJoin: jest.fn().mockResolvedValue(joined),
    });

    await expect(
      service.confirmJoinedFromGateway(
        callId,
        "member",
        "Bearer callback-jwt",
        "a".repeat(64),
      ),
    ).resolves.toBe(joined);
    expect(tokens.verifyGatewayParticipationToken).toHaveBeenCalledWith(
      "callback-jwt",
      callId,
      "member",
      "a".repeat(64),
    );
    expect(repository.confirmJoin).toHaveBeenCalledWith(
      "member",
      callId,
      "a".repeat(64),
      "gateway:member:participant-callback-1",
    );
  });

  it("completes a leased ring only after notification and native delivery", async () => {
    const live = {
      ...call("live", 3),
      ringExpiresAt: new Date(Date.now() + 45_000),
      startedBy: "owner",
    };
    const { service, repository, notifications, native } = setup({
      claimRingDeliveries: jest.fn().mockResolvedValue([
        {
          call: live,
          groupName: group.name,
          actorId: "owner",
          userIds: ["owner", "member"],
          leaseToken: "33333333-3333-4333-8333-333333333333",
          attemptCount: 1,
        },
      ]),
    });

    await service.processRingDeliveries();

    expect(notifications.broadcast).toHaveBeenCalledWith(
      "system",
      expect.objectContaining({
        dedupeKey: `community-call-started:${callId}`,
      }),
    );
    expect(native.ring).toHaveBeenCalledWith(
      ["member"],
      expect.objectContaining({ callId, groupId }),
      expect.any(Number),
    );
    expect(repository.recordDeliveryOutcomes).toHaveBeenCalled();
    expect(repository.completeRingDelivery).toHaveBeenCalledWith(
      callId,
      "33333333-3333-4333-8333-333333333333",
    );
    expect(repository.retryRingDelivery).not.toHaveBeenCalled();
  });

  it("releases a failed ring lease for bounded exponential retry", async () => {
    const live = {
      ...call("live", 3),
      ringExpiresAt: new Date(Date.now() + 45_000),
      startedBy: "owner",
    };
    const { service, repository, notifications } = setup({
      claimRingDeliveries: jest.fn().mockResolvedValue([
        {
          call: live,
          groupName: group.name,
          actorId: "owner",
          userIds: ["owner", "member"],
          leaseToken: "44444444-4444-4444-8444-444444444444",
          attemptCount: 2,
        },
      ]),
    });
    notifications.broadcast.mockRejectedValueOnce(new Error("database down"));

    await service.processRingDeliveries();

    expect(repository.completeRingDelivery).not.toHaveBeenCalled();
    expect(repository.retryRingDelivery).toHaveBeenCalledWith(
      callId,
      "44444444-4444-4444-8444-444444444444",
      expect.any(Date),
      "database down",
    );
  });

  it("deduplicates missed-call inbox delivery by call", async () => {
    const { service, notifications } = setup();
    await service.sendMissed({ call: call("live", 3), userIds: ["member"] });
    expect(notifications.broadcast).toHaveBeenCalledWith(
      "system",
      expect.objectContaining({
        kind: "community-call-missed",
        dedupeKey: `community-call-missed:${callId}`,
      }),
    );
  });

  it("uses the gateway callback jti as the idempotent worker-failure key", async () => {
    const failed = call("failed", 4);
    const { service, repository, tokens } = setup({
      failCall: jest.fn().mockResolvedValue({
        call: failed,
        changed: true,
        replayed: false,
      }),
    });

    await expect(
      service.failFromGateway(
        callId,
        "Bearer callback-jwt",
        "MEDIASOUP_WORKER_DIED",
      ),
    ).resolves.toBe(failed);
    expect(tokens.verifyGatewayCallbackToken).toHaveBeenCalledWith(
      "callback-jwt",
      callId,
    );
    expect(repository.failCall).toHaveBeenCalledWith(
      callId,
      ["starting", "live"],
      "MEDIASOUP_WORKER_DIED",
      null,
      "gateway:worker-failure-1",
    );
  });
});
