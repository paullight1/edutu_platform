import {
  isScamGateEnabled,
  extractRedFlags,
  decideScamGate,
  SCAM_GATE_CAP_THRESHOLD,
  OpportunityDedupService,
} from "./opportunity-dedup.service";

describe("scam gate pure helpers", () => {
  describe("isScamGateEnabled", () => {
    it("defaults ON when unset", () => {
      expect(isScamGateEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    });

    it("respects explicit opt-out values", () => {
      for (const v of [
        "false",
        "0",
        "off",
        "no",
        "disabled",
        "FALSE",
        " Off ",
      ]) {
        expect(
          isScamGateEnabled({ SCRAPER_SCAM_GATE: v } as NodeJS.ProcessEnv),
        ).toBe(false);
      }
    });

    it("treats any other value as ON", () => {
      expect(
        isScamGateEnabled({ SCRAPER_SCAM_GATE: "true" } as NodeJS.ProcessEnv),
      ).toBe(true);
    });
  });

  describe("extractRedFlags", () => {
    it("returns trimmed non-empty string flags", () => {
      expect(
        extractRedFlags({ red_flags: [" fee to apply ", "guaranteed win"] }),
      ).toEqual(["fee to apply", "guaranteed win"]);
    });

    it("returns [] for missing metadata or missing red_flags", () => {
      expect(extractRedFlags(null)).toEqual([]);
      expect(extractRedFlags(undefined)).toEqual([]);
      expect(extractRedFlags({})).toEqual([]);
    });

    it("returns [] and never throws on malformed red_flags", () => {
      expect(extractRedFlags({ red_flags: "not-an-array" })).toEqual([]);
      expect(extractRedFlags({ red_flags: 42 })).toEqual([]);
      expect(extractRedFlags({ red_flags: null })).toEqual([]);
    });

    it("drops non-string / blank entries inside the array", () => {
      expect(
        extractRedFlags({ red_flags: ["fee", "", "   ", 5, null, "scam"] }),
      ).toEqual(["fee", "scam"]);
    });
  });

  describe("decideScamGate", () => {
    it("is a no-op with zero flags", () => {
      expect(decideScamGate("active", 0, true)).toEqual({
        status: "active",
        capped: false,
        needsReview: false,
      });
    });

    it("is a no-op when the gate is disabled", () => {
      expect(decideScamGate("active", 3, false)).toEqual({
        status: "active",
        capped: false,
        needsReview: false,
      });
    });

    it("flags a single flag for review but preserves status", () => {
      expect(decideScamGate("active", 1, true)).toEqual({
        status: "active",
        capped: false,
        needsReview: true,
      });
    });

    it("caps an active row at pending_review at or above the threshold", () => {
      expect(decideScamGate("active", SCAM_GATE_CAP_THRESHOLD, true)).toEqual({
        status: "pending_review",
        capped: true,
        needsReview: true,
      });
    });

    it("never promotes an already pending_review or rejected row", () => {
      expect(decideScamGate("pending_review", 3, true)).toEqual({
        status: "pending_review",
        capped: false,
        needsReview: true,
      });
      expect(decideScamGate("rejected", 3, true)).toEqual({
        status: "rejected",
        capped: false,
        needsReview: true,
      });
    });
  });
});

describe("OpportunityDedupService.applyScamGate", () => {
  let service: OpportunityDedupService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SCRAPER_SCAM_GATE;
    service = new OpportunityDedupService();
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
  });

  it("leaves a clean row (0 flags) untouched", () => {
    const rec: Record<string, any> = {
      status: "active",
      metadata: { red_flags: [] },
    };
    const result = service.applyScamGate([rec]);
    expect(result).toEqual({ flagged: 0, capped: 0 });
    expect(rec.status).toBe("active");
    expect(rec.metadata.needs_review).toBeUndefined();
    expect(rec.metadata.scam_risk).toBeUndefined();
  });

  it("flags a single-flag row for review without changing status", () => {
    const rec: Record<string, any> = {
      status: "active",
      metadata: { red_flags: ["fee required to apply"] },
    };
    const result = service.applyScamGate([rec]);
    expect(result).toEqual({ flagged: 1, capped: 0 });
    expect(rec.status).toBe("active");
    expect(rec.metadata.needs_review).toBe(true);
    expect(rec.metadata.scam_risk).toEqual({
      flags: ["fee required to apply"],
      count: 1,
    });
  });

  it("caps a row with two or more flags to pending_review", () => {
    const rec: Record<string, any> = {
      status: "active",
      metadata: { red_flags: ["fee to apply", "guaranteed win"] },
    };
    const result = service.applyScamGate([rec]);
    expect(result).toEqual({ flagged: 1, capped: 1 });
    expect(rec.status).toBe("pending_review");
    expect(rec.metadata.needs_review).toBe(true);
    expect(rec.metadata.scam_risk.count).toBe(2);
  });

  it("does not demote an already-rejected row on many flags", () => {
    const rec: Record<string, any> = {
      status: "rejected",
      metadata: { red_flags: ["a", "b", "c"] },
    };
    const result = service.applyScamGate([rec]);
    expect(result).toEqual({ flagged: 1, capped: 0 });
    expect(rec.status).toBe("rejected");
    expect(rec.metadata.needs_review).toBe(true);
  });

  it("is a no-op when the gate env is turned off", () => {
    process.env.SCRAPER_SCAM_GATE = "false";
    const rec: Record<string, any> = {
      status: "active",
      metadata: { red_flags: ["fee to apply", "guaranteed win"] },
    };
    const result = service.applyScamGate([rec]);
    expect(result).toEqual({ flagged: 0, capped: 0 });
    expect(rec.status).toBe("active");
    expect(rec.metadata.needs_review).toBeUndefined();
  });

  it("never touches an existing (admin-pinned) row passed in skip set", () => {
    const rec: Record<string, any> = {
      canonical_url: "https://known.org/x",
      status: "active",
      metadata: { red_flags: ["fee to apply", "guaranteed win"] },
    };
    const result = service.applyScamGate(
      [rec],
      new Set(["https://known.org/x"]),
    );
    expect(result).toEqual({ flagged: 0, capped: 0 });
    expect(rec.status).toBe("active");
    expect(rec.metadata.needs_review).toBeUndefined();
  });

  it("merges scam annotations without clobbering earlier metadata", () => {
    const rec: Record<string, any> = {
      status: "active",
      metadata: {
        red_flags: ["fee to apply", "guaranteed win"],
        trust_gate: { domain: "x.org" },
        dedup: { matchedBy: "content_fingerprint" },
      },
    };
    service.applyScamGate([rec]);
    expect(rec.metadata.trust_gate).toEqual({ domain: "x.org" });
    expect(rec.metadata.dedup).toEqual({
      matchedBy: "content_fingerprint",
    });
    expect(rec.metadata.scam_risk.count).toBe(2);
  });

  it("does not throw on rows with missing or malformed metadata", () => {
    const rows: Record<string, any>[] = [
      { status: "active" },
      { status: "active", metadata: null },
      { status: "active", metadata: { red_flags: "oops" } },
    ];
    expect(() => service.applyScamGate(rows)).not.toThrow();
    for (const r of rows) expect(r.status).toBe("active");
  });
});
