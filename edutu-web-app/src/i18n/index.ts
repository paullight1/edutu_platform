import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enTranslations from './locales/en.json';
import esTranslations from './locales/es.json';
import frTranslations from './locales/fr.json';
import deTranslations from './locales/de.json';
import zhTranslations from './locales/zh.json';
import arTranslations from './locales/ar.json';

export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de' | 'zh' | 'ar';

export type SupportedLanguageOption = {
    code: SupportedLanguage;
    label: string;
    dir: 'ltr' | 'rtl';
};

const LANGUAGE_CONFIG: Record<SupportedLanguage, { label: string; dir: 'ltr' | 'rtl' }> = {
    en: { label: 'English', dir: 'ltr' },
    es: { label: 'Español', dir: 'ltr' },
    fr: { label: 'Français', dir: 'ltr' },
    de: { label: 'Deutsch', dir: 'ltr' },
    zh: { label: '中文', dir: 'ltr' },
    ar: { label: 'العربية', dir: 'rtl' },
};

export const supportedLanguages: SupportedLanguageOption[] = (
    Object.keys(LANGUAGE_CONFIG) as SupportedLanguage[]
).map((code) => ({
    code,
    label: LANGUAGE_CONFIG[code].label,
    dir: LANGUAGE_CONFIG[code].dir,
}));

const STORAGE_KEY = 'edutu-language';

const isSupportedLanguage = (
    value: string | null | undefined,
): value is SupportedLanguage => !!value && value in LANGUAGE_CONFIG;

const detectLanguage = (): SupportedLanguage => {
    if (typeof window !== 'undefined') {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (isSupportedLanguage(saved)) return saved;

        if (typeof navigator !== 'undefined' && navigator.language) {
            const browserLang = navigator.language.split('-')[0];
            if (isSupportedLanguage(browserLang)) return browserLang;
        }
    }
    return 'en';
};

const applyDocumentLanguage = (lang: SupportedLanguage) => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang;
    document.documentElement.dir = LANGUAGE_CONFIG[lang].dir;
};

i18n.use(initReactI18next).init({
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
        escapeValue: false,
    },
    ns: ['translation'],
    defaultNS: 'translation',
    react: {
        useSuspense: false,
    },
});

applyDocumentLanguage(detectLanguage());

export const changeLanguage = (lang: SupportedLanguage) => {
    void i18n.changeLanguage(lang);
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, lang);
    }
    applyDocumentLanguage(lang);
};

export const getCurrentLanguage = (): SupportedLanguage => {
    const current = i18n.language?.split('-')[0];
    return isSupportedLanguage(current) ? current : 'en';
};

export const getAvailableLanguages = (): SupportedLanguageOption[] => supportedLanguages;

export default i18n;
