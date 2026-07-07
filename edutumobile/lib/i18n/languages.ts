export type LanguageCode =
    | 'en'
    | 'fr'
    | 'sw'
    | 'ha'
    | 'ar'
    | 'zh'
    | 'es'
    | 'pt'
    | 'hi';

export interface AppLanguage {
    code: LanguageCode;
    /** Language name in English, for logs/analytics. */
    name: string;
    /** Language name in the language itself — what the picker shows. */
    nativeName: string;
    rtl?: boolean;
}

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export const SUPPORTED_LANGUAGES: AppLanguage[] = [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'fr', name: 'French', nativeName: 'Français' },
    { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
    { code: 'ha', name: 'Hausa', nativeName: 'Hausa' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
    { code: 'zh', name: 'Chinese (Simplified)', nativeName: '简体中文' },
    { code: 'es', name: 'Spanish', nativeName: 'Español' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
];

export function isSupportedLanguage(code: string | null | undefined): code is LanguageCode {
    return SUPPORTED_LANGUAGES.some((lang) => lang.code === code);
}

export function isRtlLanguage(code: string): boolean {
    return SUPPORTED_LANGUAGES.some((lang) => lang.code === code && lang.rtl);
}
