import { and, eq, gte, isNull, or, sql } from "drizzle-orm";

type OpportunityVisibilityColumns = {
  status: unknown;
  verificationStatus: unknown;
};

type ShareableOpportunityColumns = OpportunityVisibilityColumns & {
  closeDate: unknown;
};

export const PUBLIC_OPPORTUNITY_STATUS = "active" as const;
export const PUBLIC_OPPORTUNITY_VERIFICATION_STATUS = "verified" as const;

function assertSqlAlias(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) {
    throw new Error("Invalid opportunity SQL alias");
  }
  return alias;
}

/** The only database predicate that makes a catalog opportunity public. */
export function publicOpportunitySql(alias = "o") {
  assertSqlAlias(alias);
  return sql.raw(
    `${alias}.status = '${PUBLIC_OPPORTUNITY_STATUS}' and ${alias}.verification_status = '${PUBLIC_OPPORTUNITY_VERIFICATION_STATUS}'`,
  );
}

/** Public catalogue/share predicate, including the product's expiry rule. */
export function shareableOpportunitySql(alias = "o") {
  assertSqlAlias(alias);
  return sql.raw(
    `${alias}.status = '${PUBLIC_OPPORTUNITY_STATUS}' and ${alias}.verification_status = '${PUBLIC_OPPORTUNITY_VERIFICATION_STATUS}' and (${alias}.close_date is null or ${alias}.close_date >= current_date)`,
  );
}

/** Drizzle equivalent of publicOpportunitySql for typed table queries. */
export function publicOpportunityConditions(
  columns: OpportunityVisibilityColumns,
) {
  return and(
    eq(columns.status as any, PUBLIC_OPPORTUNITY_STATUS),
    eq(
      columns.verificationStatus as any,
      PUBLIC_OPPORTUNITY_VERIFICATION_STATUS,
    ),
  )!;
}

/** Drizzle equivalent of shareableOpportunitySql for cards and selectors. */
export function shareableOpportunityConditions(
  columns: ShareableOpportunityColumns,
) {
  return and(
    publicOpportunityConditions(columns),
    or(
      isNull(columns.closeDate as any),
      gte(columns.closeDate as any, sql`current_date`),
    ),
  )!;
}

/**
 * Runtime catalogs and degraded static snapshots share one trust contract:
 * an opportunity is public only when it is active and explicitly verified.
 * The source argument remains for call-site compatibility, but no source may
 * weaken the verification requirement.
 */
export function isPublicOpportunityRow(
  row: Record<string, unknown>,
  source: "database" | "snapshot" = "database",
): boolean {
  void source;
  const status = String(row.status ?? "")
    .trim()
    .toLowerCase();
  if (status !== PUBLIC_OPPORTUNITY_STATUS) return false;

  const verification = row.verification_status ?? row.verificationStatus;
  return (
    String(verification ?? "")
      .trim()
      .toLowerCase() === PUBLIC_OPPORTUNITY_VERIFICATION_STATUS
  );
}
