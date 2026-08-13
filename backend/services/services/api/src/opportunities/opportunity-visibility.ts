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

function isUserSubmissionRow(row: Record<string, unknown>): boolean {
  const metadata = row.metadata;
  return Boolean(
    (metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>).submission_id
      : undefined) ||
    row.submission_id ||
    row.submissionId ||
    row.source === "user_submission",
  );
}

/**
 * Snapshot fallback compatibility is intentionally narrower than database
 * compatibility: rows with no verification field are legacy snapshot rows,
 * but a user-submission provenance marker always requires explicit verified.
 */
export function isPublicOpportunityRow(
  row: Record<string, unknown>,
  source: "database" | "snapshot" = "database",
): boolean {
  const status = String(row.status ?? "")
    .trim()
    .toLowerCase();
  if (status !== "active") return false;

  const verification = row.verification_status ?? row.verificationStatus;
  if (
    String(verification ?? "")
      .trim()
      .toLowerCase() === "verified"
  ) {
    return true;
  }

  return (
    source === "snapshot" && verification == null && !isUserSubmissionRow(row)
  );
}
