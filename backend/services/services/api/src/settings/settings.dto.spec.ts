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

describe("mergeAdminSettings — pricing season pass (Zod-safe)", () => {
  it("does not fall back to defaults for stored settings saved BEFORE seasonPass existed", () => {
    // Fixture: a settings object persisted before the seasonPass field shipped,
    // carrying a custom weeklyPrice. The whole point of the defaulted schema is
    // that this parses cleanly instead of throwing and blanking every setting.
    const legacyStored = structuredClone(DEFAULT_ADMIN_SETTINGS);
    legacyStored.pricing.weeklyPrice = 4321;
    delete (legacyStored.pricing as { seasonPass?: unknown }).seasonPass;

    const merged = mergeAdminSettings(legacyStored);

    // (a) The custom value survives — no wholesale fallback to defaults.
    expect(merged.pricing.weeklyPrice).toBe(4321);
    // (b) seasonPass comes back filled with its defaults.
    expect(merged.pricing.seasonPass).toEqual({
      enabled: false,
      price: 15000,
      durationDays: 90,
      label: "Season Pass",
    });
  });

  it("fills the rest of seasonPass from a partial ({ enabled: true } only)", () => {
    const merged = mergeAdminSettings({
      pricing: {
        ...DEFAULT_ADMIN_SETTINGS.pricing,
        seasonPass: { enabled: true },
      },
    });

    expect(merged.pricing.seasonPass).toEqual({
      enabled: true,
      price: 15000,
      durationDays: 90,
      label: "Season Pass",
    });
  });

  it("throws on an out-of-range seasonPass (durationDays 400), matching other pricing violations", () => {
    // Documented behavior: like any pricing-field violation, this throws inside
    // AdminSettingsSchema.parse; the caller (SettingsService) then falls back to
    // defaults. We pin the throw here.
    expect(() =>
      mergeAdminSettings({
        pricing: {
          ...DEFAULT_ADMIN_SETTINGS.pricing,
          seasonPass: {
            enabled: true,
            price: 15000,
            durationDays: 400,
            label: "Season Pass",
          },
        },
      }),
    ).toThrow();
  });
});
