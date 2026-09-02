import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/apiBaseUrl", () => ({
  getApiBaseUrl: () => "https://api.edutu.test",
}));

const DISABLED_PIPELINE_FLAGS = {
  opportunity_pipeline_home: false,
  opportunity_my_path: false,
  opportunity_state_actions: false,
  opportunity_pipeline_navigation: false,
};

type WebConfigModule = typeof import("./webConfig") & {
  fetchWebFeatureFlags: () => Promise<Record<string, boolean>>;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("fetchWebFeatureFlags", () => {
  it("returns only the supported pipeline flags from public web config", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        featureFlags: {
          opportunity_pipeline_home: true,
          opportunity_my_path: false,
          opportunity_state_actions: true,
          opportunity_pipeline_navigation: false,
          unsupported_flag: true,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const webConfig = (await import("./webConfig")) as WebConfigModule;

    const flags = await webConfig.fetchWebFeatureFlags();

    expect(flags).toEqual({
      ...DISABLED_PIPELINE_FLAGS,
      opportunity_pipeline_home: true,
      opportunity_state_actions: true,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("defaults every flag to false when the payload is missing or malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ featureFlags: null }) }),
    );
    const webConfig = (await import("./webConfig")) as WebConfigModule;

    await expect(webConfig.fetchWebFeatureFlags()).resolves.toEqual(
      DISABLED_PIPELINE_FLAGS,
    );
  });

  it("defaults every flag to false when the web-config request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const webConfig = (await import("./webConfig")) as WebConfigModule;

    await expect(webConfig.fetchWebFeatureFlags()).resolves.toEqual(
      DISABLED_PIPELINE_FLAGS,
    );
  });
});
