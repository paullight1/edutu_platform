import { afterEach, describe, expect, it, vi } from "vitest";

describe("getApiBaseUrl", () => {
  afterEach(() => { vi.unstubAllEnvs(); });
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
      "https://backend.edutu.org",
    );
  });

  it("prefers the configured backend url over the local fallback", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "https://api.edutu.test/");
    vi.resetModules();
    const { getApiBaseUrl } = await import("../../lib/apiBaseUrl");

    expect(getApiBaseUrl("Developer API")).toBe("https://api.edutu.test");
  });
  it("routes development opportunity reads through the preview API without redirecting protected requests", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:3010");
    vi.stubEnv("VITE_DEV_OPPORTUNITIES_API_URL", " /__api/ ");
    const { getApiBaseUrl } = await import("../../lib/apiBaseUrl");

    expect(getApiBaseUrl("Opportunities API")).toBe("/__api");
    expect(getApiBaseUrl("Product API")).toBe("http://localhost:3010");
    expect(getApiBaseUrl("Opportunity Share API")).toBe("http://localhost:3010");
  });

  it("ignores development opportunity routing in a production build", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_BACKEND_URL", "https://api.edutu.test/");
    vi.stubEnv("VITE_DEV_OPPORTUNITIES_API_URL", "/__api");
    const { getApiBaseUrl } = await import("../../lib/apiBaseUrl");

    expect(getApiBaseUrl("Opportunities API")).toBe("https://api.edutu.test");
  });

});
