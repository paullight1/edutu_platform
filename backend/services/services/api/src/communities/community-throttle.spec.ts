import {
  COMMUNITY_THROTTLES,
  communityThrottle,
  communityThrottleTracker,
} from "./community-throttle";

describe("community abuse throttles", () => {
  it("uses the authenticated Clerk subject instead of a shared IP when available", async () => {
    await expect(
      communityThrottleTracker({
        user: { authId: "user_abc", id: "database-id" },
        ip: "203.0.113.10",
      } as never),
    ).resolves.toBe("community:user:user_abc");
  });

  it("falls back safely when authenticated identity is unavailable", async () => {
    await expect(
      communityThrottleTracker({ ip: "203.0.113.10" } as never),
    ).resolves.toBe("community:ip:203.0.113.10");
  });

  it("keeps high-risk writes materially below the global 100-per-minute ceiling", () => {
    expect(COMMUNITY_THROTTLES.sendGroupMessage).toEqual({
      limit: 30,
      ttl: 60_000,
    });
    expect(COMMUNITY_THROTTLES.sendDmMessage).toEqual({
      limit: 30,
      ttl: 60_000,
    });
    expect(COMMUNITY_THROTTLES.report).toEqual({
      limit: 10,
      ttl: 600_000,
    });
    expect(COMMUNITY_THROTTLES.dmRequest).toEqual({
      limit: 10,
      ttl: 600_000,
    });
  });

  it("builds a default-throttler override with the account tracker", () => {
    expect(communityThrottle("createGroup")).toEqual({
      default: {
        limit: 6,
        ttl: 600_000,
        getTracker: communityThrottleTracker,
      },
    });
  });
});
