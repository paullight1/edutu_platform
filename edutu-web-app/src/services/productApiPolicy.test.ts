import { afterEach, describe, expect, it, vi } from "vitest";
import { productApiRequest } from "./productApi";
vi.mock("../lib/apiBaseUrl", () => ({
  getApiBaseUrl: () => "http://test-api",
}));
vi.mock("../lib/localDevAuthHeaders", () => ({
  getLocalDevAuthHeaders: () => ({}),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("product request safety", () => {
  it("does not replay a metered POST after a lost response", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockRejectedValue(new TypeError("network lost"));
    vi.stubGlobal("fetch", fetcher);
    const pending = productApiRequest("/cv/ai/draft", "token", {
      method: "POST",
      body: "{}",
    }).catch((e) => e);
    await vi.runAllTimersAsync();
    expect(await pending).toBeInstanceOf(Error);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("preserves structured server errors for conflict handling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "Newer version exists",
            code: "revision_conflict",
          }),
          { status: 409 },
        ),
      ),
    );
    await expect(
      productApiRequest("/cv/editor/one", "token", { method: "PATCH" }),
    ).rejects.toMatchObject({ status: 409, code: "revision_conflict" });
  });
  it("does not turn an explicit abort into an unavailable service", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation((_url, options) =>
          options.signal.aborted
            ? Promise.reject(new DOMException("Aborted", "AbortError"))
            : Promise.resolve(new Response("{}")),
        ),
    );
    await expect(
      productApiRequest("/goals", "token", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("retries a transient read failure", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network lost"))
      .mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal("fetch", fetcher);
    const result = productApiRequest("/goals", "token");
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
