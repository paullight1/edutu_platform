import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const runnerPath = resolve(
  __dirname,
  "../../test/task-1/credit-idempotency-pglite-runner.ts",
);

describe("BillingService credit-pack ledger idempotency", () => {
  it("credits the first credit_pack delivery and ignores the duplicate using the deployed partial index", () => {
    const result = spawnSync(
      process.execPath,
      ["-r", "ts-node/register/transpile-only", runnerPath],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(
      "credit_pack first delivery credited once; duplicate ignored",
    );
  });

  it("fulfills the atomic SQL credit-pack delivery once and ignores the provider duplicate", () => {
    const result = spawnSync(
      process.execPath,
      ["-r", "ts-node/register/transpile-only", runnerPath],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(
      "atomic credit_pack first delivery fulfilled once; duplicate ignored",
    );
  });
});
