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
  apply_url: "https://apply.example",
  // internal / paid-trust fields that must NOT leak
  original_json: '{"raw":"llm output"}',
  quality_score: 88,
  qualityScore: 88,
  verification_status: "verified",
  verification_attempts: 3,
  verification_error: "timeout",
  duplicate_of: "opp_2",
  content_fingerprint: "abc123",
  last_http_status: 200,
  broken_link_count: 0,
  created_by: "user_1",
  metadata: { scraper: "x" },
  source: "Opportunities Circle",
} as Record<string, unknown>;

describe("public-opportunity-projection", () => {
  it("keeps public/UI fields", () => {
    const out = stripInternalOpportunityFields(sampleRow);
    expect(out.id).toBe("opp_1");
    expect(out.title).toBe("Chevening Scholarship");
    expect(out.category).toBe("scholarships");
    expect(out.apply_url).toBe("https://apply.example");
  });

  it("drops internal and paid-trust fields (snake + camel)", () => {
    const out = stripInternalOpportunityFields(sampleRow);
    expect(out.original_json).toBeUndefined();
    expect(out.quality_score).toBeUndefined();
    expect(out.qualityScore).toBeUndefined();
    expect(out.verification_status).toBeUndefined();
    expect(out.verification_attempts).toBeUndefined();
    expect(out.verification_error).toBeUndefined();
    expect(out.duplicate_of).toBeUndefined();
    expect(out.content_fingerprint).toBeUndefined();
    expect(out.last_http_status).toBeUndefined();
    expect(out.broken_link_count).toBeUndefined();
    expect(out.created_by).toBeUndefined();
    expect(out.metadata).toBeUndefined();
    expect(out.source).toBeUndefined();
  });

  it("exposes a minimal trust block for user-facing credibility", () => {
    const out = stripInternalOpportunityFields({
      ...sampleRow,
      status: "active",
      last_verified_at: "2026-07-24T09:00:00.000Z",
      metadata: { deadline_confidence: "explicit" },
    });
    const trust = out.trust as Record<string, unknown>;
    expect(trust).toBeDefined();
    expect(trust.verified).toBe(true);
    expect(trust.lastVerifiedAt).toBe("2026-07-24T09:00:00.000Z");
    expect(trust.deadlineConfidence).toBe("explicit");
    // The raw internal fields still must not leak — only the curated block does.
    expect(out.verification_status).toBeUndefined();
    expect(out.last_verified_at).toBeUndefined();
    expect(out.metadata).toBeUndefined();
  });

  it("marks verified=false when the row is not verified+active", () => {
    const pending = stripInternalOpportunityFields({
      ...sampleRow,
      status: "pending_review",
      verification_status: "stale",
      last_verified_at: "2026-07-24T09:00:00.000Z",
    });
    expect((pending.trust as Record<string, unknown>).verified).toBe(false);
  });

  it("defaults deadlineConfidence to 'unknown' when absent", () => {
    const out = stripInternalOpportunityFields({
      ...sampleRow,
      metadata: {},
    });
    expect((out.trust as Record<string, unknown>).deadlineConfidence).toBe(
      "unknown",
    );
  });

  it("returns the same number of public fields for a batch", () => {
    const [first, second] = stripInternalOpportunityFieldsBatch([
      sampleRow,
      { id: "opp_2", title: "B", original_json: "x" },
    ]);
    expect(first.title).toBe("Chevening Scholarship");
    expect(first.original_json).toBeUndefined();
    expect(second.id).toBe("opp_2");
    expect(second.original_json).toBeUndefined();
  });
});
