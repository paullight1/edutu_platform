import {
  classifyHttpStatus,
  isInconclusive,
  decideHealthOutcome,
} from "./verification-classify";

describe("classifyHttpStatus", () => {
  it("treats only 404 and 410 as a dead page", () => {
    expect(classifyHttpStatus(404)).toBe("dead");
    expect(classifyHttpStatus(410)).toBe("dead");
  });

  it("treats WAF/anti-bot statuses as blocked, not dead", () => {
    expect(classifyHttpStatus(401)).toBe("blocked");
    expect(classifyHttpStatus(403)).toBe("blocked");
    expect(classifyHttpStatus(429)).toBe("blocked");
    expect(classifyHttpStatus(451)).toBe("blocked");
  });

  it("treats other 4xx (e.g. 400, 405) as blocked/inconclusive, never dead", () => {
    expect(classifyHttpStatus(400)).toBe("blocked");
    expect(classifyHttpStatus(405)).toBe("blocked");
  });

  it("treats 5xx as a server error", () => {
    expect(classifyHttpStatus(500)).toBe("server_error");
    expect(classifyHttpStatus(503)).toBe("server_error");
  });

  it("treats 2xx/3xx as ok", () => {
    expect(classifyHttpStatus(200)).toBe("ok");
    expect(classifyHttpStatus(301)).toBe("ok");
    expect(classifyHttpStatus(399)).toBe("ok");
  });

  it("treats a null status (network failure/timeout) as network_error", () => {
    expect(classifyHttpStatus(null)).toBe("network_error");
  });
});

describe("isInconclusive", () => {
  it("is true for blocked, server_error and network_error", () => {
    expect(isInconclusive("blocked")).toBe(true);
    expect(isInconclusive("server_error")).toBe(true);
    expect(isInconclusive("network_error")).toBe(true);
  });

  it("is false for ok and dead (these are conclusive)", () => {
    expect(isInconclusive("ok")).toBe(false);
    expect(isInconclusive("dead")).toBe(false);
  });
});

describe("decideHealthOutcome", () => {
  it("verifies and clears the broken counter on a healthy page", () => {
    const out = decideHealthOutcome({
      cls: "ok",
      currentStatus: "active",
      currentBrokenCount: 3,
    });
    expect(out.verificationStatus).toBe("verified");
    expect(out.opportunityStatus).toBe("active");
    expect(out.brokenLinkCount).toBe(0);
  });

  it("does NOT demote a live opportunity when the fetch is merely blocked", () => {
    const out = decideHealthOutcome({
      cls: "blocked",
      currentStatus: "active",
      currentBrokenCount: 5,
    });
    expect(out.verificationStatus).toBe("stale");
    // stays live — a WAF block is not evidence the opportunity is gone
    expect(out.opportunityStatus).toBe("active");
    // a block must never accumulate toward the broken-link demotion
    expect(out.brokenLinkCount).toBe(5);
  });

  it("keeps a server error / network error inconclusive without demotion", () => {
    for (const cls of ["server_error", "network_error"] as const) {
      const out = decideHealthOutcome({
        cls,
        currentStatus: "active",
        currentBrokenCount: 0,
      });
      expect(out.verificationStatus).toBe("stale");
      expect(out.opportunityStatus).toBe("active");
      expect(out.brokenLinkCount).toBe(0);
    }
  });

  it("keeps a first dead strike as stale (tolerates a flaky 404)", () => {
    const out = decideHealthOutcome({
      cls: "dead",
      currentStatus: "active",
      currentBrokenCount: 0,
    });
    expect(out.verificationStatus).toBe("stale");
    expect(out.opportunityStatus).toBe("active");
    expect(out.brokenLinkCount).toBe(1);
  });

  it("demotes only after a second confirmed dead strike", () => {
    const out = decideHealthOutcome({
      cls: "dead",
      currentStatus: "active",
      currentBrokenCount: 1,
    });
    expect(out.verificationStatus).toBe("broken_link");
    expect(out.opportunityStatus).toBe("pending_review");
    expect(out.brokenLinkCount).toBe(2);
  });
});
