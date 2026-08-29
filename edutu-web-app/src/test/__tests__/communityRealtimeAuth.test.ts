import { describe, expect, it, vi } from "vitest";
import { getClerkSessionToken } from "../../lib/clerkToken";

describe("Community Realtime Clerk authentication", () => {
  it("uses the normal Clerk session token supported by Supabase third-party auth", async () => {
    const getToken = vi.fn(async () => "clerk-session-token");

    await expect(getClerkSessionToken(getToken)).resolves.toBe(
      "clerk-session-token",
    );
    expect(getToken).toHaveBeenCalledOnce();
    expect(getToken).toHaveBeenCalledWith();
  });

  it("keeps optional Supabase features unavailable when Clerk token loading fails", async () => {
    const getToken = vi.fn(async () => {
      throw new Error("Clerk is offline");
    });

    await expect(getClerkSessionToken(getToken)).resolves.toBeNull();
  });
});
