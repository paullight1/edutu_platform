import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNetworkStatus } from "./useNetworkStatus";

describe("useNetworkStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checks the Edutu origin rather than a potentially blocked third-party host", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useNetworkStatus());

    await expect(result.current.checkConnection()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/favicon.ico",
      expect.objectContaining({ method: "HEAD", cache: "no-store" }),
    );
  });

  it("reports a failed server response as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const { result } = renderHook(() => useNetworkStatus());
    await expect(result.current.checkConnection()).resolves.toBe(false);
  });
});
