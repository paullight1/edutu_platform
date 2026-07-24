import {
  normalizeTitleTokens,
  titleSimilarity,
  normalizeOrganization,
  deadlinesCompatible,
  registrableDomain,
  decideDomainTrust,
  isDomainTrustGateEnabled,
  TITLE_SIMILARITY_THRESHOLD,
  OpportunityDedupService,
  sanitizeOrgForFilter,
  findWithinBatchDuplicates,
} from "./opportunity-dedup.service";

describe("sanitizeOrgForFilter", () => {
  it("keeps a punctuated org matchable instead of dropping it", () => {
    // Commas/parens break PostgREST .or() — we must sanitize, not skip, so
    // "United Nations, Geneva" is still checked for duplicates.
    expect(sanitizeOrgForFilter("United Nations, Geneva")).toBe(
      "united*nations*geneva",
    );
    expect(sanitizeOrgForFilter("Mastercard Foundation (Scholars)")).toBe(
      "mastercard*foundation*scholars",
    );
  });

  it("returns an empty string when nothing usable remains", () => {
    expect(sanitizeOrgForFilter("()")).toBe("");
    expect(sanitizeOrgForFilter("")).toBe("");
  });
});

describe("findWithinBatchDuplicates", () => {
  it("flags a later record with the same fingerprint as an earlier one", () => {
    const dupes = findWithinBatchDuplicates([
      {
        canonical_url: "a",
        content_fingerprint: "rhodes|rhodes trust|2026-08-03",
      },
      {
        canonical_url: "b",
        content_fingerprint: "rhodes|rhodes trust|2026-08-03",
      },
    ]);
    expect(dupes.has(0)).toBe(false); // first occurrence is kept
    expect(dupes.has(1)).toBe(true); // second is the duplicate
  });

  it("does not flag identical canonical_url (already collapsed upstream)", () => {
    const dupes = findWithinBatchDuplicates([
      { canonical_url: "a", content_fingerprint: "x|y|z" },
      { canonical_url: "a", content_fingerprint: "x|y|z" },
    ]);
    expect(dupes.size).toBe(0);
  });

  it("catches org-drift dupes via title+deadline when a fingerprint differs", () => {
    // Same opportunity, org present on one row and blank on the other, so the
    // fingerprints differ — title similarity + compatible deadline still catch it.
    const dupes = findWithinBatchDuplicates([
      {
        canonical_url: "a",
        content_fingerprint: "chevening scholarship 2026|fcdo|2026-11-05",
        title: "Chevening Scholarship 2026",
        organization: "FCDO",
        close_date: "2026-11-05",
      },
      {
        canonical_url: "b",
        content_fingerprint: "chevening scholarship 2026||2026-11-05",
        title: "Chevening Scholarship 2026",
        organization: "",
        close_date: "2026-11-06",
      },
    ]);
    expect(dupes.has(1)).toBe(true);
  });

  it("keeps genuinely different opportunities", () => {
    const dupes = findWithinBatchDuplicates([
      {
        canonical_url: "a",
        content_fingerprint: "mandela rhodes|mrf|2026-04-01",
        title: "Mandela Rhodes Scholarship",
        organization: "MRF",
        close_date: "2026-04-01",
      },
      {
        canonical_url: "b",
        content_fingerprint: "chevening|fcdo|2026-11-05",
        title: "Chevening Scholarship",
        organization: "FCDO",
        close_date: "2026-11-05",
      },
    ]);
    expect(dupes.size).toBe(0);
  });
});

