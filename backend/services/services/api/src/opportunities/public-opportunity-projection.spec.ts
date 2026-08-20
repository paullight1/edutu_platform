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
      verificationMethod: null,
      sourceDomain: "apply.example.com",
    });
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
});
