import { and, eq, sql } from "drizzle-orm";

type OpportunityVisibilityColumns = {
  status: unknown;
  verificationStatus: unknown;
};

export const PUBLIC_OPPORTUNITY_STATUS = "active" as const;
export const PUBLIC_OPPORTUNITY_VERIFICATION_STATUS = "verified" as const;

/** The only database predicate that makes a catalog opportunity public. */
export function publicOpportunitySql(alias = "o") {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) {
    throw new Error("Invalid opportunity SQL alias");
  }
  return sql.raw(
    `${alias}.status = '${PUBLIC_OPPORTUNITY_STATUS}' and ${alias}.verification_status = '${PUBLIC_OPPORTUNITY_VERIFICATION_STATUS}'`,
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
