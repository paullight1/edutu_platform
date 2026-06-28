import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { X, Sparkles, Target } from 'lucide-react-native';
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
    const { colors, isDark } = useTheme();
    const muted = isDark ? '#94A3B8' : '#64748B';

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
                        AI CV Tailoring
                    </Text>

                    <Text style={[styles.modalSubtitle, { color: muted }]}>
                        Select an opportunity from your bank and tailor this CV toward it.
                    </Text>

                    {isLoading ? (
                        <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                        <ScrollView style={styles.opportunityList} showsVerticalScrollIndicator={false}>
                            {opportunities.map((opportunity) => (
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
                            {opportunities.length === 0 && (
                                <Text style={[styles.emptyText, { color: muted }]}>
                                    No opportunities available yet. Load opportunities first, then tailor this CV.
                                </Text>
                            )}
                        </ScrollView>
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
        width: '85%',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
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
