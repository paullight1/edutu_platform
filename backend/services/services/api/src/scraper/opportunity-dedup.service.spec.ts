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
  findWithinBatchDuplicates,
} from "./opportunity-dedup.service";

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

describe("OpportunityDedupService.annotateDuplicates — Tier 2", () => {
  /**
   * Minimal PostgREST-shaped stub. `.or()` is where Tier 2 narrows candidates;
   * we just hand back the fixture rows and assert on what the real filter
   * (Dice similarity + deadline) decides.
   */
  const serviceWithRows = (rows: unknown[]) => {
    const service = new OpportunityDedupService();
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "in", "or", "limit", "eq"]) {
      (builder as any)[method] = jest.fn(() => builder);
    }
    (builder as any).then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: rows, error: null });
    (service as any).supabase = { from: jest.fn(() => builder) };
    return service;
  };

  const existing = {
    id: "existing-1",
    canonical_url: "https://sheleadsafrica.org/boostherform",
    content_fingerprint: "fp-existing",
    title: "2025 She Leads Africa BoostHer Training Program | Christmas Promo",
    organization: "She Leads Africa",
    close_date: null,
  };

  it("flags a duplicate even when neither row has an organisation", async () => {
    // The regression this guards: Tier 2 used to look candidates up by
    // organisation, so a null organiser skipped the record entirely. The
    // scraper now stores null far more often, and the legacy aggregator cohort
    // had no organiser at all — that is how visible duplicates survived.
    const service = serviceWithRows([{ ...existing, organization: null }]);
    const incoming = {
      canonical_url: "https://jobs.smartyacad.com/2025-she-leads-africa",
      content_fingerprint: null,
      title:
        "2025 She Leads Africa BoostHer Training Program | Christmas Promo",
      organization: null,
      close_date: null,
    };

    const summary = await service.annotateDuplicates([incoming as any]);

    expect(summary.duplicates).toBe(1);
    expect((incoming as any).duplicate_of).toBe("existing-1");
    expect((incoming as any).status).toBe("pending_review");
    expect((incoming as any).metadata.dedup.matchedBy).toBe("title_deadline");
  });

  it("still flags when the two rows disagree about the organisation", async () => {
    const service = serviceWithRows([existing]);
    const incoming = {
      canonical_url: "https://jobs.smartyacad.com/2025-she-leads-africa",
      content_fingerprint: null,
      title:
        "2025 She Leads Africa BoostHer Training Program | Christmas Promo",
      organization: "Program Organizer",
      close_date: null,
    };

    const summary = await service.annotateDuplicates([incoming as any]);
    expect(summary.duplicates).toBe(1);
  });

  it("flags the same title and deadline across different source fingerprints", async () => {
    const titleFingerprint = "global scholarship|2026-11-05";
    const service = serviceWithRows([
      {
        ...existing,
        title: "Global Scholarship",
        close_date: "2026-11-05",
        title_fingerprint: titleFingerprint,
      },
    ]);
    const incoming = {
      canonical_url: "https://another-aggregator.example/global-scholarship",
      content_fingerprint: "global scholarship|Different Source|2026-11-05",
      title_fingerprint: titleFingerprint,
      title: "Global Scholarship",
      organization: "Different Source",
      close_date: "2026-11-05",
    };

    const summary = await service.annotateDuplicates([incoming as any]);

    expect(summary.byTitleFingerprint).toBe(1);
    expect((incoming as any).duplicate_of).toBe("existing-1");
    expect((incoming as any).metadata.dedup.matchedBy).toBe(
      "title_fingerprint",
    );
  });

  it("leaves a genuinely different opportunity alone", async () => {
    const service = serviceWithRows([existing]);
    const incoming = {
      canonical_url: "https://example.org/other",
      content_fingerprint: null,
      title: "Chevening Scholarship 2027 for Postgraduate Study in the UK",
      organization: null,
      close_date: null,
    };

    const summary = await service.annotateDuplicates([incoming as any]);
    expect(summary.duplicates).toBe(0);
    expect((incoming as any).duplicate_of).toBeUndefined();
  });

  it("does not flag the same canonical_url as its own duplicate", async () => {
    const service = serviceWithRows([existing]);
    const incoming = {
      canonical_url: existing.canonical_url,
      content_fingerprint: null,
      title: existing.title,
      organization: null,
      close_date: null,
    };

    const summary = await service.annotateDuplicates([incoming as any]);
    expect(summary.duplicates).toBe(0);
  });
});
