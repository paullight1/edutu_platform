export const FROZEN_MIGRATION_TREES = Object.freeze({
  "supabase/migrations": "13bd685c014b28950bf953f24729a5090494cfc2",
  "edutu-web-app/supabase/migrations": "8a576c93046a02755c3fea8fb78a8f690628b78c",
  "edutumobile/supabase/migrations": "b1ee54678b59f21fd296e2bf637b04b758d32595",
});

export const CANONICAL_MIGRATION_TREE =
  "backend/services/services/api/supabase/migrations";

export function validateFrozenMigrationTrees(actualTrees) {
  const violations = [];

  for (const [path, expectedSha] of Object.entries(FROZEN_MIGRATION_TREES)) {
    const actualSha = actualTrees[path];
    if (!actualSha) {
      violations.push(`frozen migration tree missing: ${path}`);
      continue;
    }
    if (actualSha !== expectedSha) {
      violations.push(`frozen migration tree changed: ${path}`);
    }
  }

  return violations.sort();
}
