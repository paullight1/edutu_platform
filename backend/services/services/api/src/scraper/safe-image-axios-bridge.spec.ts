import type axios from "axios";
import { installSafeImageAxiosBridge } from "./safe-image-axios-bridge";

describe("installSafeImageAxiosBridge", () => {
  it("routes arraybuffer image downloads through the safe fetcher", async () => {
    const originalGet = jest.fn().mockResolvedValue({ data: "legacy" });
    const axiosClient = { get: originalGet } as unknown as typeof axios;
    const safeFetcher = jest.fn().mockResolvedValue({
      buffer: Buffer.from([1, 2, 3]),
      contentType: "image/png",
      extension: "png",
      sha256: "abc",
      finalUrl: "https://images.example/safe.png",
    });

    const restore = installSafeImageAxiosBridge(
      axiosClient,
      safeFetcher as any,
    );
    const response = await axiosClient.get("https://images.example/raw.png", {
      responseType: "arraybuffer",
      timeout: 10_000,
    });

    expect(safeFetcher).toHaveBeenCalledWith(
      "https://images.example/raw.png",
      expect.objectContaining({ timeoutMs: 10_000 }),
    );
    expect(originalGet).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      status: 200,
      data: Buffer.from([1, 2, 3]),
      headers: { "content-type": "image/png" },
    });

    restore();
  });

  it("leaves ordinary axios requests untouched", async () => {
    const originalGet = jest.fn().mockResolvedValue({ data: "page" });
    const axiosClient = { get: originalGet } as unknown as typeof axios;
    const safeFetcher = jest.fn();

    const restore = installSafeImageAxiosBridge(
      axiosClient,
      safeFetcher as any,
    );
    await expect(
      axiosClient.get("https://example.com/page", { responseType: "text" }),
    ).resolves.toEqual({ data: "page" });

    expect(originalGet).toHaveBeenCalledTimes(1);
    expect(safeFetcher).not.toHaveBeenCalled();
    restore();
  });

  it("is idempotent when Nest initializes the scraper module more than once", () => {
    const originalGet = jest.fn();
    const axiosClient = { get: originalGet } as unknown as typeof axios;
    const safeFetcher = jest.fn();

    const restoreFirst = installSafeImageAxiosBridge(
      axiosClient,
      safeFetcher as any,
    );
    const wrappedGet = Reflect.get(axiosClient, "get");
    const restoreSecond = installSafeImageAxiosBridge(
      axiosClient,
      safeFetcher as any,
    );

    expect(Reflect.get(axiosClient, "get")).toBe(wrappedGet);
    restoreSecond();
    expect(Reflect.get(axiosClient, "get")).toBe(wrappedGet);
    restoreFirst();
    expect(Reflect.get(axiosClient, "get")).toBe(originalGet);
  });
});
