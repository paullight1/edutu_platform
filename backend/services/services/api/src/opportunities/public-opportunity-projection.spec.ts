import {
  stripInternalOpportunityFields,
  stripInternalOpportunityFieldsBatch,
} from "./public-opportunity-projection";

const sampleRow = {
  id: "opp_1",
  title: "Chevening Scholarship",
  summary: "Fully funded",
  category: "scholarships",
  deadline: "2026-11-05",
  apply_url: "https://apply.example/path",
  source_url: "https://www.example.org/opportunity",
  original_json: '{"raw":"llm output"}',
  quality_score: 88,
  qualityScore: 88,
  verification_status: "verified",
  last_verified_at: "2026-08-20T12:00:00.000Z",
  verification_attempts: 3,
  verification_error: "timeout",
  duplicate_of: "opp_2",
  content_fingerprint: "abc123",
  last_http_status: 200,
  broken_link_count: 0,
  created_by: "user_1",
  metadata: {
    scraper: "x",
    deadline_confidence: "explicit",
    verification_method: "official_source_http",
  },
  source: "Opportunities Circle",
  provider_id: "provider-1",
} as Record<string, unknown>;

describe("public-opportunity-projection", () => {
  it("keeps public/UI fields and learner-safe trust evidence", () => {
    const out = stripInternalOpportunityFields(sampleRow);
    expect(out.id).toBe("opp_1");
    expect(out.title).toBe("Chevening Scholarship");
    expect(out.category).toBe("scholarships");
    expect(out.apply_url).toBe("https://apply.example/path");
    expect(out.trust).toEqual({
      verificationStatus: "verified",
      lastVerifiedAt: "2026-08-20T12:00:00.000Z",
      deadlineConfidence: "explicit",
      deadlineNeedsReview: false,
      verificationMethod: "official_source_http",
      sourceDomain: "example.org",
    });
  });

  it("drops internal fields while retaining the safe trust summary", () => {
    const out = stripInternalOpportunityFields(sampleRow);
    expect(out.original_json).toBeUndefined();
    expect(out.quality_score).toBeUndefined();
    expect(out.qualityScore).toBeUndefined();
    expect(out.verification_status).toBeUndefined();
    expect(out.last_verified_at).toBeUndefined();
    expect(out.verification_attempts).toBeUndefined();
    expect(out.verification_error).toBeUndefined();
    expect(out.duplicate_of).toBeUndefined();
    expect(out.content_fingerprint).toBeUndefined();
    expect(out.last_http_status).toBeUndefined();
    expect(out.broken_link_count).toBeUndefined();
    expect(out.created_by).toBeUndefined();
    expect(out.metadata).toBeUndefined();
    expect(out.source).toBeUndefined();
    expect(out.provider_id).toBeUndefined();
    expect(out.trust).toBeDefined();
  });

  it("never invents verification confidence when evidence is absent", () => {
    const out = stripInternalOpportunityFields({
      id: "opp_2",
      application_url: "https://apply.example.com/form",
    });
    expect(out.trust).toEqual({
      verificationStatus: "unverified",
      lastVerifiedAt: null,
      deadlineConfidence: null,
      deadlineNeedsReview: false,
      verificationMethod: null,
      sourceDomain: "apply.example.com",
    });
  });

  it("unwraps stored AddToAny URLs before sending public source and apply links", () => {
    const shareUrl = new URL("https://www.addtoany.com/add_to/x");
    shareUrl.searchParams.set(
      "linkurl",
      "https://opportunitypool.org/example-opportunity/",
    );
    const out = stripInternalOpportunityFields({
      id: "opp_3",
      title: "Example Opportunity",
      source_url: shareUrl.toString(),
      canonical_url: shareUrl.toString(),
      application_url: shareUrl.toString(),
      apply_url: shareUrl.toString(),
    });

    expect(out.source_url).toBe(
      "https://opportunitypool.org/example-opportunity/",
    );
    expect(out.canonical_url).toBe(
      "https://opportunitypool.org/example-opportunity/",
    );
    expect(out.application_url).toBe(
      "https://opportunitypool.org/example-opportunity/",
    );
    expect(out.apply_url).toBe(
      "https://opportunitypool.org/example-opportunity/",
    );
    expect(out.trust).toMatchObject({ sourceDomain: "opportunitypool.org" });
  });

  it("replaces legacy bare AddToAny canonical URLs with a usable source URL", () => {
    const sourceUrl = "https://opportunitypool.org/example-opportunity/";
    const out = stripInternalOpportunityFields({
      id: "opp_4",
      title: "Example Opportunity",
      source_url: sourceUrl,
      canonical_url: "https://www.addtoany.com/add_to/x",
    });

    expect(out.source_url).toBe(sourceUrl);
    expect(out.canonical_url).toBe(sourceUrl);
  });

  it("returns a safe projection for every row in a batch", () => {
    const [first, second] = stripInternalOpportunityFieldsBatch([
      sampleRow,
      { id: "opp_2", title: "B", original_json: "x" },
    ]);
    expect(first.title).toBe("Chevening Scholarship");
    expect(first.original_json).toBeUndefined();
    expect(second.id).toBe("opp_2");
    expect(second.original_json).toBeUndefined();
    expect(second.trust).toBeDefined();
  });

  it("removes a stale prose deadline that conflicts with the structured date", () => {
    const out = stripInternalOpportunityFields({
      title: "Foundation Scholarship 2026",
      description:
        "Applications are open to Nigerian undergraduates. The application deadline is September 18, 2026.",
      summary: "Apply before September 18, 2026.",
      close_date: "2026-10-15",
    });

    expect(out.description).toBe(
      "Applications are open to Nigerian undergraduates.",
    );
    expect(out.summary).toBe("");
    expect(out.close_date).toBe("2026-10-15");
    expect(out.trust).toMatchObject({ deadlineNeedsReview: true });
  });

  it("keeps prose when it agrees with the structured deadline", () => {
    const out = stripInternalOpportunityFields({
      description: "The application deadline is October 15, 2026.",
      close_date: "2026-10-15",
    });

    expect(out.description).toBe(
      "The application deadline is October 15, 2026.",
    );
  });

  it("removes an impossible year that conflicts with the canonical deadline", () => {
    const out = stripInternalOpportunityFields({
      title: "Yale World Fellows Program 2027",
      summary:
        "Application Deadline: December 2, 2926. Applications are open now.",
      description:
        "The application deadline is December 2, 2926. Applications close. Visit the official site.",
      close_date: "2026-12-02",
    });

    expect(out.summary).toBe("Applications are open now.");
    expect(out.description).toBe("Visit the official site.");
    expect(out.trust).toMatchObject({ deadlineNeedsReview: true });
  });
});