describe("OpportunityDedupService pure helpers", () => {
  describe("normalizeTitleTokens", () => {
    it("lowercases, strips punctuation and years", () => {
      expect(
        normalizeTitleTokens("Mandela Rhodes Scholarship 2026 — Apply Now!"),
      ).toEqual(["mandela", "rhodes", "scholarship", "apply", "now"]);
    });

    it("strips year ranges like 2025/26", () => {
      expect(normalizeTitleTokens("MTN Bursary 2025/26")).toEqual([
        "mtn",
        "bursary",
      ]);
    });

    it("drops single-character tokens", () => {
      expect(normalizeTitleTokens("A B Fellowship")).toEqual(["fellowship"]);
    });
  });

  describe("titleSimilarity", () => {
    it("returns 1 for identical titles", () => {
      expect(
        titleSimilarity("Chevening Scholarship", "Chevening Scholarship"),
      ).toBe(1);
    });

    it("ignores year and punctuation differences", () => {
      expect(
        titleSimilarity(
          "Chevening Scholarship 2025",
          "Chevening Scholarship 2026!",
        ),
      ).toBe(1);
    });

    it("scores near-duplicates above the threshold", () => {
      const score = titleSimilarity(
        "Mastercard Foundation Scholars Program at University of Ghana",
        "Mastercard Foundation Scholars Program – University of Ghana",
      );
      expect(score).toBeGreaterThanOrEqual(TITLE_SIMILARITY_THRESHOLD);
    });

    it("scores unrelated titles below the threshold", () => {
      const score = titleSimilarity(
        "Google Africa Developer Scholarship",
        "UN Volunteers Internship Kenya",
      );
      expect(score).toBeLessThan(TITLE_SIMILARITY_THRESHOLD);
    });

    it("returns 0 when either title is empty", () => {
      expect(titleSimilarity("", "Anything")).toBe(0);
      expect(titleSimilarity("Anything", "")).toBe(0);
    });
  });

  describe("normalizeOrganization", () => {
    it("lowercases and collapses whitespace", () => {
      expect(normalizeOrganization("  United   Nations ")).toBe(
        "united nations",
      );
      expect(normalizeOrganization(null)).toBe("");
    });
  });

  describe("deadlinesCompatible", () => {
    it("matches when both absent", () => {
      expect(deadlinesCompatible(null, null)).toBe(true);
    });

    it("does not match when only one is absent", () => {
      expect(deadlinesCompatible("2026-08-01", null)).toBe(false);
    });

    it("matches within 3 days, rejects beyond", () => {
      expect(deadlinesCompatible("2026-08-01", "2026-08-04")).toBe(true);
      expect(deadlinesCompatible("2026-08-01", "2026-08-05")).toBe(false);
    });

    it("rejects unparsable dates", () => {
      expect(deadlinesCompatible("not-a-date", "2026-08-01")).toBe(false);
    });
  });

  describe("registrableDomain", () => {
    it("extracts eTLD+1 and strips www", () => {
      expect(registrableDomain("https://www.example.com/apply")).toBe(
        "example.com",
      );
      expect(registrableDomain("https://jobs.example.com/x?y=1")).toBe(
        "example.com",
      );
    });

    it("handles multi-part TLDs", () => {
      expect(registrableDomain("https://apply.uni.ac.uk/scholarship")).toBe(
        "uni.ac.uk",
      );
      expect(registrableDomain("https://portal.firstbank.com.ng/careers")).toBe(
        "firstbank.com.ng",
      );
    });

    it("returns null for invalid or empty input", () => {
      expect(registrableDomain("not a url")).toBeNull();
      expect(registrableDomain(null)).toBeNull();
      expect(registrableDomain(undefined)).toBeNull();
    });
  });

  describe("decideDomainTrust", () => {
    it("leaves established domains alone", () => {
      expect(decideDomainTrust("active", "example.com", 3, true)).toEqual({
        status: "active",
        capped: false,
      });
    });

    it("caps new domains at pending_review", () => {
      expect(decideDomainTrust("active", "brand-new.org", 0, true)).toEqual({
        status: "pending_review",
        capped: true,
      });
      expect(decideDomainTrust("active", "almost.org", 2, true)).toEqual({
        status: "pending_review",
        capped: true,
      });
    });

    it("caps rows with no parsable apply domain", () => {
      expect(decideDomainTrust("active", null, 0, true)).toEqual({
        status: "pending_review",
        capped: true,
      });
    });

    it("never touches rows that are not about to publish", () => {
      expect(decideDomainTrust("pending_review", "new.org", 0, true)).toEqual({
        status: "pending_review",
        capped: false,
      });
    });

    it("is a no-op when the gate is disabled", () => {
      expect(decideDomainTrust("active", "new.org", 0, false)).toEqual({
        status: "active",
        capped: false,
      });
    });
  });

  describe("isDomainTrustGateEnabled", () => {
    it("defaults ON when unset", () => {
      expect(isDomainTrustGateEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    });

    it("respects explicit opt-out values", () => {
      for (const v of ["false", "0", "off", "no", "disabled"]) {
        expect(
          isDomainTrustGateEnabled({
            SCRAPER_DOMAIN_TRUST_GATE: v,
          } as NodeJS.ProcessEnv),
        ).toBe(false);
      }
    });

    it("treats any other value as ON", () => {
      expect(
        isDomainTrustGateEnabled({
          SCRAPER_DOMAIN_TRUST_GATE: "true",
        } as NodeJS.ProcessEnv),
      ).toBe(true);
    });
  });
});

describe("OpportunityDedupService (no Supabase configured)", () => {
  let service: OpportunityDedupService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    service = new OpportunityDedupService();
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
  });

  it("annotateDuplicates is a safe no-op", async () => {
    const records = [{ title: "X", status: "active" }];
    const summary = await service.annotateDuplicates(records);
    expect(summary.duplicates).toBe(0);
    expect(records[0].status).toBe("active");
    expect((records[0] as any).duplicate_of).toBeUndefined();
  });

  it("applyDomainTrustGate is a safe no-op", async () => {
    const records = [
      { status: "active", apply_url: "https://brand-new.org/apply" },
    ];
    const result = await service.applyDomainTrustGate(records);
    expect(result.capped).toBe(0);
    expect(records[0].status).toBe("active");
  });
});
