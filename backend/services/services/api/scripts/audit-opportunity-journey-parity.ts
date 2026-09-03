import { db } from "../src/db";
import { OpportunityJourneyCompatibilityService } from "../src/opportunity-journeys/opportunity-journey-compatibility.service";
import { DatabaseOpportunityJourneyLegacyStore } from "../src/opportunity-journeys/opportunity-journey-legacy.store";
import { OpportunityJourneyOperationsRepository } from "../src/opportunity-journeys/opportunity-journey-operations.repository";
import { parseOpportunityJourneyBackfillArgs } from "../src/opportunity-journeys/opportunity-journey-backfill";

async function main() {
  const options = parseOpportunityJourneyBackfillArgs([
    "--dry-run",
    ...process.argv.slice(2).filter((argument) => argument !== "--write"),
  ]);
  const service = new OpportunityJourneyCompatibilityService(
    new OpportunityJourneyOperationsRepository(db),
    new DatabaseOpportunityJourneyLegacyStore(db),
  );
  const userIds = await service.listLegacyUserIds(options);
  const audits = [];
  for (const userId of userIds) audits.push(await service.auditUserParity(userId));
  const mismatches = audits.flatMap((audit) => audit.mismatches);
  const report = {
    mode: "read-only-parity-audit",
    usersScanned: userIds.length,
    usersWithMismatches: audits.filter((audit) => audit.mismatches.length > 0)
      .length,
    mismatches: mismatches.length,
    nextAfterUserId: userIds.at(-1) ?? null,
    audits: audits.filter((audit) => audit.mismatches.length > 0),
  };
  console.log(JSON.stringify(report, null, 2));
  if (mismatches.length > 0) process.exitCode = 2;
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      { fatal: error instanceof Error ? error.message : String(error) },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
