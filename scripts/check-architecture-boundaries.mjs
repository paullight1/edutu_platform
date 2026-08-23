import { access, readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const CANONICAL_API_FILES = [
  "backend/services/services/api/package.json",
  "backend/services/services/api/src/main.ts",
];

const ALLOWED_MIGRATION_ROOTS = new Set([
  "backend/services/services/api/supabase/migrations",
  "supabase/migrations",
  "edutu-web-app/supabase/migrations",
  "edutumobile/supabase/migrations",
]);

const ALLOWED_PACKAGE_ROOTS = new Set(["packages", "edutumobile/packages"]);

const GRANDFATHERED_BACKEND_FILES = new Set([
  "backend/database.js",
  "backend/scraper.js",
  "backend/server.js",
]);

const CLIENT_SOURCE_ROOTS = [
  "admin/src",
  "edutu-web-app/src",
  "edutumobile/app",
  "edutumobile/components",
  "edutumobile/lib",
  "edutumobile/packages",
];

const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);
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

async function walk(root, current = root) {
  const directories = [];
  const files = [];
  let entries;

  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return { directories, files };
    throw error;
  }

  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;

    const fullPath = resolve(current, entry.name);
    const relativePath = normalizePath(relative(root, fullPath));
    if (entry.isDirectory()) {
      directories.push(relativePath);
      const nested = await walk(root, fullPath);
      directories.push(...nested.directories);
      files.push(...nested.files);
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return { directories, files };
}

function isClientSourceFile(path) {
  return (
    SOURCE_EXTENSIONS.has(extname(path)) &&
    CLIENT_SOURCE_ROOTS.some(
      (root) => path === root || path.startsWith(`${root}/`),
    )
  );
}

async function inspectClientBoundary(root, files) {
  const violations = [];

  for (const file of files.filter(isClientSourceFile)) {
    const content = await readFile(resolve(root, file), "utf8");

    if (/\b(?:VITE_|EXPO_PUBLIC_)?SUPABASE_SERVICE_ROLE_KEY\b/.test(content)) {
      violations.push(
        `client source references a Supabase service-role secret: ${file}`,
      );
    }

    if (content.includes("backend/services/services/api/src/")) {
      violations.push(
        `client source imports API internals instead of a contract: ${file}`,
      );
    }
  }

  return violations;
}

export async function inspectArchitecture(root) {
  const violations = [];

  for (const requiredFile of CANONICAL_API_FILES) {
    if (!(await pathExists(resolve(root, requiredFile)))) {
      violations.push(`missing canonical API file: ${requiredFile}`);
    }
  }

  const { directories, files } = await walk(root);

  for (const directory of directories) {
    if (directory.includes("services/services/services")) {
      violations.push(`unexpected repeated services nesting: ${directory}`);
    }

    if (
      directory === "supabase/migrations" ||
      directory.endsWith("/supabase/migrations")
    ) {
      if (!ALLOWED_MIGRATION_ROOTS.has(directory)) {
        violations.push(`unexpected Supabase migration root: ${directory}`);
      }
    }

    if (directory === "packages" || directory.endsWith("/packages")) {
      if (!ALLOWED_PACKAGE_ROOTS.has(directory)) {
        violations.push(`unexpected package root: ${directory}`);
      }
    }
  }

  const unexpectedBackendRuntimes = files.filter(
    (file) =>
      /^backend\/[^/]+\.(?:cjs|js|mjs)$/.test(file) &&
      !GRANDFATHERED_BACKEND_FILES.has(file),
  );
  for (const file of unexpectedBackendRuntimes) {
    violations.push(`unexpected duplicate backend runtime file: ${file}`);
  }

  violations.push(...(await inspectClientBoundary(root, files)));
  return [...new Set(violations)].sort();
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

const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = parseRoot(process.argv.slice(2));
  const violations = await inspectArchitecture(root);

  if (violations.length > 0) {
    console.error("Architecture boundary violations:\n");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else {
    console.log("Architecture boundary checks passed.");
  }
}
