import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de' | 'zh' | 'ar';

interface Language {
    code: SupportedLanguage;
    name: string;
    nativeName: string;
}

const LANGUAGES: Language[] = [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'es', name: 'Spanish', nativeName: 'Español' },
    { code: 'fr', name: 'French', nativeName: 'Français' },
    { code: 'de', name: 'German', nativeName: 'Deutsch' },
    { code: 'zh', name: 'Chinese', nativeName: '中文' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
];

function getFlagEmoji(langCode: string): string {
    const flags: Record<string, string> = {
        en: '🇺🇸', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪', zh: '🇨🇳', ar: '🇸🇦',
    };
    return flags[langCode] || '🌐';
}

export function LanguageSelector() {
    const { isDark, colors } = useTheme();
    const currentLang = 'en'; // Hardcoded for now as we don't have i18n plumbing yet

    return (
        <View className="p-1">
            {LANGUAGES.map((lang) => {
                const isActive = currentLang === lang.code;
                return (
                    <TouchableOpacity
                        key={lang.code}
                        activeOpacity={0.7}
                        className={`flex-row items-center justify-between p-4 rounded-xl mb-2 border ${isActive
                                ? 'border-indigo-500/30'
                                : 'border-transparent'
                            }`}
                        style={{ backgroundColor: isActive ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.02)' }}
                    >
                        <View className="flex-row items-center">
                            <Text className="text-xl mr-3">{getFlagEmoji(lang.code)}</Text>
                            <View>
                                <Text className="font-bold text-sm" style={{ color: colors.foreground }}>{lang.nativeName}</Text>
                                {lang.code !== 'en' && (
                                    <Text className="text-[10px]" style={{ color: isDark ? '#64748B' : '#94A3B8' }}>{lang.name}</Text>
                                )}
                            </View>
                        </View>
                        {isActive && <Check size={18} color="#6366f1" />}
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}
