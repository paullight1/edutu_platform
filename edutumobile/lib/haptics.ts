import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Single source of truth for the on/off preference: the same persisted
// notification-settings blob the Settings screen writes (`hapticsEnabled`).
// Keep this key in sync with lib/notifications.ts.
const SETTINGS_KEY = '@edutu_notification_settings';

// In-memory mirror so every tap is a cheap synchronous check — no AsyncStorage
// read per haptic. Defaults on; hydrated once from storage, and updated live
// when the Settings toggle flips.
let enabled = true;
let hydrated = false;

/**
 * Load the on/off flag from the persisted settings. Call once at startup;
 * fire() also self-hydrates on first use so a haptic never fires against a
 * stale default.
 */
export async function hydrateHaptics(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { hapticsEnabled?: boolean };
      if (typeof parsed.hapticsEnabled === 'boolean') enabled = parsed.hapticsEnabled;
    }
  } catch {
    // Unreadable settings → keep the default (on).
  } finally {
    hydrated = true;
  }
}

/** Reflect a Settings toggle instantly, without waiting for a re-read. */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
  hydrated = true;
}

export function isHapticsEnabled(): boolean {
  return enabled;
}

// Fire-and-forget: haptics must never block or throw into the UI. When the flag
// is not yet hydrated we hydrate first, then re-check so a stored "off" wins.
function fire(run: () => Promise<void>): void {
  if (!enabled) return;
  const go = () => {
    if (enabled) run().catch(() => undefined);
  };
  if (hydrated) go();
  else void hydrateHaptics().then(go);
}

/**
 * App-wide haptics. Every call is gated by the user's Settings toggle, so
 * turning haptics off silences the whole app. Prefer these over calling
 * expo-haptics directly.
 */
export const haptics = {
  /** Light tap — default button/press feedback. */
  light: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Medium tap — confirmations, toggles. */
  medium: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Heavy tap — significant actions. */
  heavy: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** Selection tick — moving through options/segments. */
  selection: () => fire(() => Haptics.selectionAsync()),
  /** Success notification — completed/won actions. */
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Warning notification. */
  warning: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Error notification — failures. */
  error: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
