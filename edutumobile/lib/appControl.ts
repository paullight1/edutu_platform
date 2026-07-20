import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  normaliseHomeLayout,
  normaliseCustomFeatures,
  type CustomFeature,
  type HomeBlock,
} from './homeBlocks';

// ─── Remote app control ───────────────────────────────────────────────────────
// Admin-managed gating served inside GET /mobile-control/config (appControl
// key): forced upgrade, maintenance lockout, and per-module access locks.
// Fail-open by design: if the config can't be fetched and nothing is cached,
// nothing is gated — a network hiccup must never brick the app.

export type ModuleAccess = 'free' | 'pro' | 'disabled';

export interface ForceUpdateConfig {
  enabled: boolean;
  minVersion: string;
  title: string;
  message: string;
  iosStoreUrl: string;
  androidStoreUrl: string;
  otaFirst: boolean;
}

export interface MaintenanceConfig {
  enabled: boolean;
  title: string;
  message: string;
}

export interface AppControlConfig {
  forceUpdate: ForceUpdateConfig;
  maintenance: MaintenanceConfig;
  moduleLocks: Record<string, ModuleAccess>;
  // Simple on/off reveal flags for dark-shipped features (key -> enabled).
  featureFlags: Record<string, boolean>;
  // Published, server-driven home layout (empty = built-in hardcoded home).
  homeLayout: HomeBlock[];
  // Enabled admin-defined web-backed features.
  customFeatures: CustomFeature[];
}

export const OPEN_APP_CONTROL: AppControlConfig = {
  forceUpdate: {
    enabled: false,
    minVersion: '1.0.0',
    title: '',
    message: '',
    iosStoreUrl: '',
    androidStoreUrl: '',
    otaFirst: true,
  },
  maintenance: { enabled: false, title: '', message: '' },
  moduleLocks: {},
  featureFlags: {},
  homeLayout: [],
  customFeatures: [],
};

// Registry of remotely lockable modules. `prefixes` are pathname prefixes the
// lock applies to (matched against the normalized expo-router pathname), and
// `label` is what the admin screen shows. Adding a module here is all that's
// needed on the client — the admin screen and lock overlay both read this map.
export const LOCKABLE_MODULES: Record<
  string,
  { label: string; prefixes: string[] }
> = {
  chat: { label: 'AI Chat', prefixes: ['/chat'] },
  cv: { label: 'CV Builder', prefixes: ['/cv'] },
  copilot: { label: 'Application Co-pilot', prefixes: ['/copilot'] },
  roadmaps: {
    label: 'Goals & Roadmaps',
    prefixes: ['/roadmaps', '/goals', '/roadmap-templates'],
  },
  savedSearches: { label: 'Saved-search Alerts', prefixes: ['/saved-searches'] },
  wallet: { label: 'Wallet & Credits', prefixes: ['/wallet'] },
};

export function moduleForPathname(pathname: string): string | null {
  const path = (pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
  for (const [key, def] of Object.entries(LOCKABLE_MODULES)) {
    if (def.prefixes.some((p) => path === p || path.startsWith(`${p}/`))) {
      return key;
    }
  }
  return null;
}

export function getModuleAccess(
  config: AppControlConfig | null | undefined,
  moduleKey: string,
): ModuleAccess {
  const access = config?.moduleLocks?.[moduleKey];
  return access === 'pro' || access === 'disabled' ? access : 'free';
}

/**
 * Remote on/off state for a reveal flag. Fail-open default: an unconfigured
 * flag (or missing config) returns the caller's fallback, which should be the
 * feature's built-in default so a config miss never hides a shipped feature
 * that used to be on.
 */
export function getFeatureFlag(
  config: AppControlConfig | null | undefined,
  key: string,
  fallback = false,
): boolean {
  const value = config?.featureFlags?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * True when `current` is an older version than `min`. Tolerates missing
 * segments ("1.2" vs "1.2.0") and non-numeric garbage (treated as 0). Unknown
 * or empty versions are never considered outdated — fail open.
 */
export function isVersionBelow(current: string | null | undefined, min: string): boolean {
  if (!current || !min) return false;
  const parse = (v: string) => v.trim().split('.').map((part) => Number.parseInt(part, 10) || 0);
  const cur = parse(current);
  const req = parse(min);
  const len = Math.max(cur.length, req.length);
  for (let i = 0; i < len; i += 1) {
    const a = cur[i] ?? 0;
    const b = req[i] ?? 0;
    if (a !== b) return a < b;
  }
  return false;
}

export function normaliseAppControl(payload: unknown): AppControlConfig {
  if (!payload || typeof payload !== 'object') return OPEN_APP_CONTROL;
  const record = payload as Partial<AppControlConfig>;

  const forceUpdate = { ...OPEN_APP_CONTROL.forceUpdate };
  if (record.forceUpdate && typeof record.forceUpdate === 'object') {
    const fu = record.forceUpdate;
    forceUpdate.enabled = fu.enabled === true;
    if (typeof fu.minVersion === 'string') forceUpdate.minVersion = fu.minVersion;
    if (typeof fu.title === 'string') forceUpdate.title = fu.title;
    if (typeof fu.message === 'string') forceUpdate.message = fu.message;
    if (typeof fu.iosStoreUrl === 'string') forceUpdate.iosStoreUrl = fu.iosStoreUrl;
    if (typeof fu.androidStoreUrl === 'string') forceUpdate.androidStoreUrl = fu.androidStoreUrl;
    forceUpdate.otaFirst = fu.otaFirst !== false;
  }

  const maintenance = { ...OPEN_APP_CONTROL.maintenance };
  if (record.maintenance && typeof record.maintenance === 'object') {
    const mt = record.maintenance;
    maintenance.enabled = mt.enabled === true;
    if (typeof mt.title === 'string') maintenance.title = mt.title;
    if (typeof mt.message === 'string') maintenance.message = mt.message;
  }

  const moduleLocks: Record<string, ModuleAccess> = {};
  if (record.moduleLocks && typeof record.moduleLocks === 'object') {
    for (const [key, value] of Object.entries(record.moduleLocks)) {
      if (value === 'pro' || value === 'disabled' || value === 'free') {
        moduleLocks[key] = value;
      }
    }
  }

  const featureFlags: Record<string, boolean> = {};
  if (record.featureFlags && typeof record.featureFlags === 'object') {
    for (const [key, value] of Object.entries(record.featureFlags)) {
      if (typeof value === 'boolean') featureFlags[key] = value;
    }
  }

  return {
    forceUpdate,
    maintenance,
    moduleLocks,
    featureFlags,
    homeLayout: normaliseHomeLayout(record.homeLayout),
    customFeatures: normaliseCustomFeatures(record.customFeatures),
  };
}

// ─── Last-known-config cache ─────────────────────────────────────────────────
// Locks and gates keep working from the last successful fetch when the app
// starts offline; they refresh (and release) on the next successful fetch.

const APP_CONTROL_CACHE_KEY = '@edutu_app_control:v1';

export async function readCachedAppControl(): Promise<AppControlConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(APP_CONTROL_CACHE_KEY);
    if (!raw) return null;
    return normaliseAppControl(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeCachedAppControl(config: AppControlConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(APP_CONTROL_CACHE_KEY, JSON.stringify(config));
  } catch {
    // Cache is best-effort.
  }
}
