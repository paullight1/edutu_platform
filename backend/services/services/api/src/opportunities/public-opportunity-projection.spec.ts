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
