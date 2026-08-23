import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("mobile DM synchronization contract", () => {
  const source = readFileSync(
    resolve(process.cwd(), "app/(app)/discussions/dm/[id].tsx"),
    "utf8",
  );

  it("replaces ten-second polling with focused realtime and slow reconciliation", () => {
    expect(source).toContain("subscribeToDmMessages");
    expect(source).toMatch(/RECONCILIATION_INTERVAL_MS\s*=\s*60_000/);
    expect(source).not.toMatch(/REFRESH_INTERVAL_MS\s*=\s*10_000/);
  });
});
