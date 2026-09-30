import { and, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";

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

/** Current public visibility rule used by discovery lists. */
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

/** Detail pages retain links to verified opportunities after they close. */
export function publicOpportunityDetailConditions(
  columns: OpportunityVisibilityColumns,
) {
  return or(
    and(
      eq(columns.status as any, PUBLIC_OPPORTUNITY_STATUS),
      eq(
        columns.verificationStatus as any,
        PUBLIC_OPPORTUNITY_VERIFICATION_STATUS,
      ),
    ),
    and(
      eq(columns.status as any, "closed"),
      inArray(columns.verificationStatus as any, [
        PUBLIC_OPPORTUNITY_VERIFICATION_STATUS,
        "expired",
      ]),
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

/** Active, verified records remain valid even when annotated as duplicates. */
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

/** Direct links stay available for verified or deadline-expired closed rows. */
export function isPublicOpportunityDetailRow(
  row: Record<string, unknown>,
): boolean {
  const status = String(row.status ?? "")
    .trim()
    .toLowerCase();
  const verification = row.verification_status ?? row.verificationStatus;

  const verificationStatus = String(verification ?? "")
    .trim()
    .toLowerCase();

  return (
    (status === PUBLIC_OPPORTUNITY_STATUS &&
      verificationStatus === PUBLIC_OPPORTUNITY_VERIFICATION_STATUS) ||
    (status === "closed" &&
      (verificationStatus === PUBLIC_OPPORTUNITY_VERIFICATION_STATUS ||
        verificationStatus === "expired"))
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
