import { DEFAULT_ADMIN_SETTINGS, mergeAdminSettings } from "./settings.dto";
import { WebConfigController } from "./web-config.controller";

const DISABLED_PIPELINE_FLAGS = {
  opportunity_pipeline_home: false,
  opportunity_my_path: false,
  opportunity_state_actions: false,
  opportunity_pipeline_navigation: false,
};

describe("opportunity pipeline feature flags", () => {
  it("defaults every web and mobile pipeline flag to false for legacy settings", () => {
    const merged = mergeAdminSettings({
      platform: DEFAULT_ADMIN_SETTINGS.platform,
    });

    expect(
      (merged.webContent as { featureFlags?: Record<string, boolean> })
        .featureFlags,
    ).toEqual(DISABLED_PIPELINE_FLAGS);
    expect(merged.mobileApp.featureFlags).toEqual(DISABLED_PIPELINE_FLAGS);
  });

  it("preserves explicitly enabled flags independently for web and mobile", () => {
    const merged = mergeAdminSettings({
      webContent: {
        ...DEFAULT_ADMIN_SETTINGS.webContent,
        featureFlags: {
          ...DISABLED_PIPELINE_FLAGS,
          opportunity_pipeline_home: true,
        },
      },
      mobileApp: {
        ...DEFAULT_ADMIN_SETTINGS.mobileApp,
        featureFlags: {
          ...DISABLED_PIPELINE_FLAGS,
          opportunity_my_path: true,
        },
      },
    });

    expect(
      (merged.webContent as { featureFlags?: Record<string, boolean> })
        .featureFlags,
    ).toEqual({
      ...DISABLED_PIPELINE_FLAGS,
      opportunity_pipeline_home: true,
    });
    expect(merged.mobileApp.featureFlags).toEqual({
      ...DISABLED_PIPELINE_FLAGS,
      opportunity_my_path: true,
    });
  });

  it("projects the web flags through the public web-config endpoint", async () => {
    const settings = mergeAdminSettings({
      webContent: {
        ...DEFAULT_ADMIN_SETTINGS.webContent,
        featureFlags: {
          ...DISABLED_PIPELINE_FLAGS,
          opportunity_state_actions: true,
        },
      },
    });
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ settings }),
    };
    const controller = new WebConfigController(settingsService as never);

    const result = await controller.getWebConfig();

    expect(
      (result as { featureFlags?: Record<string, boolean> }).featureFlags,
    ).toEqual({
      ...DISABLED_PIPELINE_FLAGS,
      opportunity_state_actions: true,
    });
  });

  it("fails closed to disabled web flags when settings cannot be loaded", async () => {
    const settingsService = {
      getSettings: jest.fn().mockRejectedValue(new Error("database offline")),
    };
    const controller = new WebConfigController(settingsService as never);

    const result = await controller.getWebConfig();

    expect(
      (result as { featureFlags?: Record<string, boolean> }).featureFlags,
    ).toEqual(DISABLED_PIPELINE_FLAGS);
  });
});
