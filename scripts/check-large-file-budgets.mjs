import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// These are debt ceilings, not targets. They equal the exact 2026-08-29
// main-branch line counts after reconciling already-merged feature work that
// landed after the previous 2026-08-26 refresh. CI must reject any additional
// growth until cohesive features are extracted and the ceilings can be lowered.
const budgets = {
  // Bulk AI enhancement and its completion hardening landed in e03fbfe and
  // 227cd8a after the previous ceiling. No additional headroom is included.
  "admin/src/pages/Opportunities.tsx": 5317,
  // AI opportunity enrichment, bounded concurrency, and completion hardening
  // landed in 59066bd, 95c5cee, and 227cd8a. Exact current count only.
  "backend/services/services/api/src/opportunities/opportunities.service.ts": 3777,
  // Storage image de-duplication, guarded cleanup, and formatting landed in
  // 481b9d6, eef1bdc, and 7a83692. Exact current count only.
  "backend/services/services/api/src/scraper/scraper.service.ts": 4017,
  "edutu-web-app/src/components/Dashboard.tsx": 2005,
  "edutumobile/app/(app)/chat.tsx": 2245,
  "edutumobile/app/(app)/index.tsx": 3113,
  "edutumobile/app/(app)/opportunities/[id].tsx": 4446,
};

const root = resolve(import.meta.dirname, "..");
const failures = [];

for (const [file, maximumLines] of Object.entries(budgets)) {
  const contents = await readFile(resolve(root, file), "utf8");
  const lines =
    contents.length === 0
      ? 0
      : contents.split(/\r?\n/u).length - (contents.endsWith("\n") ? 1 : 0);

  if (lines > maximumLines) {
    failures.push(`${file}: ${lines} lines (budget ${maximumLines})`);
  }
}

if (failures.length > 0) {
  console.error("Large-file budgets increased:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    "\nExtract a cohesive feature or explicitly lower/update the reviewed budget.",
  );
  process.exitCode = 1;
} else {
  console.log(
    `Architecture budgets passed for ${Object.keys(budgets).length} critical files.`,
  );
}
