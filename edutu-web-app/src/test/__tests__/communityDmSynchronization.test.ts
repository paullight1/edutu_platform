import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/features/community/CommunityDmPage.tsx"),
  "utf8",
);
const supabaseClient = readFileSync(
  resolve(process.cwd(), "src/lib/supabaseClient.ts"),
  "utf8",
);

describe("web DM synchronization contract", () => {
  it("uses focused realtime plus bounded reconciliation", () => {
    expect(source).toContain("subscribeToDmMessages");
    expect(source).toMatch(/RECONCILIATION_INTERVAL_MS\s*=\s*60_000/);
    expect(source).not.toMatch(/10_000/);
  });

  it("hands the Clerk token to Supabase Realtime, not only fetch", () => {
    expect(supabaseClient).toContain("accessToken:");
    expect(supabaseClient).toContain("_getToken");
  });
});
