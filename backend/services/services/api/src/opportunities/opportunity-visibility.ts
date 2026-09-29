import { and, eq, gte, isNull, or, sql } from "drizzle-orm";

type OpportunityVisibilityColumns = {
  status: unknown;
  verificationStatus: unknown;
};

type DiscoverableOpportunityColumns = OpportunityVisibilityColumns & {
  duplicateOf: unknown;
};

type ShareableOpportunityColumns = DiscoverableOpportunityColumns & {
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

/** Base visibility rule used by direct detail lookups and historical links. */
export function publicOpportunitySql(alias = "o") {
  assertSqlAlias(alias);
  return sql.raw(
    `${alias}.status = '${PUBLIC_OPPORTUNITY_STATUS}' and ${alias}.verification_status = '${PUBLIC_OPPORTUNITY_VERIFICATION_STATUS}'`,
  );
}

/** Discovery rule shared by public lists, search and recommendation queries. */
export function discoverableOpportunitySql(alias = "o") {
  assertSqlAlias(alias);
  return sql`(${publicOpportunitySql(alias)}) and ${sql.raw(`${alias}.duplicate_of is null`)}`;
}

/** Public catalog/share predicate, including expiry and duplicate rules. */
export function shareableOpportunitySql(alias = "o") {
  assertSqlAlias(alias);
  return sql.raw(
    `${alias}.status = '${PUBLIC_OPPORTUNITY_STATUS}' and ${alias}.verification_status = '${PUBLIC_OPPORTUNITY_VERIFICATION_STATUS}' and ${alias}.duplicate_of is null and (${alias}.close_date is null or ${alias}.close_date >= current_date)`,
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

/** Drizzle equivalent of discoverableOpportunitySql for browse and recs. */
export function discoverableOpportunityConditions(
  columns: DiscoverableOpportunityColumns,
) {
  return and(
    publicOpportunityConditions(columns),
    isNull(columns.duplicateOf as any),
  )!;
}

/** Drizzle equivalent of shareableOpportunitySql for cards and selectors. */
export function shareableOpportunityConditions(
  columns: ShareableOpportunityColumns,
) {
  return and(
    discoverableOpportunityConditions(columns),
    or(
      isNull(columns.closeDate as any),
      gte(columns.closeDate as any, sql`current_date`),
    ),
  )!;
}

/**
 * Runtime direct-detail lookups allow an existing duplicate link to remain
 * usable. Discovery lists use isDiscoverableOpportunityRow below.
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

/** Discovery and static catalog rows must never promote annotated duplicates. */
export function isDiscoverableOpportunityRow(
  row: Record<string, unknown>,
  source: "database" | "snapshot" = "database",
): boolean {
  return (
    isPublicOpportunityRow(row, source) &&
    (row.duplicate_of ?? row.duplicateOf) == null
  );
}
