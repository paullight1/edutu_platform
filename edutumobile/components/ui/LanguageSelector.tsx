import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Modal, ScrollView, StyleSheet, Platform } from 'react-native';
import { Check, ChevronDown, Globe, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
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

/**
 * App-language dropdown: one row showing the active language, opening a sheet
 * with the full list. Self-contained so Settings just drops it into a Card.
 */
export function LanguageSelector() {
    const { t } = useTranslation('settings');
    const { isDark, colors } = useTheme();
    const [currentLang, setCurrentLang] = useState<LanguageCode>(getCurrentLanguage());
    const [open, setOpen] = useState(false);

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';

    const active = SUPPORTED_LANGUAGES.find((lang) => lang.code === currentLang);

    const handleSelect = async (code: LanguageCode) => {
        setOpen(false);
        if (code === currentLang) return;

        Haptics.selectionAsync().catch(() => {});
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
        <>
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setOpen(true); }}
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={t('language.label')}
                accessibilityValue={{ text: active?.nativeName ?? currentLang }}
                accessibilityHint={t('language.desc')}
            >
                <View style={styles.rowIcon}>
                    <Globe size={20} color="#818cf8" />
                </View>
                <View style={styles.rowTextWrap}>
                    <Text style={[styles.rowLabel, { color: textPrimary }]}>{t('language.label')}</Text>
                    <Text style={[styles.rowDesc, { color: textSecondary }]}>{t('language.desc')}</Text>
                </View>
                <View style={styles.rowValue}>
                    <Text style={styles.flag}>{getFlagEmoji(currentLang)}</Text>
                    <Text style={[styles.rowValueText, { color: textSecondary }]} numberOfLines={1}>
                        {active?.nativeName ?? currentLang}
                    </Text>
                    <ChevronDown size={16} color={textSecondary} />
                </View>
            </TouchableOpacity>

            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
                    <View
                        style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onStartShouldSetResponder={() => true}
                    >
                        <View style={styles.sheetHeader}>
                            <Text style={[styles.sheetTitle, { color: textPrimary }]}>{t('language.label')}</Text>
                            <TouchableOpacity
                                onPress={() => setOpen(false)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                accessibilityRole="button"
                                accessibilityLabel={t('common:actions.cancel')}
                            >
                                <X size={20} color={textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                            {SUPPORTED_LANGUAGES.map((lang) => {
                                const selected = currentLang === lang.code;
                                return (
                                    <TouchableOpacity
                                        key={lang.code}
                                        activeOpacity={0.7}
                                        onPress={() => void handleSelect(lang.code)}
                                        style={[styles.option, selected && { backgroundColor: `${colors.accent}18` }]}
                                        accessibilityRole="radio"
                                        accessibilityState={{ selected }}
                                        accessibilityLabel={lang.name}
                                    >
                                        <Text style={styles.flag}>{getFlagEmoji(lang.code)}</Text>
                                        <View style={styles.optionTextWrap}>
                                            <Text
                                                style={[styles.optionNative, {
                                                    color: selected ? colors.accent : textPrimary,
                                                    fontWeight: selected ? '800' : '600',
                                                }]}
                                                numberOfLines={1}
                                            >
                                                {lang.nativeName}
                                            </Text>
                                            {lang.nativeName !== lang.name && (
                                                <Text style={[styles.optionName, { color: textSecondary }]} numberOfLines={1}>
                                                    {lang.name}
                                                </Text>
                                            )}
                                        </View>
                                        {selected && <Check size={18} color={colors.accent} />}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>
        </>
    );
}

// Row metrics mirror the Settings screen's own rows so the dropdown sits flush
// with its neighbours.
const styles = StyleSheet.create({
    row: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 14, paddingHorizontal: 16,
    },
    rowIcon: {
        width: 40, height: 40, borderRadius: 11, backgroundColor: 'rgba(99,102,241,0.12)',
        alignItems: 'center', justifyContent: 'center', marginRight: 14,
    },
    rowTextWrap: { flex: 1, paddingRight: 8 },
    rowLabel: { fontSize: 15, fontWeight: '600' },
    rowDesc: { fontSize: 12, marginTop: 2 },
    rowValue: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '38%' },
    rowValueText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
    flag: { fontSize: 20 },

    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet: {
        maxHeight: '70%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1,
        paddingHorizontal: 8, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    },
    sheetHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 12, paddingVertical: 14,
    },
    sheetTitle: { fontSize: 16, fontWeight: '800' },
    list: { paddingHorizontal: 4 },
    option: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 13, paddingHorizontal: 14, borderRadius: 12,
    },
    optionTextWrap: { flex: 1 },
    optionNative: { fontSize: 15 },
    optionName: { fontSize: 12, marginTop: 1 },
});
