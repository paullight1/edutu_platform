import {
  extractStaticOpportunityRows,
  filterStaticOpportunityRows,
  normaliseStaticOpportunityRow,
  pickOpportunityUrl,
  withOpportunityUrlAliases,
} from "./opportunity-static-snapshot";

describe("opportunity static snapshot helpers", () => {
  it("normalises legacy fields without changing canonical values", () => {
    const row = normaliseStaticOpportunityRow({
      id: "opp-1",
      title: "Remote fellowship",
      applicationUrl: " https://example.test/apply ",
      location: "Remote / Africa",
      deadline: "2026-09-01",
    });

    expect(row).toMatchObject({
      id: "opp-1",
      application_url: "https://example.test/apply",
      applicationUrl: "https://example.test/apply",
      apply_url: "https://example.test/apply",
      applyUrl: "https://example.test/apply",
      link: "https://example.test/apply",
      close_date: "2026-09-01",
      is_remote: true,
      status: "active",
      source: "static-snapshot",
    });
    expect(row.updated_at).toBeDefined();
    expect(row.created_at).toBe(row.updated_at);
  });

  it("preserves existing aliases and uses metadata as a fallback", () => {
    expect(
      withOpportunityUrlAliases({
        application_url: "https://canonical.test/apply",
        applyUrl: "https://legacy.test/apply",
        metadata: { url: "https://metadata.test/apply" },
      }),
    ).toMatchObject({
      application_url: "https://canonical.test/apply",
      apply_url: "https://canonical.test/apply",
      applicationUrl: "https://canonical.test/apply",
      applyUrl: "https://legacy.test/apply",
      link: "https://canonical.test/apply",
    });

    expect(pickOpportunityUrl(null, "  ", "https://example.test")).toBe(
      "https://example.test",
    );
  });

  it("recognizes the committed snapshot opportunities envelope", () => {
    const verified = {
      id: "verified",
      status: "active",
      verification_status: "verified",
    };

    expect(
      extractStaticOpportunityRows({
        opportunities: [verified],
        metadata: { generatedAt: "2026-08-21T00:00:00.000Z" },
      }),
    ).toEqual([verified]);
  });

  it("keeps compatibility with raw arrays and the legacy data envelope", () => {
    const row = { id: "one" };
    expect(extractStaticOpportunityRows([row])).toEqual([row]);
    expect(extractStaticOpportunityRows({ data: [row] })).toEqual([row]);
    expect(extractStaticOpportunityRows({ opportunities: "bad" })).toEqual([]);
  });

  it("filters active/all rows by category and applies pagination", () => {
    const rows = [
      {
        id: "1",
        status: "active",
        verification_status: "verified",
        category: "Scholarship",
      },
      { id: "2", status: "closed", category: "Scholarship" },
      {
        id: "3",
        status: "active",
        verification_status: "verified",
        category: "Internship",
      },
      {
        id: "4",
        status: "active",
        verification_status: "verified",
        category: "Scholarship",
      },
    ];

    expect(
      filterStaticOpportunityRows(rows, 1, 1, "active", "scholarship"),
    ).toEqual([
      {
        id: "4",
        status: "active",
        verification_status: "verified",
        category: "Scholarship",
      },
    ]);
    expect(filterStaticOpportunityRows(rows, 10, 0, "all")).toHaveLength(4);
    expect(filterStaticOpportunityRows(rows, 10, 0, "closed")).toEqual([]);
  });

  it("requires explicit verification for active snapshot rows", () => {
    expect(
      filterStaticOpportunityRows(
        [
          { id: "legacy", status: "active" },
          {
            id: "submitted",
            status: "active",
            verification_status: "verified",
            metadata: { submission_id: "submission-1" },
          },
          {
            id: "unverified",
            status: "active",
            verification_status: "unverified",
          },
          {
            id: "verified",
            status: "active",
            verification_status: "verified",
          },
        ],
        10,
        0,
        "active",
      ),
    ).toEqual([
      {
        id: "submitted",
        status: "active",
        verification_status: "verified",
        metadata: { submission_id: "submission-1" },
      },
      {
        id: "verified",
        status: "active",
        verification_status: "verified",
      },
    ]);
  });
});
