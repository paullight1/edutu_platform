import { beforeEach, describe, expect, it, vi } from "vitest";

describe("getPublicApiBaseUrl", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the public API origin instead of a local backend URL", async () => {
    vi.stubEnv("VITE_API_PUBLIC_URL", "");
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:3010");
    vi.stubEnv("VITE_API_URL", "");

    const { getPublicApiBaseUrl } = await import("../../lib/apiProductUrls");

    expect(getPublicApiBaseUrl()).toBe(
      "https://edutu-platform.onrender.com/v1",
    );
  });

  it("uses a configured public API URL and trims its trailing slash", async () => {
    vi.stubEnv("VITE_API_PUBLIC_URL", "https://api.example.test/v1/");

    const { getPublicApiBaseUrl } = await import("../../lib/apiProductUrls");

    expect(getPublicApiBaseUrl()).toBe("https://api.example.test/v1");
  });
});
