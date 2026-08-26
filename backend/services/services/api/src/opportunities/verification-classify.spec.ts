import {
  classifyHttpStatus,
  decideHealthOutcome,
  isInconclusive,
} from "./verification-classify";

describe("verification HTTP classification", () => {
  it.each([
    [200, "ok"],
    [301, "ok"],
    [404, "dead"],
    [410, "dead"],
    [401, "blocked"],
    [403, "blocked"],
    [405, "blocked"],
    [429, "blocked"],
    [500, "server_error"],
    [503, "server_error"],
    [null, "network_error"],
  ] as const)("classifies %s as %s", (status, expected) => {
    expect(classifyHttpStatus(status)).toBe(expected);
  });

  it("marks only blocked, server, and network failures inconclusive", () => {
    expect(isInconclusive("blocked")).toBe(true);
    expect(isInconclusive("server_error")).toBe(true);
    expect(isInconclusive("network_error")).toBe(true);
    expect(isInconclusive("ok")).toBe(false);
    expect(isInconclusive("dead")).toBe(false);
  });
});

describe("verification health decisions", () => {
  it("never demotes or increments strikes for an inconclusive fetch", () => {
    expect(
      decideHealthOutcome({
        fetchClass: "blocked",
        currentStatus: "active",
        currentBrokenCount: 1,
      }),
    ).toMatchObject({
      verificationStatus: "stale",
      opportunityStatus: "active",
      brokenLinkCount: 1,
      recheckHours: 12,
    });
  });

  it("requires two dead-page strikes before demotion", () => {
    expect(
      decideHealthOutcome({
        fetchClass: "dead",
        currentStatus: "active",
        currentBrokenCount: 0,
      }),
    ).toMatchObject({
      verificationStatus: "stale",
      opportunityStatus: "active",
      brokenLinkCount: 1,
    });
    expect(
      decideHealthOutcome({
        fetchClass: "dead",
        currentStatus: "active",
        currentBrokenCount: 1,
      }),
    ).toMatchObject({
      verificationStatus: "broken_link",
      opportunityStatus: "pending_review",
      brokenLinkCount: 2,
    });
  });

  it("clears strikes after a healthy response", () => {
    expect(
      decideHealthOutcome({
        fetchClass: "ok",
        currentStatus: "active",
        currentBrokenCount: 3,
      }),
    ).toMatchObject({ verificationStatus: "verified", brokenLinkCount: 0 });
  });
});
