export const FROZEN_MIGRATION_TREES = Object.freeze({
  "supabase/migrations": "13bd685c014b28950bf953f24729a5090494cfc2",
  "edutu-web-app/supabase/migrations": "8a576c93046a02755c3fea8fb78a8f690628b78c",
  "edutumobile/supabase/migrations": "b1ee54678b59f21fd296e2bf637b04b758d32595",
});

export const FROZEN_LEGACY_SCHEMA_FILES = Object.freeze([
  "backend/services/services/api/supabase/admin_schema.sql",
  "edutu-web-app/supabase/admin_schema.sql",
  "edutu-web-app/supabase/schema.sql",
]);

export const CANONICAL_MIGRATION_TREE =
  "backend/services/services/api/supabase/migrations";

function normalizeRepositoryPath(value) {
  return String(value ?? "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//u, "");
}

function isInsideTree(path, tree) {
  return path === tree || path.startsWith(`${tree}/`);
}

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

export function evaluateLegacyMigrationDiff({
  changedPaths = [],
  frozenTreeViolations = [],
}) {
  const normalizedPaths = [...new Set(changedPaths.map(normalizeRepositoryPath))]
    .filter(Boolean)
    .sort();
  const frozenTrees = Object.keys(FROZEN_MIGRATION_TREES);
  const changedLegacyPaths = normalizedPaths.filter(
    (path) =>
      frozenTrees.some((tree) => isInsideTree(path, tree)) ||
      FROZEN_LEGACY_SCHEMA_FILES.includes(path),
  );

  const errors = [
    ...new Set([
      ...frozenTreeViolations,
      ...changedLegacyPaths
        .filter((path) => FROZEN_LEGACY_SCHEMA_FILES.includes(path))
        .map((path) => `legacy schema file is frozen: ${path}`),
    ]),
  ].sort();

  if (errors.length > 0) {
    return {
      ok: false,
      status: "blocked",
      changedLegacyPaths,
      errors,
    };
  }

  return {
    ok: true,
    status: changedLegacyPaths.length > 0 ? "restored" : "unchanged",
    changedLegacyPaths,
    errors: [],
  };
}
