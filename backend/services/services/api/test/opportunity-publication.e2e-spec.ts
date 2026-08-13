import { isPublicOpportunityRow } from "../src/opportunities/opportunity-visibility";

type FixtureOpportunity = {
  id: string;
  title: string;
  category: string;
  status: string;
  verification_status?: string | null;
  metadata?: Record<string, unknown>;
};

type ListQuery = {
  q?: string;
  category?: string;
  limit?: number;
  offset?: number;
};

/** Disposable catalog used by both simulated learner and partner reads. */
class PublicationFixture {
  constructor(private readonly rows: FixtureOpportunity[]) {}

  list(query: ListQuery = {}) {
    const normalizedQuery = query.q?.trim().toLowerCase();
    const publicRows = this.rows
      .filter((row) => isPublicOpportunityRow(row))
      .filter((row) => !query.category || row.category === query.category)
      .filter(
        (row) =>
          !normalizedQuery || row.title.toLowerCase().includes(normalizedQuery),
      );
    const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);
    const data = publicRows.slice(offset, offset + limit);
    const hasMore = offset + data.length < publicRows.length;

    return {
      object: "list",
      data,
      meta: {
        limit,
        offset,
        nextOffset: hasMore ? offset + data.length : null,
        nextCursor: hasMore ? `fixture-cursor-${offset + data.length}` : null,
        total: publicRows.length,
        hasMore,
      },
    };
  }
}

const publishedSubmission: FixtureOpportunity = {
  id: "submission-opportunity-1",
  title: "Global founder fellowship",
  category: "Fellowship",
  status: "active",
  verification_status: "verified",
  metadata: {
    submission_id: "submission-1",
    submission_review_status: "approved",
  },
};

describe("global opportunity publication contract (disposable fixture)", () => {
  const catalog = new PublicationFixture([
    publishedSubmission,
    {
      id: "catalog-opportunity-1",
      title: "Verified scholarship",
      category: "Scholarship",
      status: "active",
      verification_status: "verified",
    },
    {
      id: "catalog-opportunity-2",
      title: "Verified scholarship two",
      category: "Scholarship",
      status: "active",
      verification_status: "verified",
    },
    {
      id: "pending-submission-1",
      title: "Pending user submission",
      category: "Fellowship",
      status: "active",
      verification_status: "unverified",
      metadata: { submission_id: "submission-pending" },
    },
    {
      id: "expired-1",
      title: "Expired opportunity",
      category: "Scholarship",
      status: "expired",
      verification_status: "verified",
    },
  ]);

  it("makes an approved, verified user submission visible to every consumer", () => {
    const learnerFeed = catalog.list({ q: "founder" });
    const partnerFeed = catalog.list({ q: "founder" });

    expect(learnerFeed.data.map((row) => row.id)).toEqual([
      "submission-opportunity-1",
    ]);
    expect(partnerFeed.data.map((row) => row.id)).toEqual(
      learnerFeed.data.map((row) => row.id),
    );
    expect(learnerFeed.data[0]?.metadata?.submission_review_status).toBe(
      "approved",
    );
  });

  it("keeps pending, expired, and unverified submissions out of public feeds", () => {
    const feed = catalog.list();
    expect(feed.data.map((row) => row.id)).toEqual([
      "submission-opportunity-1",
      "catalog-opportunity-1",
      "catalog-opportunity-2",
    ]);
    expect(isPublicOpportunityRow(catalogRow("pending-submission-1"))).toBe(
      false,
    );
    expect(isPublicOpportunityRow(catalogRow("expired-1"))).toBe(false);
  });

  it("preserves filter, limit/offset, total, and continuation contracts", () => {
    const firstPage = catalog.list({ category: "Scholarship", limit: 1 });
    expect(firstPage).toMatchObject({
      object: "list",
      data: [expect.objectContaining({ category: "Scholarship" })],
      meta: {
        limit: 1,
        offset: 0,
        nextOffset: 1,
        nextCursor: "fixture-cursor-1",
        total: 2,
        hasMore: true,
      },
    });

    const emptyPage = catalog.list({ category: "Scholarship", offset: 2 });
    expect(emptyPage.data).toEqual([]);
    expect(emptyPage.meta.nextOffset).toBeNull();
    expect(emptyPage.meta.nextCursor).toBeNull();
    expect(emptyPage.meta.total).toBe(2);
  });

  function catalogRow(id: string) {
    const result = catalog.list().data.find((row) => row.id === id);
    return (
      result ??
      ({
        ...({
          id,
          title: id,
          category: "Fellowship",
          status: id === "expired-1" ? "expired" : "active",
          verification_status: id === "expired-1" ? "verified" : "unverified",
          metadata: { submission_id: id },
        } satisfies FixtureOpportunity),
      } as FixtureOpportunity)
    );
  }
});
