import { db } from "../src/db";
import { OpportunityJourneyCompatibilityService } from "../src/opportunity-journeys/opportunity-journey-compatibility.service";
import { DatabaseOpportunityJourneyLegacyStore } from "../src/opportunity-journeys/opportunity-journey-legacy.store";
import { OpportunityJourneyOperationsRepository } from "../src/opportunity-journeys/opportunity-journey-operations.repository";
import {
  parseOpportunityJourneyBackfillArgs,
  runOpportunityJourneyBackfill,
} from "../src/opportunity-journeys/opportunity-journey-backfill";

async function main() {
  const options = parseOpportunityJourneyBackfillArgs(process.argv.slice(2));
  const repository = new OpportunityJourneyOperationsRepository(db);
  const legacyStore = new DatabaseOpportunityJourneyLegacyStore(db);
  const compatibility = new OpportunityJourneyCompatibilityService(
    repository,
    legacyStore,
  );
  const report = await runOpportunityJourneyBackfill(compatibility, options);
  console.log(JSON.stringify(report, null, 2));
  if (report.failures.length > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        mode: process.argv.includes("--write") ? "write" : "dry-run",
        fatal: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
