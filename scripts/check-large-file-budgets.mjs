import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// These are debt ceilings, not targets. They record the reviewed 2026-10-11
// source-tree snapshot after the prior limits drifted behind files that had
// already grown. CI rejects any additional growth until cohesive features are
// extracted and the ceilings can be lowered.
const budgets = {
  "admin/src/pages/Opportunities.tsx": 6130,
  "backend/services/services/api/src/opportunities/opportunities.service.ts": 3953,
  "backend/services/services/api/src/scraper/scraper.service.ts": 4281,
  "edutu-web-app/src/components/Dashboard.tsx": 2005,
  "edutumobile/app/(app)/chat.tsx": 2245,
  "edutumobile/app/(app)/index.tsx": 3121,
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
