import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdminRuntimeConfigError,
  getAdminRuntimeConfig,
  resolveAdminRuntimeConfig,
} from "./runtimeConfig";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAdminRuntimeConfig", () => {
  it("reads the backend origin from the browser environment", () => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:3010/");
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("PROD", false);
    vi.stubEnv("MODE", "test");

    expect(getAdminRuntimeConfig()).toMatchObject({
      apiOrigin: "http://localhost:3010",
      source: "VITE_BACKEND_URL",
      explicit: true,
      mode: "test",
    });
  });
});

describe("resolveAdminRuntimeConfig", () => {
  it("uses the explicit canonical production origin", () => {
    expect(
      resolveAdminRuntimeConfig(
        { VITE_BACKEND_URL: "https://edutu-api.onrender.com/" },
        "production",
      ),
    ).toEqual({
      apiOrigin: "https://edutu-api.onrender.com",
      source: "VITE_BACKEND_URL",
      explicit: true,
      mode: "production",
    });
  });

  it("accepts VITE_API_URL only as a marked compatibility alias", () => {
    expect(
      resolveAdminRuntimeConfig(
        { VITE_API_URL: "https://legacy-api.example.com" },
        "production",
      ),
    ).toMatchObject({
      apiOrigin: "https://legacy-api.example.com",
      source: "VITE_API_URL",
      explicit: true,
      legacyAlias: true,
    });
  });

  it("uses the development proxy only outside production", () => {
    expect(resolveAdminRuntimeConfig({}, "development")).toMatchObject({
      apiOrigin: "",
      source: "development-proxy",
      explicit: false,
      mode: "development",
    });
  });

  it("fails closed when production has no explicit API origin", () => {
    expect(() => resolveAdminRuntimeConfig({}, "production")).toThrow(
      AdminRuntimeConfigError,
    );
  });

  it("rejects insecure production origins", () => {
    expect(() =>
      resolveAdminRuntimeConfig(
        { VITE_BACKEND_URL: "http://api.example.com" },
        "production",
      ),
    ).toThrow(/https/i);
  });

  it("rejects credentials embedded in the production origin", () => {
    expect(() =>
      resolveAdminRuntimeConfig(
        { VITE_BACKEND_URL: "https://user:password@api.example.com" },
        "production",
      ),
    ).toThrow(/credentials/i);
  });
});
