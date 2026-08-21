import { describe, expect, it, vi } from "vitest";
import { productApiRequest } from "./productApi";
import { toggleTwoFactor } from "./userSettings";

vi.mock("./productApi", () => ({
  productApiRequest: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

const mockedProductApiRequest = vi.mocked(productApiRequest);

describe("user settings authentication boundary", () => {
  it("never reports 2FA enabled from a profile-settings write", async () => {
    mockedProductApiRequest.mockRejectedValueOnce(
      new Error("Profile settings do not control authentication"),
    );

    await expect(toggleTwoFactor(true, "token-1")).resolves.toEqual({
      success: false,
      error: expect.stringContaining("Clerk"),
    });
  });
});
