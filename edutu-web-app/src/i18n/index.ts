import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import language files
import enTranslations from './locales/en.json';
import esTranslations from './locales/es.json';
import frTranslations from './locales/fr.json';
import deTranslations from './locales/de.json';
import zhTranslations from './locales/zh.json';
import arTranslations from './locales/ar.json';

/**
 * i18n Configuration for Edutu App
 * Supports multi-language internationalization
 */

// Language definitions
export const supportedLanguages = {
    en: { name: 'English', nativeName: 'English', dir: 'ltr' },
    es: { name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
    fr: { name: 'French', nativeName: 'Français', dir: 'ltr' },
    de: { name: 'German', nativeName: 'Deutsch', dir: 'ltr' },
    zh: { name: 'Chinese', nativeName: '中文', dir: 'ltr' },
    ar: { name: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
} as const;

export type SupportedLanguage = keyof typeof supportedLanguages;

// Detect user's preferred language
const detectLanguage = (): SupportedLanguage => {
    // Check localStorage first
    const saved = localStorage.getItem('edutu-language');
    if (saved && saved in supportedLanguages) {
        return saved as SupportedLanguage;
    }

    // Check browser language
    const browserLang = navigator.language.split('-')[0];
    if (browserLang in supportedLanguages) {
        return browserLang as SupportedLanguage;
    }

    // Default to English
    return 'en';
};

// Initialize i18n
i18n
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: enTranslations },
            es: { translation: esTranslations },
            fr: { translation: frTranslations },
            de: { translation: deTranslations },
            zh: { translation: zhTranslations },
            ar: { translation: arTranslations },
        },
        lng: detectLanguage(),
        fallbackLng: 'en',
        debug: import.meta.env.DEV,

        interpolation: {
            escapeValue: false, // React already escapes values
        },

        // Namespace configuration
        ns: ['translation'],
        defaultNS: 'translation',

        // React specific options
        react: {
            useSuspense: true,
            bindI18n: 'languageChanged loaded',
            bindI18nStore: 'added removed',
            transEmptyNodeValue: '',
            transSupportBasicHtmlNodes: true,
            transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'p', 'span'],
        },
    });

// Language change handler with document update
export const changeLanguage = (lang: SupportedLanguage) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('edutu-language', lang);

    // Update document attributes for RTL support
    const langConfig = supportedLanguages[lang];
    document.documentElement.lang = lang;
    document.documentElement.dir = langConfig.dir;
};

// Get current language
export const getCurrentLanguage = (): SupportedLanguage => {
    return i18n.language as SupportedLanguage;
};

// Get all available languages
export const getAvailableLanguages = () => {
    return Object.entries(supportedLanguages).map(([code, config]) => ({
        code: code as SupportedLanguage,
        ...config,
    }));
};

export default i18n;
