import { createHash } from "node:crypto";
import {
  fetchSafeImage,
  SafeImageFetchError,
  type SafeImageFetchOptions,
} from "./safe-image-fetcher";

const PUBLIC_V4 = [{ address: "93.184.216.34", family: 4 as const }];

function options(
  overrides: Partial<SafeImageFetchOptions> = {},
): SafeImageFetchOptions {
  return {
    timeoutMs: 500,
    maxBytes: 16,
    maxRedirects: 2,
    resolveHost: jest.fn().mockResolvedValue(PUBLIC_V4),
    transport: jest.fn().mockResolvedValue({
      status: 200,
      contentType: "image/png",
      body: Buffer.from([1, 2, 3]),
    }),
    ...overrides,
  };
}

describe("fetchSafeImage", () => {
  it("rejects a private resolved address before opening a socket", async () => {
    const transport = jest.fn();

    await expect(
      fetchSafeImage(
        "https://images.example/scholarship.png",
        options({
          resolveHost: jest
            .fn()
            .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]),
          transport,
        }),
      ),
    ).rejects.toBeInstanceOf(SafeImageFetchError);

    expect(transport).not.toHaveBeenCalled();
  });

  it("re-validates DNS after a redirect and rejects a private target", async () => {
    const resolveHost = jest
      .fn()
      .mockResolvedValueOnce(PUBLIC_V4)
      .mockResolvedValueOnce([{ address: "10.0.0.8", family: 4 }]);
    const transport = jest.fn().mockResolvedValueOnce({
      status: 302,
      location: "https://internal.example/private.png",
      body: Buffer.alloc(0),
    });

    await expect(
      fetchSafeImage(
        "https://images.example/scholarship.png",
        options({ resolveHost, transport }),
      ),
    ).rejects.toBeInstanceOf(SafeImageFetchError);

    expect(resolveHost).toHaveBeenCalledTimes(2);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rejects non-image MIME types", async () => {
    await expect(
      fetchSafeImage(
        "https://images.example/scholarship.png",
        options({
          transport: jest.fn().mockResolvedValue({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: Buffer.from("<html></html>"),
          }),
        }),
      ),
    ).rejects.toBeInstanceOf(SafeImageFetchError);
  });

  it("rejects responses above the configured byte budget", async () => {
    await expect(
      fetchSafeImage(
        "https://images.example/scholarship.png",
        options({
          maxBytes: 3,
          transport: jest.fn().mockResolvedValue({
            status: 200,
            contentType: "image/png",
            body: Buffer.from([1, 2, 3, 4]),
          }),
        }),
      ),
    ).rejects.toBeInstanceOf(SafeImageFetchError);
  });

  it("returns a content hash and normalized extension for a valid image", async () => {
    const body = Buffer.from([1, 2, 3]);
    const result = await fetchSafeImage(
      "https://images.example/scholarship.png#tracking",
      options({
        transport: jest.fn().mockResolvedValue({
          status: 200,
          contentType: "image/png; charset=binary",
          body,
        }),
      }),
    );

    expect(result).toEqual({
      buffer: body,
      contentType: "image/png",
      extension: "png",
      sha256: createHash("sha256").update(body).digest("hex"),
      finalUrl: "https://images.example/scholarship.png",
    });
  });
});
