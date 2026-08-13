import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const runnerPath = resolve(
  __dirname,
  "../../test/task-4/api-request-idempotency-pglite-runner.ts",
);

describe("Edutu API scoped idempotency persistence", () => {
  it("applies the migration and preserves charge isolation and fail-closed duplicates", () => {
    const result = spawnSync(
      process.execPath,
      ["-r", "ts-node/register/transpile-only", runnerPath],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(
      "scoped API idempotency charges isolated; exact retry ignored; malformed/mismatched duplicates rejected",
    );
  });
});
