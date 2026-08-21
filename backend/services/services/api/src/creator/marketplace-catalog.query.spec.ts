import { PgDialect } from "drizzle-orm/pg-core";
import {
  buildMarketplaceEnrollmentListQuery,
  buildPublicMarketplaceCatalogQuery,
  buildPublicMarketplaceDetailQuery,
  decodeMarketplaceCursor,
  encodeMarketplaceCursor,
} from "./marketplace-catalog.query";

const dialect = new PgDialect();

function render(query: ReturnType<typeof buildPublicMarketplaceCatalogQuery>) {
  return dialect.sqlToQuery(query).sql.toLowerCase();
}

describe("marketplace public catalogue SQL", () => {
  it("publishes only active listings from currently approved sellers", () => {
    const sql = render(
      buildPublicMarketplaceCatalogQuery({
        q: "scholarship",
        category: "mentorship",
        type: "paid",
        limit: 20,
      }),
    );

    expect(sql).toContain("marketplace_listings");
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain("creator_status = 'approved'");
    expect(sql).toContain("mentor_status = 'approved'");
    expect(sql).toContain("clerk_id_to_uuid");
    expect(sql).not.toContain('as "sellerid"');
    expect(sql).not.toContain('as "email"');
  });

  it("never exposes the learner fulfillment URL in the public projection", () => {
    const sql = render(buildPublicMarketplaceCatalogQuery({ limit: 20 }));

    expect(sql).not.toContain('l.preview_url as "previewurl"');
    expect(sql).toContain('null::text as "previewurl"');
  });

  it("returns the protected fulfillment URL only with the buyer enrollment list", () => {
    const sql = dialect
      .sqlToQuery(
        buildMarketplaceEnrollmentListQuery(
          "11111111-1111-4111-8111-111111111111",
        ),
      )
      .sql.toLowerCase();

    expect(sql).toContain('l.preview_url as "accessurl"');
    expect(sql).toContain("where e.user_id");
  });

  it("uses a stable created-at/id cursor for keyset pagination", () => {
    const cursor = encodeMarketplaceCursor({
      v: 1,
      createdAt: "2026-08-21T07:00:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
    });

    expect(decodeMarketplaceCursor(cursor)).toEqual({
      v: 1,
      createdAt: "2026-08-21T07:00:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
    });
    expect(
      render(buildPublicMarketplaceCatalogQuery({ cursor, limit: 20 })),
    ).toContain("created_at <");
  });

  it("requires active/approved trust gates for public detail too", () => {
    const sql = dialect
      .sqlToQuery(
        buildPublicMarketplaceDetailQuery(
          "11111111-1111-4111-8111-111111111111",
        ),
      )
      .sql.toLowerCase();

    expect(sql).toContain("status = 'active'");
    expect(sql).toContain("creator_status = 'approved'");
    expect(sql).toContain("mentor_status = 'approved'");
  });
});
