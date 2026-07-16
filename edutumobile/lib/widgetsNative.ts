import { Platform } from 'react-native';

/**
 * Widget helpers `require('expo-widgets')` lazily, but that import EAGERLY calls
 * `requireNativeModule('ExpoWidgets')` (see expo-widgets/ExpoWidgets.ios.js),
 * which logs "Cannot find native module 'ExpoWidgets'" to console.error and
 * throws — so a try/catch around the require still leaves the log spam. In Expo
 * Go / Jest the native module is absent.
 *
 * `requireOptionalNativeModule` resolves the same registry but returns null
 * (no log, no throw) when the module isn't linked, so we probe with it first and
 * only touch `expo-widgets` when the module is actually present.
 */
let cached: boolean | undefined;

export function hasWidgetsNativeModule(): boolean {
  if (Platform.OS !== 'ios') return false;
  if (cached !== undefined) return cached;
  try {
     
    const { requireOptionalNativeModule } = require('expo') as typeof import('expo');
    cached = requireOptionalNativeModule('ExpoWidgets') != null;
  } catch {
    cached = false;
  }
  return cached;
}
