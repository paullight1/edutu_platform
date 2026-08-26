import { describe, expect, it, vi } from "vitest";

describe("getApiBaseUrl", () => {
  it("falls back to the local backend port when no env URL is configured", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_BACKEND_URL", "");
    vi.stubEnv("VITE_API_URL", "");
    vi.resetModules();
    const { getApiBaseUrl } = await import("../../lib/apiBaseUrl");

    expect(getApiBaseUrl("Developer API")).toBe("http://localhost:3000");
  });

  it("falls back to the public backend in production when build-time env URLs are missing", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_BACKEND_URL", "");
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("DEV", false);
    vi.resetModules();
    const { getApiBaseUrl } = await import("../../lib/apiBaseUrl");

    expect(getApiBaseUrl("Opportunities API")).toBe(
      "https://edutu-platform.onrender.com",
    );
  });

  it("prefers the configured backend url over the local fallback", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "https://api.edutu.test/");
    vi.resetModules();
    const { getApiBaseUrl } = await import("../../lib/apiBaseUrl");

    expect(getApiBaseUrl("Developer API")).toBe("https://api.edutu.test");
  });
});
