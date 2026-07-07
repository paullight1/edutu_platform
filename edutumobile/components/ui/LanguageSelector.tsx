import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import {
    SUPPORTED_LANGUAGES,
    setAppLanguage,
    restartApp,
    getCurrentLanguage,
    type LanguageCode,
} from '../../lib/i18n';

function getFlagEmoji(langCode: string): string {
    const flags: Record<string, string> = {
        en: '🇬🇧', fr: '🇫🇷', sw: '🇹🇿', ha: '🇳🇬', ar: '🇸🇦',
        zh: '🇨🇳', es: '🇪🇸', pt: '🇵🇹', hi: '🇮🇳',
    };
    return flags[langCode] || '🌐';
}

export function LanguageSelector() {
    const { t } = useTranslation('settings');
    const { isDark, colors } = useTheme();
    const [currentLang, setCurrentLang] = useState<LanguageCode>(getCurrentLanguage());

    const handleSelect = async (code: LanguageCode) => {
        if (code === currentLang) {
            return;
        }
        setCurrentLang(code);
        const { needsRestart } = await setAppLanguage(code);
        if (needsRestart) {
            const languageName =
                SUPPORTED_LANGUAGES.find((lang) => lang.code === code)?.nativeName ?? code;
            Alert.alert(
                t('language.restartTitle'),
                t('language.restartMessage', { language: languageName }),
                [
                    { text: t('language.restartLater'), style: 'cancel' },
                    { text: t('language.restartNow'), onPress: () => void restartApp() },
                ],
            );
        }
    };

    return (
        <View className="p-1">
            {SUPPORTED_LANGUAGES.map((lang) => {
                const isActive = currentLang === lang.code;
                return (
                    <TouchableOpacity
                        key={lang.code}
                        activeOpacity={0.7}
                        onPress={() => void handleSelect(lang.code)}
                        className={`flex-row items-center justify-between p-4 rounded-xl mb-2 border ${isActive
                                ? 'border-blue-500/30'
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
                        {isActive && <Check size={18} color={colors.accent} />}
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}
