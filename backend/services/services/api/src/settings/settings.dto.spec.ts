import {
  AdminSettingsSchema,
  DEFAULT_ADMIN_SETTINGS,
  mergeAdminSettings,
} from "./settings.dto";

describe("mergeAdminSettings — mobileApp app control", () => {
  it("fills mobileApp defaults when absent (legacy stored settings)", () => {
    const merged = mergeAdminSettings({
      platform: DEFAULT_ADMIN_SETTINGS.platform,
    });

    expect(merged.mobileApp.forceUpdate.enabled).toBe(false);
    expect(merged.mobileApp.maintenance.enabled).toBe(false);
    expect(merged.mobileApp.moduleLocks).toEqual({});
  });

  it("keeps admin-set gates through a group-level merge with an old payload shape", () => {
    // Simulates SettingsService.updateSettings: current stored settings have
    // gates on; an old client PUTs a payload without the mobileApp group.
    const current = mergeAdminSettings({
      mobileApp: {
        forceUpdate: {
          ...DEFAULT_ADMIN_SETTINGS.mobileApp.forceUpdate,
          enabled: true,
          minVersion: "2.0.0",
        },
        maintenance: DEFAULT_ADMIN_SETTINGS.mobileApp.maintenance,
        moduleLocks: { cv: "pro" },
      },
    });
    const legacyPayload = {
      platform: { ...DEFAULT_ADMIN_SETTINGS.platform, siteName: "Edutu 2" },
    };

    const merged = mergeAdminSettings({ ...current, ...legacyPayload });

    expect(merged.platform.siteName).toBe("Edutu 2");
    expect(merged.mobileApp.forceUpdate.enabled).toBe(true);
    expect(merged.mobileApp.forceUpdate.minVersion).toBe("2.0.0");
    expect(merged.mobileApp.moduleLocks).toEqual({ cv: "pro" });
  });

  it("rejects malformed minVersion and module lock values", () => {
    expect(() =>
      mergeAdminSettings({
        mobileApp: {
          ...DEFAULT_ADMIN_SETTINGS.mobileApp,
          forceUpdate: {
            ...DEFAULT_ADMIN_SETTINGS.mobileApp.forceUpdate,
            minVersion: "not-a-version",
          },
        },
      }),
    ).toThrow();

    expect(() =>
      mergeAdminSettings({
        mobileApp: {
          ...DEFAULT_ADMIN_SETTINGS.mobileApp,
          moduleLocks: { cv: "banana" },
        },
      }),
    ).toThrow();
  });

  it("accepts an inbound payload without mobileApp (legacy admin portal)", () => {
    const { mobileApp, ...legacyShape } = DEFAULT_ADMIN_SETTINGS;
    expect(() => AdminSettingsSchema.parse(legacyShape)).not.toThrow();
  });
});
