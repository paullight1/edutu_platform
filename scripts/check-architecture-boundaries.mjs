import { access, readdir } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_MIGRATION_ROOTS = new Set([
  "backend/services/services/api/supabase/migrations",
  "supabase/migrations",
  "edutu-web-app/supabase/migrations",
  "edutumobile/supabase/migrations",
]);

const ALLOWED_PACKAGE_ROOTS = new Set([
  "packages",
  "edutumobile/packages",
]);

const LEGACY_BACKEND_FILES = [
  "backend/server.js",
  "backend/scraper.js",
  "backend/database.js",
  "backend/package.json",
  "backend/package-lock.json",
  "backend/.env.example",
];

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "other-files",
]);

function normalizePath(value) {
  return value.split(sep).join("/");
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function collectDirectories(root) {
  const directories = [];

  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      const fullPath = resolve(current, entry.name);
      const relativePath = normalizePath(relative(root, fullPath));
      directories.push(relativePath);
      await walk(fullPath);
    }
  }

  await walk(root);
  return directories;
}

export async function inspectArchitecture(root) {
  const violations = [];

  for (const file of LEGACY_BACKEND_FILES) {
    if (await pathExists(resolve(root, file))) {
      violations.push(`legacy backend runtime file: ${file}`);
    }
  }

  const directories = await collectDirectories(root);
  for (const directory of directories) {
    if (directory.includes("services/services/services")) {
      violations.push(`unexpected repeated services nesting: ${directory}`);
    }

    if (
      directory.endsWith("/supabase/migrations") ||
      directory === "supabase/migrations"
    ) {
      if (!ALLOWED_MIGRATION_ROOTS.has(directory)) {
        violations.push(`unexpected Supabase migration root: ${directory}`);
      }
    }

    if (directory.endsWith("/packages") || directory === "packages") {
      if (!ALLOWED_PACKAGE_ROOTS.has(directory)) {
        violations.push(`unexpected package root: ${directory}`);
      }
    }
  }

  return violations.sort();
}

function parseRoot(argv) {
  const rootIndex = argv.indexOf("--root");
  if (rootIndex >= 0) {
    const value = argv[rootIndex + 1];
    if (!value) throw new Error("--root requires a path");
    return resolve(value);
  }

  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}

const root = parseRoot(process.argv.slice(2));
const violations = await inspectArchitecture(root);

if (violations.length > 0) {
  console.error("Architecture boundary violations:\n");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log("Architecture boundary checks passed.");
}
