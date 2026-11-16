import {
  getModuleAccess,
  isVersionBelow,
  moduleForPathname,
  normaliseAppControl,
  OPEN_APP_CONTROL,
} from '../lib/appControl';

describe('isVersionBelow', () => {
  it('detects older versions', () => {
    expect(isVersionBelow('1.0.0', '1.0.1')).toBe(true);
    expect(isVersionBelow('1.9.9', '2.0.0')).toBe(true);
    expect(isVersionBelow('0.9', '1.0.0')).toBe(true);
  });

  it('passes equal and newer versions', () => {
    expect(isVersionBelow('1.0.1', '1.0.1')).toBe(false);
    expect(isVersionBelow('1.2.0', '1.0.9')).toBe(false);
    expect(isVersionBelow('2.0', '1.9.9')).toBe(false);
  });

  it('tolerates missing segments ("1.2" == "1.2.0")', () => {
    expect(isVersionBelow('1.2', '1.2.0')).toBe(false);
    expect(isVersionBelow('1.2', '1.2.1')).toBe(true);
  });

  it('fails open on unknown versions', () => {
    expect(isVersionBelow(null, '1.0.0')).toBe(false);
    expect(isVersionBelow(undefined, '1.0.0')).toBe(false);
    expect(isVersionBelow('', '1.0.0')).toBe(false);
    expect(isVersionBelow('1.0.0', '')).toBe(false);
  });
});

describe('moduleForPathname', () => {
  it('matches module prefixes and their subroutes', () => {
    expect(moduleForPathname('/chat')).toBe('chat');
    expect(moduleForPathname('/cv')).toBe('cv');
    expect(moduleForPathname('/copilot/abc-123')).toBe('copilot');
    expect(moduleForPathname('/goals/my-list')).toBe('roadmaps');
    expect(moduleForPathname('/roadmap-templates')).toBe('roadmaps');
    expect(moduleForPathname('/saved-searches')).toBe('savedSearches');
    expect(moduleForPathname('/wallet')).toBe('wallet');
  });

  it('ignores unrelated and partially-matching routes', () => {
    expect(moduleForPathname('/')).toBeNull();
    expect(moduleForPathname('/opportunities')).toBeNull();
    expect(moduleForPathname('/paywall')).toBeNull();
    // '/chatter' must not match '/chat'
    expect(moduleForPathname('/chatter')).toBeNull();
  });

  it('normalises trailing slashes and case', () => {
    expect(moduleForPathname('/Chat/')).toBe('chat');
  });
});

describe('normaliseAppControl', () => {
  it('returns the open config for junk payloads', () => {
    expect(normaliseAppControl(null)).toEqual(OPEN_APP_CONTROL);
    expect(normaliseAppControl('nope')).toEqual(OPEN_APP_CONTROL);
    expect(normaliseAppControl(42)).toEqual(OPEN_APP_CONTROL);
  });

  it('keeps only valid module locks', () => {
    const config = normaliseAppControl({
      moduleLocks: { cv: 'pro', chat: 'disabled', goals: 'banana', x: 1 },
    });
    expect(config.moduleLocks).toEqual({ cv: 'pro', chat: 'disabled' });
  });

  it('coerces enabled flags to real booleans', () => {
    const config = normaliseAppControl({
      forceUpdate: { enabled: 'yes', minVersion: '2.0.0' },
      maintenance: { enabled: 1 },
    });
    expect(config.forceUpdate.enabled).toBe(false);
    expect(config.maintenance.enabled).toBe(false);
    expect(config.forceUpdate.minVersion).toBe('2.0.0');
  });

  it('defaults the server-driven keys and keeps only boolean feature flags', () => {
    expect(normaliseAppControl({}).featureFlags).toEqual({});
    expect(normaliseAppControl({}).homeLayout).toEqual([]);
    expect(normaliseAppControl({}).customFeatures).toEqual([]);

    const config = normaliseAppControl({
      featureFlags: { newTab: true, beta: 'yes', off: false },
    });
    expect(config.featureFlags).toEqual({ newTab: true, off: false });
  });

  it('normalises embedded home layout and custom features', () => {
    const config = normaliseAppControl({
      homeLayout: [{ id: 'a', type: 'announcement', props: { title: 'Hi' } }],
      customFeatures: [
        { id: 'f1', title: 'Community', url: 'https://edutu.org/community' },
      ],
    });
    expect(config.homeLayout).toHaveLength(1);
    expect(config.homeLayout[0].id).toBe('a');
    expect(config.customFeatures[0].openMode).toBe('webview');
  });
});

describe('getModuleAccess', () => {
  it('defaults to free for unknown modules or missing config', () => {
    expect(getModuleAccess(null, 'cv')).toBe('free');
    expect(getModuleAccess(OPEN_APP_CONTROL, 'cv')).toBe('free');
  });

  it('returns the configured lock', () => {
    const config = { ...OPEN_APP_CONTROL, moduleLocks: { cv: 'pro' as const } };
    expect(getModuleAccess(config, 'cv')).toBe('pro');
  });
});
