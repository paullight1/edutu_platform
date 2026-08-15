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

describe("mergeAdminSettings — consumer subscription pricing", () => {
  it("defaults the Lite and Pro USD price ladders and 10x usage positioning", () => {
    const pricing = DEFAULT_ADMIN_SETTINGS.pricing;

    expect(pricing.currency).toBe("USD");
    expect(pricing.lite.weeklyPrice).toBe(3.99);
    expect(pricing.lite.monthlyPrice).toBe(10);
    expect(pricing.lite.yearlyPrice).toBe(100);
    expect(pricing.pro.weeklyPrice).toBe(5);
    expect(pricing.pro.monthlyPrice).toBe(15);
    expect(pricing.pro.yearlyPrice).toBe(150);
    expect(pricing.scholar.weeklyPrice).toBe(7.99);
    expect(pricing.scholar.monthlyPrice).toBe(24.99);
    expect(pricing.scholar.yearlyPrice).toBe(200);
    expect(pricing.liteFairUse.dailyActionCredits * 10).toBe(
      pricing.proFairUse.dailyActionCredits,
    );
    expect(pricing.liteFairUse.dailyVoiceMinutes * 6).toBe(
      pricing.proFairUse.dailyVoiceMinutes,
    );
  });
});

describe("mergeAdminSettings — safety crisis contact", () => {
  it("fills the default crisis contact when the safety group is absent (old stored row)", () => {
    // A row stored before the safety group existed: omitting it must NOT
    // invalidate the parse or reset any other group.
    const merged = mergeAdminSettings({
      platform: {
        ...DEFAULT_ADMIN_SETTINGS.platform,
        siteName: "Edutu Legacy",
      },
      // no `safety` key at all
    });

    expect(merged.safety.crisisContactPhone).toBe("+2348169400427");
    // Other settings still resolve from the stored value, not reset to default.
    expect(merged.platform.siteName).toBe("Edutu Legacy");
  });

  it("preserves an admin-set crisis contact through a group-level merge", () => {
    const current = mergeAdminSettings({
      safety: { crisisContactPhone: "+15551230000" },
    });
    expect(current.safety.crisisContactPhone).toBe("+15551230000");

    // A later legacy payload (no safety group) must not wipe the set number.
    const next = mergeAdminSettings({
      ...current,
      platform: { ...DEFAULT_ADMIN_SETTINGS.platform, siteName: "Edutu 3" },
    });
    expect(next.safety.crisisContactPhone).toBe("+15551230000");
    expect(next.platform.siteName).toBe("Edutu 3");
  });

  it("rejects a blank crisis contact number", () => {
    expect(() =>
      mergeAdminSettings({ safety: { crisisContactPhone: "" } }),
    ).toThrow();
  });
});

describe("mergeAdminSettings — server-driven home + custom features", () => {
  it("defaults the new mobileApp keys for legacy stored settings", () => {
    const merged = mergeAdminSettings({
      mobileApp: {
        forceUpdate: DEFAULT_ADMIN_SETTINGS.mobileApp.forceUpdate,
        maintenance: DEFAULT_ADMIN_SETTINGS.mobileApp.maintenance,
        moduleLocks: {},
        // featureFlags / homeLayout / customFeatures omitted — legacy shape.
      },
    });

    expect(merged.mobileApp.featureFlags).toEqual({});
    expect(merged.mobileApp.homeLayout).toEqual({
      draft: [],
      published: [],
      lastPublished: [],
    });
    expect(merged.mobileApp.customFeatures).toEqual([]);
  });

  it("preserves published layout when a save only touches the draft", () => {
    const current = mergeAdminSettings({
      mobileApp: {
        ...DEFAULT_ADMIN_SETTINGS.mobileApp,
        homeLayout: {
          draft: [],
          published: [
            {
              id: "b1",
              type: "announcement",
              props: { title: "Hi" },
              enabled: true,
            },
          ],
          lastPublished: [],
        },
      },
    });

    // A later write that carries only a draft edit must not wipe published.
    const next = mergeAdminSettings({
      ...current,
      mobileApp: {
        ...current.mobileApp,
        homeLayout: {
          ...current.mobileApp.homeLayout,
          draft: [{ id: "b2", type: "info_card", props: {}, enabled: true }],
        },
      },
    });

    expect(next.mobileApp.homeLayout.published).toHaveLength(1);
    expect(next.mobileApp.homeLayout.published[0].id).toBe("b1");
    expect(next.mobileApp.homeLayout.draft[0].id).toBe("b2");
  });

  it("defaults optional block/feature fields and fills props", () => {
    const merged = mergeAdminSettings({
      mobileApp: {
        ...DEFAULT_ADMIN_SETTINGS.mobileApp,
        homeLayout: {
          draft: [],
          published: [{ id: "b1", type: "categories" }],
          lastPublished: [],
        },
        customFeatures: [
          { id: "f1", title: "Community", url: "https://edutu.org/community" },
        ],
      },
    });

    expect(merged.mobileApp.homeLayout.published[0].props).toEqual({});
    expect(merged.mobileApp.homeLayout.published[0].enabled).toBe(true);
    const feature = merged.mobileApp.customFeatures[0];
    expect(feature.openMode).toBe("webview");
    expect(feature.placement).toBe("tools");
    expect(feature.enabled).toBe(true);
  });

  it("rejects a custom feature with no url and an invalid openMode", () => {
    expect(() =>
      mergeAdminSettings({
        mobileApp: {
          ...DEFAULT_ADMIN_SETTINGS.mobileApp,
          customFeatures: [{ id: "f1", title: "Bad", url: "" }],
        },
      }),
    ).toThrow();

    expect(() =>
      mergeAdminSettings({
        mobileApp: {
          ...DEFAULT_ADMIN_SETTINGS.mobileApp,
          customFeatures: [
            { id: "f1", title: "Bad", url: "https://x.io", openMode: "iframe" },
          ],
        },
      }),
    ).toThrow();
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
