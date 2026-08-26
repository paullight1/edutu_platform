import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const authProvider = readFileSync(
  resolve(process.cwd(), "src/hooks/useAuth.tsx"),
  "utf8",
);

describe("Community Realtime Clerk authentication", () => {
  it("requests the Supabase JWT template and retains a generic-token fallback", () => {
    expect(authProvider).toContain("getToken({ template: 'supabase' })");
    expect(authProvider).toMatch(/supabaseToken\s*\|\|\s*await getToken\(\)/);
  });
});
