import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Crown, Lock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { CVTemplate } from '@edutu/core/src/types/cv';
import { useTheme } from '../../components/context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Self-contained gradient visuals — no external image dependency, so cards
// always render (even offline / on a weak connection) instead of collapsing to
// empty boxes when a remote thumbnail fails to load.
const CATEGORY_GRADIENTS: Record<string, [string, string]> = {
    academic: ['#2563EB', '#1D4ED8'],
    professional: ['#0F766E', '#0D9488'],
    creative: ['#7C3AED', '#DB2777'],
    general: ['#6366F1', '#8B5CF6'],
};

const CATEGORY_ACCENTS: Record<string, string> = {
    academic: '#2563EB',
    professional: '#0F766E',
    creative: '#7C3AED',
    general: '#6366F1',
};

function getTemplateVisual(item: CVTemplate) {
    const key = (item.category || 'general').toLowerCase();
    const gradient = CATEGORY_GRADIENTS[key] || CATEGORY_GRADIENTS.general;
    const accent = CATEGORY_ACCENTS[key] || CATEGORY_ACCENTS.general;
    return { gradient, accent };
}

interface Props {
    item: CVTemplate;
    onSelect: (template: CVTemplate) => void;
    isPro: boolean;
}

export function CVTemplateCard({ item, onSelect, isPro }: Props) {
    const { t } = useTranslation('cv');
    const { colors, isDark } = useTheme();
    const muted = isDark ? '#94A3B8' : '#64748B';
    const visual = getTemplateVisual(item);

    return (
        <TouchableOpacity
            style={[
                styles.templateCard,
                { backgroundColor: colors.card, borderColor: colors.border }
            ]}
            onPress={() => onSelect(item)}
            activeOpacity={0.86}
        >
            <LinearGradient
                colors={visual.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.templatePreview}
            >
                <View style={styles.previewTopRow}>
                    <View style={styles.categoryPill}>
                        <Text style={styles.categoryPillText}>{item.category}</Text>
                    </View>
                </View>
                <View style={styles.samplePaper}>
                    <View style={[styles.sampleHeader, { backgroundColor: visual.accent }]} />
                    <View style={styles.sampleLineWide} />
                    <View style={styles.sampleLine} />
                    <View style={styles.sampleBlockRow}>
                        <View style={styles.sampleDot} />
                        <View style={styles.sampleLineShort} />
                    </View>
                    <View style={styles.sampleBlockRow}>
                        <View style={styles.sampleDot} />
                        <View style={styles.sampleLineShortAlt} />
                    </View>
                </View>
            </LinearGradient>
            <View style={styles.templateInfo}>
                <View style={styles.templateNameRow}>
                    <Text style={[styles.templateName, { color: colors.foreground }]} numberOfLines={1}>
                        {item.name}
                    </Text>
                    {item.is_premium && (
                        <View style={[styles.premiumBadge, { backgroundColor: '#F59E0B' }]}>
                            <Crown size={12} color="#FFFFFF" />
                        </View>
                    )}
                </View>
                <Text style={[styles.templateCategory, { color: muted }]}>
                    {t('templates.tapToPreview')}
                </Text>
            </View>
            {item.is_premium && !isPro && (
                <View style={styles.lockedOverlay}>
                    <Lock size={24} color="#FFFFFF" />
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    templateCard: {
        width: (SCREEN_WIDTH - 48) / 2,
        borderRadius: 16,
        marginBottom: 16,
        overflow: 'hidden',
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    templatePreview: {
        height: 138,
        padding: 10,
        justifyContent: 'space-between',
    },
    previewTopRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    categoryPill: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.22)',
    },
    categoryPillText: {
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    samplePaper: {
        width: 86,
        height: 94,
        alignSelf: 'flex-end',
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.94)',
        padding: 10,
        gap: 6,
    },
    sampleHeader: {
        width: 34,
        height: 8,
        borderRadius: 4,
    },
    sampleLineWide: {
        height: 5,
        width: '100%',
        borderRadius: 4,
        backgroundColor: '#CBD5E1',
    },
    sampleLine: {
        height: 5,
        width: '76%',
        borderRadius: 4,
        backgroundColor: '#E2E8F0',
    },
    sampleBlockRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    sampleDot: {
        width: 5,
        height: 5,
        borderRadius: 3,
        backgroundColor: '#94A3B8',
    },
    sampleLineShort: {
        height: 5,
        flex: 1,
        borderRadius: 4,
        backgroundColor: '#E2E8F0',
    },
    sampleLineShortAlt: {
        height: 5,
        width: '54%',
        borderRadius: 4,
        backgroundColor: '#E2E8F0',
    },
    templateInfo: {
        padding: 12,
        alignItems: 'center',
    },
    templateNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    templateName: {
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
        textAlign: 'center',
    },
    premiumBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginLeft: 8,
    },
    templateCategory: {
        fontSize: 12,
        marginTop: 4,
        textAlign: 'center',
    },
    lockedOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
});
