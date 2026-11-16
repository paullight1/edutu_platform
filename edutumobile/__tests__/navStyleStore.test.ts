/**
 * Bottom-nav style preference: persistence, hydration and validation.
 *
 * AsyncStorage is already mocked in-memory by jest.setup.ts, so this drives
 * the real store against that.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@edutu/navBarStyle';

// Each test needs a module with fresh hydration state, so re-require it per
// test. Only this module is isolated — React is never re-required here.
function loadStore(): typeof import('../lib/navStyleStore') {
  let mod!: typeof import('../lib/navStyleStore');
  jest.isolateModules(() => {
    mod = require('../lib/navStyleStore');
  });
  return mod;
}

const flush = () => new Promise((r) => setImmediate(r));

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('navStyleStore', () => {
  it('defaults to glass', () => {
    expect(loadStore().getNavStyleSettings().style).toBe('glass');
  });

  it('persists the chosen style', async () => {
    const mod = loadStore();
    mod.setNavBarStyle('fab');
    expect(mod.getNavStyleSettings().style).toBe('fab');
    await flush();
    expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!)).toEqual({ style: 'fab' });
  });

  it('is a no-op when the style is unchanged', async () => {
    const mod = loadStore();
    mod.setNavBarStyle('glass'); // already the default
    await flush();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('hydrates a saved style', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ style: 'fab' }));
    const mod = loadStore();
    expect(mod.getNavStyleSettings().style).toBe('glass'); // pre-hydration default

    await mod.hydrateNavBarStyle();

    expect(mod.getNavStyleSettings()).toEqual({ style: 'fab', hydrated: true });
  });

  it('returns a new state object on change so useSyncExternalStore re-renders', async () => {
    const mod = loadStore();
    await mod.hydrateNavBarStyle();
    const before = mod.getNavStyleSettings();

    mod.setNavBarStyle('fab');
    expect(mod.getNavStyleSettings()).not.toBe(before);

    // ...and a stable identity when nothing changed, to avoid useless renders.
    const after = mod.getNavStyleSettings();
    mod.setNavBarStyle('fab');
    expect(mod.getNavStyleSettings()).toBe(after);
  });

  it.each(['glass', 'fab', 'tabs', 'center'] as const)('round-trips %s', async (style) => {
    const writer = loadStore();
    writer.setNavBarStyle(style);
    await flush();

    const reader = loadStore();
    await reader.hydrateNavBarStyle();
    expect(reader.getNavStyleSettings().style).toBe(style);
  });

  it('treats only glass as the floating pill', () => {
    const mod = loadStore();
    expect(mod.isBarStyle('glass')).toBe(false);
    expect(mod.isBarStyle('fab')).toBe(true);
    expect(mod.isBarStyle('tabs')).toBe(true);
    expect(mod.isBarStyle('center')).toBe(true);
  });

  it('rejects an unknown persisted value and falls back to glass', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ style: 'neon' }));
    const mod = loadStore();
    await mod.hydrateNavBarStyle();
    expect(mod.getNavStyleSettings().style).toBe('glass');
  });

  it('survives corrupt stored JSON', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '{not json');
    const mod = loadStore();
    await mod.hydrateNavBarStyle();
    expect(mod.getNavStyleSettings()).toEqual({ style: 'glass', hydrated: true });
  });

  it('does not let hydration clobber a choice made while it was in flight', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ style: 'glass' }));
    const mod = loadStore();
    const inFlight = mod.hydrateNavBarStyle();
    mod.setNavBarStyle('fab'); // user taps before the read resolves
    await inFlight;
    expect(mod.getNavStyleSettings().style).toBe('fab');
  });
});
