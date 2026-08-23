import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_FILES = [
  "admin/src/lib/backend.ts",
  "admin/src/lib/runtimeConfig.ts",
  "admin/vite.config.ts",
];

const RENDER_ORIGIN_RE =
  /https:\/\/[a-z0-9.-]+\.onrender\.com(?:\/[^\s"'`]*)?/iu;

function stripAllowedDevelopmentProxy(path, contents) {
  if (path !== "admin/vite.config.ts") return contents;

  return contents.replace(
    /const\s+DEV_PROXY_TARGET\s*=[\s\S]*?;\s*/u,
    "",
  );
}

export function inspectAdminRuntimeConfigSources(files) {
  const failures = [];

  for (const [path, contents] of Object.entries(files)) {
    const inspected = stripAllowedDevelopmentProxy(path, contents);
    if (RENDER_ORIGIN_RE.test(inspected)) {
      failures.push(
        `${path} contains a forbidden hardcoded production API fallback`,
      );
    }
  }

  return failures;
}

async function main() {
  const root = resolve(import.meta.dirname, "..");
  const entries = await Promise.all(
    RUNTIME_FILES.map(async (path) => [
      path,
      await readFile(resolve(root, path), "utf8"),
    ]),
  );
  const failures = inspectAdminRuntimeConfigSources(
    Object.fromEntries(entries),
  );

  if (failures.length > 0) {
    console.error("Admin runtime configuration policy failed:\n");
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(
      "\nProduction API origins must come from VITE_BACKEND_URL. Only the Vite development proxy may carry a local default target.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Admin runtime configuration policy passed for ${RUNTIME_FILES.length} files.`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
