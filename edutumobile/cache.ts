import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Clerk persists the session token here across launches. The keychain
// accessibility MUST be AFTER_FIRST_UNLOCK.
//
// Why this matters (root cause of "users get signed out and forced to re-login
// even after logging in"): SecureStore's default is WHEN_UNLOCKED, which makes
// the item unreadable whenever the OS is locked. Clerk refreshes the session
// token on a timer and during cold launch — some of those reads happen while
// the device is locked or mid-unlock. With WHEN_UNLOCKED that read THROWS, the
// catch below deletes the token, and the session is lost permanently. With
// AFTER_FIRST_UNLOCK the item stays readable after the first unlock following a
// reboot (even when later locked), so the token survives and the session
// persists. This mirrors Clerk's own official expo token cache.
const secureStoreOptions: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

const nativeTokenCache = {
    async getToken(key: string) {
        try {
            return await SecureStore.getItemAsync(key, secureStoreOptions);
        } catch (error) {
            // Only reached when the item is genuinely unreadable/corrupt — with
            // AFTER_FIRST_UNLOCK transient lock-state failures no longer land
            // here. Clear it so a fresh login can rewrite a valid token.
            console.error('SecureStore get item error: ', error);
            try {
                await SecureStore.deleteItemAsync(key, secureStoreOptions);
            } catch {
                // ignore
            }
            return null;
        }
    },
    async saveToken(key: string, value: string) {
        try {
            await SecureStore.setItemAsync(key, value, secureStoreOptions);
        } catch (error) {
            console.error('SecureStore save item error: ', error);
        }
    },
};

// On web SecureStore is unavailable; leaving tokenCache undefined lets Clerk
// fall back to its own browser storage (matching @clerk/clerk-expo defaults).
export const tokenCache = Platform.OS === 'web' ? undefined : nativeTokenCache;
