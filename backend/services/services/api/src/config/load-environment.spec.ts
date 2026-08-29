import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvironmentFiles } from "./load-environment";

describe("loadEnvironmentFiles", () => {
  it("prefers .env.local values while retaining .env fallbacks", () => {
    const cwd = mkdtempSync(join(tmpdir(), "edutu-env-"));
    const processEnv: NodeJS.ProcessEnv = {};

    writeFileSync(
      join(cwd, ".env"),
      "CLERK_SECRET_KEY=production-secret\nDATABASE_URL=postgres://fallback\n",
    );
    writeFileSync(join(cwd, ".env.local"), "CLERK_SECRET_KEY=dev-secret\n");

    loadEnvironmentFiles({ cwd, processEnv });

    expect(processEnv.CLERK_SECRET_KEY).toBe("dev-secret");
    expect(processEnv.DATABASE_URL).toBe("postgres://fallback");
  });

  it("does not replace variables supplied by the launching process", () => {
    const cwd = mkdtempSync(join(tmpdir(), "edutu-env-"));
    const processEnv: NodeJS.ProcessEnv = {
      CLERK_SECRET_KEY: "shell-secret",
    };

    writeFileSync(join(cwd, ".env.local"), "CLERK_SECRET_KEY=dev-secret\n");

    loadEnvironmentFiles({ cwd, processEnv });

    expect(processEnv.CLERK_SECRET_KEY).toBe("shell-secret");
  });
});
