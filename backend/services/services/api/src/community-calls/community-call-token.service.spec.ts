import { jwtVerify, SignJWT } from "jose";
import { CommunityCallTokenService } from "./community-call-token.service";
import type { CommunityCallsConfig } from "./community-calls.types";

const secret = "shared-community-call-secret-123456789";
const config = {
  enabled: true,
  gatewayUrl: "http://internal",
  tokenSecret: secret,
  issuer: "edutu-api",
  joinAudience: "edutu-voice",
  gatewayAudience: "edutu-voice-internal",
  callbackIssuer: "edutu-voice",
  callbackAudience: "edutu-api-internal",
  joinTokenTtlSeconds: 60,
} as CommunityCallsConfig;

describe("CommunityCallTokenService", () => {
  it("signs the gateway's exact join-token contract", async () => {
    const service = new CommunityCallTokenService(config);
    const result = await service.signJoinToken({
      userId: "user_clerk_1",
      callId: "call-1",
      groupId: "group-1",
      role: "member",
      idempotencyKey: "join-request-1",
    });
    const { payload, protectedHeader } = await jwtVerify(
      result.token,
      new TextEncoder().encode(secret),
      { issuer: "edutu-api", audience: "edutu-voice" },
    );
    expect(protectedHeader.alg).toBe("HS256");
    expect(payload).toMatchObject({
      sub: "user_clerk_1",
      callId: "call-1",
      groupId: "group-1",
      role: "member",
    });
    expect(payload.jti).toBeTruthy();
    expect(result.jti).toBe(payload.jti);
    expect(payload.exp).toBeGreaterThan(payload.iat!);
  });

  it("signs internal tokens with the distinct internal audience", async () => {
    const service = new CommunityCallTokenService(config);
    const token = await service.signGatewayInternalToken("call-1", "prepare");
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { issuer: "edutu-api", audience: "edutu-voice-internal" },
    );
    expect(payload).toMatchObject({
      sub: "edutu-api",
      callId: "call-1",
      action: "prepare",
    });
  });

  it("accepts only the gateway's reverse media-failure callback contract", async () => {
    const service = new CommunityCallTokenService(config);
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      callId: "call-1",
      action: "media-failed",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("edutu-voice")
      .setAudience("edutu-api-internal")
      .setSubject("edutu-voice")
      .setJti("worker-failure-1")
      .setIssuedAt(now)
      .setExpirationTime(now + 30)
      .sign(new TextEncoder().encode(secret));

    await expect(
      service.verifyGatewayCallbackToken(token, "call-1"),
    ).resolves.toMatchObject({
      sub: "edutu-voice",
      callId: "call-1",
      action: "media-failed",
      jti: "worker-failure-1",
    });
  });

  it.each([
    ["edutu-api", "edutu-api-internal", "media-failed"],
    ["edutu-voice", "edutu-voice-internal", "media-failed"],
    ["edutu-voice", "edutu-api-internal", "prepare"],
  ])(
    "rejects a callback with issuer=%s audience=%s action=%s",
    async (issuer, audience, action) => {
      const service = new CommunityCallTokenService(config);
      const now = Math.floor(Date.now() / 1000);
      const token = await new SignJWT({ callId: "call-1", action })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer(issuer)
        .setAudience(audience)
        .setSubject("edutu-voice")
        .setJti("worker-failure-1")
        .setIssuedAt(now)
        .setExpirationTime(now + 30)
        .sign(new TextEncoder().encode(secret));

      await expect(
        service.verifyGatewayCallbackToken(token, "call-1"),
      ).rejects.toMatchObject({ code: "CALL_FORBIDDEN" });
    },
  );

  it("accepts a participation callback only when it is bound to user and join token", async () => {
    const service = new CommunityCallTokenService(config);
    const now = Math.floor(Date.now() / 1000);
    const joinTokenJti = "a".repeat(64);
    const token = await new SignJWT({
      callId: "call-1",
      action: "participant-joined",
      userId: "user_clerk_1",
      joinTokenJti,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("edutu-voice")
      .setAudience("edutu-api-internal")
      .setSubject("edutu-voice")
      .setJti("participant-callback-1")
      .setIssuedAt(now)
      .setExpirationTime(now + 30)
      .sign(new TextEncoder().encode(secret));

    await expect(
      service.verifyGatewayParticipationToken(
        token,
        "call-1",
        "user_clerk_1",
        joinTokenJti,
      ),
    ).resolves.toMatchObject({
      action: "participant-joined",
      userId: "user_clerk_1",
      joinTokenJti,
    });
    await expect(
      service.verifyGatewayParticipationToken(
        token,
        "call-1",
        "different-user",
        joinTokenJti,
      ),
    ).rejects.toMatchObject({ code: "CALL_FORBIDDEN" });
  });
});
