import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductApiError } from "../../services/productApi";
import { useProductSession } from "./shared";

const { getToken, userId, request } = vi.hoisted(() => ({
  getToken: vi.fn(),
  userId: "learner-1",
  request: vi.fn(),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken, userId }),
}));
vi.mock("../../services/productApi", async importOriginal => ({
  ...await importOriginal<typeof import("../../services/productApi")>(),
  productApiRequest: request,
}));

describe("useProductSession", () => {
  beforeEach(() => {
    getToken.mockReset();
    request.mockReset();
    getToken.mockResolvedValue("cached-token");
  });

  it("refreshes a rejected Clerk token once for safe reads", async () => {
    request
      .mockRejectedValueOnce(new ProductApiError("Invalid or expired token", 401))
      .mockResolvedValueOnce({ ok: true });
    getToken.mockResolvedValueOnce("cached-token").mockResolvedValueOnce("fresh-token");

    const { result } = renderHook(() => useProductSession());
    await expect(result.current.request("/billing/status")).resolves.toEqual({ ok: true });

    expect(getToken).toHaveBeenNthCalledWith(1);
    expect(getToken).toHaveBeenNthCalledWith(2, { skipCache: true });
    expect(request.mock.calls.map(([, token]) => token)).toEqual(["cached-token", "fresh-token"]);
  });

  it("does not replay mutations after an unauthorized response", async () => {
    request.mockRejectedValueOnce(new ProductApiError("Invalid or expired token", 401));
    getToken.mockResolvedValue("cached-token");

    const { result } = renderHook(() => useProductSession());
    await expect(result.current.request("/billing/checkout", { method: "POST", body: "{}" }))
      .rejects.toThrow("Invalid or expired token");

    expect(request).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledTimes(1);
  });
});
