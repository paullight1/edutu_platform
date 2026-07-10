import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resources, namespaces } from './resources';
import {
    DEFAULT_LANGUAGE,
    isRtlLanguage,
    isSupportedLanguage,
    SUPPORTED_LANGUAGES,
    type LanguageCode,
} from './languages';

export { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, isRtlLanguage } from './languages';
export type { LanguageCode, AppLanguage } from './languages';

const LANGUAGE_STORAGE_KEY = '@edutu/language';

/** Best-effort device locale; expo-localization needs a native rebuild, so never let it crash boot. */
function detectDeviceLanguage(): LanguageCode {
    try {
        // Lazy + optional: on a stale dev client the native module may be
        // absent, and `expo-localization`'s entry throws the moment it's
        // evaluated. Requiring it here (inside try/catch) instead of at the
        // top of the module keeps that failure from crashing app boot.
        const Localization = require('expo-localization') as typeof import('expo-localization');
        const locales = Localization.getLocales();
        for (const locale of locales ?? []) {
            const code = locale?.languageCode?.toLowerCase();
            if (isSupportedLanguage(code)) {
                return code;
            }
        }
    } catch {
        // Native module unavailable (e.g. stale dev client) — fall through.
    }
    return DEFAULT_LANGUAGE;
}

// Initialize synchronously with bundled catalogs so the very first render can
// translate. The persisted choice is restored asynchronously right after.
void i18n.use(initReactI18next).init({
    resources,
    ns: namespaces,
    defaultNS: 'common',
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: false },
});

/**
 * Restore the user's saved language (or fall back to the device locale on
 * first launch). Called once from the root layout.
 */
export async function initStoredLanguage(): Promise<void> {
    try {
        const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        const language = isSupportedLanguage(stored) ? stored : detectDeviceLanguage();
        if (language !== i18n.language) {
            await i18n.changeLanguage(language);
        }
    } catch {
        // Keep the default language rather than crash boot.
    }
}

/**
 * Change the app language and persist it.
 *
 * Returns `needsRestart: true` when the layout direction changed (e.g.
 * English → Arabic); React Native only applies a new direction after a
 * restart, so callers should offer one (see `restartApp`).
 */
export async function setAppLanguage(code: LanguageCode): Promise<{ needsRestart: boolean }> {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
    await i18n.changeLanguage(code);

    const shouldBeRtl = isRtlLanguage(code);
    const needsRestart = shouldBeRtl !== I18nManager.isRTL;
    if (needsRestart) {
        I18nManager.allowRTL(shouldBeRtl);
        I18nManager.forceRTL(shouldBeRtl);
    }
    return { needsRestart };
}

/** Reload the JS bundle so a direction change takes effect. */
export async function restartApp(): Promise<void> {
    try {
        const Updates = await import('expo-updates');
        await Updates.reloadAsync();
    } catch {
        // expo-updates unavailable (dev client without the module) — the
        // direction change will apply on the next manual app restart.
    }
}

export function getCurrentLanguage(): LanguageCode {
    return isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
}

export default i18n;
