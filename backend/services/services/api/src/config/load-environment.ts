import { resolve } from "node:path";
import { config } from "dotenv";

interface LoadEnvironmentFilesOptions {
  cwd?: string;
  processEnv?: NodeJS.ProcessEnv;
}

export function loadEnvironmentFiles({
  cwd = process.cwd(),
  processEnv = process.env,
}: LoadEnvironmentFilesOptions = {}): void {
  config({
    path: [resolve(cwd, ".env.local"), resolve(cwd, ".env")],
    processEnv,
    quiet: true,
  });
}
