/**
 * Secure Storage Service
 *
 * Wraps expo-secure-store for sensitive data (tokens, API keys).
 * Falls back to AsyncStorage with a warning when SecureStore is unavailable
 * (e.g., in Expo Go or web).
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Secure keys ───────────────────────────────────────────────────────────

export const SECURE_KEYS = {
  AUTH_TOKEN: 'edutu_auth_token',
  REFRESH_TOKEN: 'edutu_refresh_token',
  API_KEY: 'edutu_api_key',
  CLERK_TOKEN: 'edutu_clerk_token',
} as const;

// ── Availability ──────────────────────────────────────────────────────────

let secureStoreAvailable: boolean | null = null;

export async function isSecureStoreAvailable(): Promise<boolean> {
  if (secureStoreAvailable !== null) return secureStoreAvailable;

  try {
    const testKey = '__edutu_secure_store_test__';
    await SecureStore.setItemAsync(testKey, 'test');
    await SecureStore.deleteItemAsync(testKey);
    secureStoreAvailable = true;
  } catch {
    console.warn(
      '[Edutu] SecureStore is not available. Sensitive data will be stored ' +
        'in AsyncStorage. This is acceptable for development but should not ' +
        'happen in production builds.',
    );
    secureStoreAvailable = false;
  }

  return secureStoreAvailable;
}

// ── Core operations ───────────────────────────────────────────────────────

export async function setSecure(key: string, value: string): Promise<void> {
  const available = await isSecureStoreAvailable();

  if (available) {
    await SecureStore.setItemAsync(key, value);
  } else {
    await AsyncStorage.setItem(`secure:${key}`, value);
  }
}

export async function getSecure(key: string): Promise<string | null> {
  const available = await isSecureStoreAvailable();

  if (available) {
    return SecureStore.getItemAsync(key);
  }

  return AsyncStorage.getItem(`secure:${key}`);
}

export async function deleteSecure(key: string): Promise<void> {
  const available = await isSecureStoreAvailable();

  if (available) {
    await SecureStore.deleteItemAsync(key);
  } else {
    await AsyncStorage.removeItem(`secure:${key}`);
  }
}

// ── Migration ─────────────────────────────────────────────────────────────

export async function migrateFromAsyncStorage(
  asyncStorageKey: string,
  secureKey?: string,
): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(asyncStorageKey);
    if (!value) return false;

    const targetKey = secureKey || asyncStorageKey;
    await setSecure(targetKey, value);
    await AsyncStorage.removeItem(asyncStorageKey);

    return true;
  } catch (error) {
    console.error('[Edutu] Migration to SecureStore failed:', error);
    return false;
  }
}

// ── Convenience ───────────────────────────────────────────────────────────

export async function storeAuthToken(token: string): Promise<void> {
  await setSecure(SECURE_KEYS.AUTH_TOKEN, token);
}

export async function getAuthToken(): Promise<string | null> {
  return getSecure(SECURE_KEYS.AUTH_TOKEN);
}

export async function clearAuthToken(): Promise<void> {
  await deleteSecure(SECURE_KEYS.AUTH_TOKEN);
  await deleteSecure(SECURE_KEYS.REFRESH_TOKEN);
  await deleteSecure(SECURE_KEYS.CLERK_TOKEN);
}

export async function storeRefreshToken(token: string): Promise<void> {
  await setSecure(SECURE_KEYS.REFRESH_TOKEN, token);
}

export async function getRefreshToken(): Promise<string | null> {
  return getSecure(SECURE_KEYS.REFRESH_TOKEN);
}
