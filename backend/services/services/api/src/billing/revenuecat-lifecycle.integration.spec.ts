import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

describe("RevenueCat subscription lifecycle transaction", () => {
  it("is idempotent, order-safe, environment-isolated, and source-scoped", () => {
    const result = spawnSync(
      process.execPath,
      [
        "-r",
        "ts-node/register/transpile-only",
        resolve(
          __dirname,
          "../../test/task-revenuecat/revenuecat-lifecycle-pglite-runner.ts",
        ),
      ],
      { encoding: "utf8", timeout: 30_000 },
    );

    expect(result.error).toBeUndefined();
    if (result.status !== 0) {
      throw new Error(
        `RevenueCat lifecycle runner failed (${result.status}):\n${result.stderr || result.stdout}`,
      );
    }
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(
      "RevenueCat lifecycle idempotency and ordering verified",
    );
    expect(result.stdout).toContain(
      "RevenueCat source isolation and transfer verified",
    );
  });
});
