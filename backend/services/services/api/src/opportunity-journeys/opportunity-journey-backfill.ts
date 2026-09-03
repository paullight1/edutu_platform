import type { OpportunityJourneyCompatibilityService } from "./opportunity-journey-compatibility.service";

export interface OpportunityJourneyBackfillOptions {
  write: boolean;
  limit: number;
  afterUserId: string | null;
}

export interface OpportunityJourneyBackfillReport {
  mode: "dry-run" | "write";
  usersScanned: number;
  usersWithMismatches: number;
  mismatches: number;
  imported: number;
  updated: number;
  skipped: number;
  unsupported: number;
  failures: Array<{ userId: string; message: string }>;
  nextAfterUserId: string | null;
}

export function parseOpportunityJourneyBackfillArgs(
  args: string[],
): OpportunityJourneyBackfillOptions {
  let write = false;
  let limit = 500;
  let afterUserId: string | null = null;

  for (const argument of args) {
    if (argument === "--write") write = true;
    if (argument === "--dry-run") write = false;
    if (argument.startsWith("--limit=")) {
      const parsed = Number(argument.slice("--limit=".length));
      if (Number.isFinite(parsed)) limit = Math.trunc(parsed);
    }
    if (argument.startsWith("--after-user-id=")) {
      afterUserId = argument.slice("--after-user-id=".length).trim() || null;
    }
  }

  return {
    write,
    limit: Math.min(Math.max(limit, 1), 5_000),
    afterUserId,
  };
}

export async function runOpportunityJourneyBackfill(
  compatibility: Pick<
    OpportunityJourneyCompatibilityService,
    "listLegacyUserIds" | "auditUserParity" | "reconcileUser"
  >,
  options: OpportunityJourneyBackfillOptions,
): Promise<OpportunityJourneyBackfillReport> {
  const userIds = await compatibility.listLegacyUserIds({
    limit: options.limit,
    afterUserId: options.afterUserId,
  });
  const report: OpportunityJourneyBackfillReport = {
    mode: options.write ? "write" : "dry-run",
    usersScanned: 0,
    usersWithMismatches: 0,
    mismatches: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    unsupported: 0,
    failures: [],
    nextAfterUserId: userIds.at(-1) ?? null,
  };

  for (const userId of userIds) {
    report.usersScanned += 1;
    try {
      if (options.write) {
        const result = await compatibility.reconcileUser(userId);
        report.imported += result.imported;
        report.updated += result.updated;
        report.skipped += result.skipped;
        report.unsupported += result.unsupported;
      } else {
        const audit = await compatibility.auditUserParity(userId);
        report.mismatches += audit.mismatches.length;
        if (audit.mismatches.length > 0) report.usersWithMismatches += 1;
      }
    } catch (error) {
      report.failures.push({
        userId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}
