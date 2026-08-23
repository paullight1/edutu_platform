export interface ScraperRuntimeIdentity {
  service: "edutu-api";
  environment: string;
  version: string;
  commit: string | null;
  startedAt: string;
}

const PROCESS_STARTED_AT = new Date().toISOString();

function readEnv(
  env: NodeJS.ProcessEnv,
  ...keys: Array<keyof NodeJS.ProcessEnv>
): string {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return "";
}

export function getScraperRuntimeIdentity(
  env: NodeJS.ProcessEnv = process.env,
): ScraperRuntimeIdentity {
  const commit = readEnv(
    env,
    "RENDER_GIT_COMMIT",
    "VERCEL_GIT_COMMIT_SHA",
    "GITHUB_SHA",
  );

  return {
    service: "edutu-api",
    environment: readEnv(env, "NODE_ENV") || "development",
    version: readEnv(env, "APP_VERSION", "npm_package_version") || "unknown",
    commit: commit ? commit.slice(0, 12) : null,
    startedAt: PROCESS_STARTED_AT,
  };
}
