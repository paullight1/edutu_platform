import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  verifyAdminAccess: vi.fn(),
}));

vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
  },
}));

vi.mock("../../lib/adminAccess", () => ({
  isAdminRole: (role: unknown) =>
    ["super_admin", "admin", "moderator", "support_agent"].includes(
      role as string,
    ),
  verifyAdminAccess: mocks.verifyAdminAccess,
}));

import {
  checkAdminAccess,
  getAdminPermissions,
} from "../../services/admin/adminService";

describe("admin service authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "verified-user-token" } },
    });
  });

  it("uses the guarded backend result instead of profile preferences", async () => {
    mocks.verifyAdminAccess.mockResolvedValue({
      allowed: true,
      userId: "user_123",
      email: "admin@edutu.org",
      role: "admin",
    });

    await expect(checkAdminAccess()).resolves.toEqual({
      isAdmin: true,
      role: "admin",
    });
    expect(mocks.verifyAdminAccess).toHaveBeenCalledWith("verified-user-token");
  });

  it("does not derive permissions from a caller-selected profile id", async () => {
    mocks.verifyAdminAccess.mockResolvedValue({
      allowed: true,
      userId: "user_123",
      email: "admin@edutu.org",
      role: "support_agent",
    });

    await expect(
      getAdminPermissions("attacker-selected-user-id"),
    ).resolves.toEqual(["support:respond"]);
    expect(mocks.verifyAdminAccess).toHaveBeenCalledWith("verified-user-token");
  });
});
