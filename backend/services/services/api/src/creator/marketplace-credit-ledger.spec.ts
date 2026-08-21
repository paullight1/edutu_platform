import { PgDialect } from "drizzle-orm/pg-core";
import {
  marketplaceEarningsTotalQuery,
  marketplaceLedgerEntryQuery,
  marketplaceLedgerHistoryQuery,
} from "./marketplace-credit-ledger";

const dialect = new PgDialect();

function toSql(query: ReturnType<typeof marketplaceLedgerEntryQuery>): string {
  return dialect.sqlToQuery(query).sql.toLowerCase();
}

describe("marketplace credit ledger", () => {
  it("writes marketplace accounting to the canonical credit_transactions ledger", () => {
    const query = marketplaceLedgerEntryQuery({
      userId: "11111111-1111-4111-8111-111111111111",
      amount: -100,
      type: "marketplace_purchase",
      listingId: "22222222-2222-4222-8222-222222222222",
      description: "Purchased: Application clinic",
    });

    const rendered = toSql(query);
    expect(rendered).toContain("insert into public.credit_transactions");
    expect(rendered).toContain("related_type");
    expect(rendered).not.toContain("insert into public.transactions");
  });

  it("reads creator earnings and wallet history from the same canonical ledger", () => {
    const earnings = dialect
      .sqlToQuery(
        marketplaceEarningsTotalQuery("11111111-1111-4111-8111-111111111111"),
      )
      .sql.toLowerCase();
    const history = dialect
      .sqlToQuery(
        marketplaceLedgerHistoryQuery(
          "11111111-1111-4111-8111-111111111111",
          30,
        ),
      )
      .sql.toLowerCase();

    expect(earnings).toContain("from public.credit_transactions");
    expect(earnings).toContain("creator_earning");
    expect(history).toContain("from public.credit_transactions");
    expect(history).toContain("order by created_at desc");
  });
});
