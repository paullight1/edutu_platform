import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, TextInput, Image } from 'react-native';
import { X, Wand2, Search, Building2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/context/ThemeContext';
import { Opportunity } from '@edutu/core/src/types/opportunity';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { CvModalBackdrop } from './CvModalBackdrop';

interface Props {
    visible: boolean;
    onClose: () => void;
    opportunities: Opportunity[];
    isLoading?: boolean;
    onSelectOpportunity: (opportunityId: string) => void;
}

// Scraped opportunity titles sometimes carry raw HTML entities ("LSA 1.0
// &#8211; 2026"). Decode the common named + numeric ones for display.
const NAMED_ENTITIES: Record<string, string> = {
    amp: '&',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    lt: '<',
    gt: '>',
    ndash: '–',
    mdash: '—',
};

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&([a-zA-Z]+);/g, (match, name: string) => NAMED_ENTITIES[name] ?? match);
}

/**
 * Visual-first ("poster") row for the tailoring picker: cover image with a
 * bottom scrim, overlaid title + one meta line. Falls back to a tinted
 * gradient with a Building2 mark when the opportunity has no usable image.
 */
function TailorOpportunityRow({
    opportunity,
    onPress,
}: {
    opportunity: Opportunity;
    onPress: () => void;
}) {
    const [imageFailed, setImageFailed] = useState(false);
    const hasImage = Boolean(opportunity.image) && !imageFailed;
    const title = decodeHtmlEntities(opportunity.title || '');
    const meta = decodeHtmlEntities(
        [opportunity.organization, opportunity.category].filter(Boolean).join(' · '),
    );

    return (
        <AnimatedPressable style={styles.posterRow} scaleTo={0.97} onPress={onPress}>
            <View style={styles.posterInner}>
                {hasImage ? (
                    <Image
                        source={{ uri: opportunity.image as string }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                        onError={() => setImageFailed(true)}
                    />
                ) : (
                    <LinearGradient
                        colors={['#312E81', '#1E1B4B']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[StyleSheet.absoluteFill, styles.posterFallback]}
                    >
                        <Building2 size={30} color="rgba(255,255,255,0.4)" />
                    </LinearGradient>
                )}
                {/* Bottom scrim so the overlaid text stays readable */}
                <LinearGradient
                    colors={['rgba(2,6,23,0.35)', 'rgba(2,6,23,0.45)', 'rgba(2,6,23,0.85)', 'rgba(2,6,23,0.96)']}
                    style={StyleSheet.absoluteFill}
                />
                {/* NOTE: absoluteFill must be passed inline — a created style
                    with spread absoluteFillObject fails to overlay here. */}
                <View style={[StyleSheet.absoluteFill, styles.posterBottom]}>
                    <Text style={styles.posterTitle} numberOfLines={2}>
                        {title}
                    </Text>
                    {!!meta && (
                        <Text style={styles.posterMeta} numberOfLines={1}>
                            {meta}
                        </Text>
                    )}
                </View>
            </View>
        </AnimatedPressable>
    );
}

export function AITailorModal({ visible, onClose, opportunities, isLoading, onSelectOpportunity }: Props) {
    const { t } = useTranslation('cv');
    const { colors, isDark } = useTheme();
    const muted = isDark ? '#94A3B8' : '#64748B';
    const [query, setQuery] = useState('');

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return opportunities;
        return opportunities.filter((o) =>
            [o.title, o.organization, o.category, ...(o.tags || [])]
                .filter(Boolean)
                .some((field) => String(field).toLowerCase().includes(q)),
        );
    }, [opportunities, query]);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <CvModalBackdrop onPress={onClose} />
                <View style={[styles.modalContent, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                    <TouchableOpacity
                        style={styles.modalClose}
                        onPress={onClose}
                    >
                        <X size={24} color={muted} />
                    </TouchableOpacity>

                    <View style={styles.modalIcon}>
                        <Wand2 size={48} color={colors.primary} />
                    </View>

                    <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                        {t('tailorModal.title')}
                    </Text>

                    <Text style={[styles.modalSubtitle, { color: muted }]}>
                        {t('tailorModal.subtitle')}
                    </Text>

                    {isLoading ? (
                        <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                        <>
                            <View
                                style={[
                                    styles.searchBar,
                                    {
                                        backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
                                        borderColor: colors.border,
                                    },
                                ]}
                            >
                                <Search size={18} color={muted} />
                                <TextInput
                                    style={[styles.searchInput, { color: colors.foreground }]}
                                    placeholder={t('tailorModal.searchPlaceholder')}
                                    placeholderTextColor={muted}
                                    value={query}
                                    onChangeText={setQuery}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    returnKeyType="search"
                                />
                                {query.length > 0 && (
                                    <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                                        <X size={16} color={muted} />
                                    </TouchableOpacity>
                                )}
                            </View>

                            <ScrollView style={styles.opportunityList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            {filtered.map((opportunity) => (
                                <TailorOpportunityRow
                                    key={opportunity.id}
                                    opportunity={opportunity}
                                    onPress={() => {
                                        onClose();
                                        onSelectOpportunity(opportunity.id);
                                    }}
                                />
                            ))}
                            {filtered.length === 0 && (
                                <Text style={[styles.emptyText, { color: muted }]}>
                                    {query.trim() ? t('tailorModal.noResults') : t('tailorModal.empty')}
                                </Text>
                            )}
                            </ScrollView>
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '88%',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 44,
        marginBottom: 12,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        paddingVertical: 0,
    },
    modalClose: {
        position: 'absolute',
        top: 16,
        right: 16,
    },
    modalIcon: {
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 8,
    },
    modalSubtitle: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 20,
    },
    opportunityList: {
        width: '100%',
        maxHeight: 340,
    },
    posterRow: {
        width: '100%',
        height: 114,
        marginBottom: 10,
    },
    posterInner: {
        flex: 1,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#1E1B4B',
    },
    posterFallback: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    posterBottom: {
        justifyContent: 'flex-end',
        padding: 12,
    },
    posterTitle: {
        color: '#FFFFFF',
        fontSize: 15,
        lineHeight: 19,
        fontWeight: '800',
        textShadowColor: 'rgba(2,6,23,0.85)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 6,
    },
    posterMeta: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 3,
        textShadowColor: 'rgba(2,6,23,0.85)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    emptyText: {
        fontSize: 13,
        textAlign: 'center',
        paddingVertical: 16,
    },
});
