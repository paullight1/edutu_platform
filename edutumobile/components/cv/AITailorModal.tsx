import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { X, Sparkles, Target, Search } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/context/ThemeContext';
import { Opportunity } from '@edutu/core/src/types/opportunity';

interface Props {
    visible: boolean;
    onClose: () => void;
    opportunities: Opportunity[];
    isLoading?: boolean;
    onSelectOpportunity: (opportunityId: string) => void;
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
                <View style={[styles.modalContent, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                    <TouchableOpacity
                        style={styles.modalClose}
                        onPress={onClose}
                    >
                        <X size={24} color={muted} />
                    </TouchableOpacity>

                    <View style={styles.modalIcon}>
                        <Sparkles size={48} color={colors.primary} />
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
                                <TouchableOpacity
                                    key={opportunity.id}
                                    style={[styles.opportunityCard, { borderColor: colors.border }]}
                                    onPress={() => {
                                        onClose();
                                        onSelectOpportunity(opportunity.id);
                                    }}
                                >
                                    <View style={styles.opportunityContent}>
                                        <Text style={[styles.opportunityTitle, { color: colors.foreground }]}>
                                            {opportunity.title}
                                        </Text>
                                        <Text style={[styles.opportunityMeta, { color: muted }]}>
                                            {opportunity.organization} • {opportunity.category}
                                        </Text>
                                        {!!opportunity.matchReasons?.[0] && (
                                            <Text style={[styles.opportunityReason, { color: colors.primary }]}>
                                                {opportunity.matchReasons[0]}
                                            </Text>
                                        )}
                                    </View>
                                    <Target size={18} color={colors.primary} />
                                </TouchableOpacity>
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
        backgroundColor: 'rgba(0,0,0,0.5)',
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
        maxHeight: 280,
    },
    opportunityCard: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        width: '100%',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 10,
    },
    opportunityContent: {
        flex: 1,
        marginRight: 10,
    },
    opportunityTitle: {
        fontSize: 14,
        fontWeight: '600',
    },
    opportunityMeta: {
        fontSize: 12,
        marginTop: 4,
    },
    opportunityReason: {
        fontSize: 12,
        marginTop: 6,
        fontWeight: '500',
    },
    emptyText: {
        fontSize: 13,
        textAlign: 'center',
        paddingVertical: 16,
    },
});
