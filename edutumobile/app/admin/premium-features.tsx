import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, ScrollView, TouchableOpacity, Modal, TextInput, Switch } from "react-native";
import React, { useState, useCallback, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    ToggleLeft,
    ToggleRight,
    Shield,
    Crown,
    Pencil,
    X,
    Loader2,
    Search,
    Flag,
} from "lucide-react-native";
import { useTheme } from "../../components/context/ThemeContext";
import { supabase } from "../../lib/supabase";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { AnimatedPressable } from "../../components/ui/AnimatedPressable";
import { AdminGuard } from "../../components/auth/AdminGuard";
import { FadeInDown } from "react-native-reanimated";

interface FeatureFlag {
    id: string;
    key: string;
    label: string;
    description: string;
    is_enabled: boolean;
    pro_required: boolean;
    sort_order: number;
}

function AdminPremiumFeaturesContent() {
    const { isDark, colors } = useTheme();

    const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled' | 'pro'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [editingFeature, setEditingFeature] = useState<FeatureFlag | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const [formLabel, setFormLabel] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formSortOrder, setFormSortOrder] = useState('');

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const cardBg = colors.card;
    const borderColor = colors.border;

    const fetchFeatureFlags = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('feature_flags')
                .select('*')
                .order('sort_order', { ascending: true });

            if (error) throw error;
            setFeatureFlags(data || []);
        } catch (e: any) {
            console.error('Failed to fetch feature flags:', e);
            Alert.alert('Error', 'Failed to load feature flags.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchFeatureFlags(); }, [fetchFeatureFlags]);

    const openEditModal = (item: FeatureFlag) => {
        setEditingFeature(item);
        setFormLabel(item.label);
        setFormDescription(item.description);
        setFormSortOrder(item.sort_order.toString());
        setModalVisible(true);
    };

    const closeModal = () => {
        setModalVisible(false);
        setEditingFeature(null);
    };

    const handleSubmit = async () => {
        if (!formLabel.trim() || !formDescription.trim()) {
            Alert.alert('Validation Error', 'Label and description are required.');
            return;
        }

        setSubmitting(true);
        try {
            const { error } = await supabase
                .from('feature_flags')
                .update({
                    label: formLabel.trim(),
                    description: formDescription.trim(),
                    sort_order: parseInt(formSortOrder) || 0,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', editingFeature!.id);

            if (error) throw error;
            Alert.alert('Success', 'Feature flag updated successfully.');
            closeModal();
            fetchFeatureFlags();
        } catch (e: any) {
            console.error('Submit error:', e);
            Alert.alert('Error', e.message || 'Failed to save feature flag.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleEnabled = async (item: FeatureFlag) => {
        try {
            const { error } = await supabase
                .from('feature_flags')
                .update({
                    is_enabled: !item.is_enabled,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', item.id);

            if (error) throw error;
            fetchFeatureFlags();
        } catch (e: any) {
            console.error('Toggle error:', e);
            Alert.alert('Error', 'Failed to update status.');
        }
    };

    const handleTogglePro = async (item: FeatureFlag) => {
        try {
            const { error } = await supabase
                .from('feature_flags')
                .update({
                    pro_required: !item.pro_required,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', item.id);

            if (error) throw error;
            fetchFeatureFlags();
        } catch (e: any) {
            console.error('Toggle pro error:', e);
            Alert.alert('Error', 'Failed to update pro requirement.');
        }
    };

    const filteredFeatureFlags = featureFlags.filter(f => {
        if (filter === 'enabled') return f.is_enabled;
        if (filter === 'disabled') return !f.is_enabled;
        if (filter === 'pro') return f.pro_required;
        return true;
    }).filter(f => {
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            return f.label.toLowerCase().includes(query) ||
                f.description.toLowerCase().includes(query) ||
                f.key.toLowerCase().includes(query);
        }
        return true;
    });

    const stats = {
        total: featureFlags.length,
        enabled: featureFlags.filter(f => f.is_enabled).length,
        proOnly: featureFlags.filter(f => f.pro_required).length,
    };

    const renderFeatureFlag = useCallback(({ item, index }: { item: FeatureFlag; index: number }) => {
        return (
            <AnimatedPressable
                style={[styles.card, { backgroundColor: cardBg, borderColor }]}
                entering={FadeInDown.delay(index * 60).duration(350).springify()}
            >
                <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                        <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
                            <Shield size={18} color={colors.primary} />
                        </View>
                        <View style={styles.nameKeyContainer}>
                            <Text style={[styles.cardLabel, { color: textPrimary }]} numberOfLines={1}>
                                {item.label}
                            </Text>
                            <Text style={[styles.cardKey, { color: textSecondary }]} numberOfLines={1}>
                                {item.key}
                            </Text>
                        </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: item.is_enabled ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }]}>
                        <Text style={[styles.statusText, { color: item.is_enabled ? '#10B981' : '#EF4444' }]}>
                            {item.is_enabled ? 'Enabled' : 'Disabled'}
                        </Text>
                    </View>
                </View>

                <Text style={[styles.description, { color: textSecondary }]} numberOfLines={2}>
                    {item.description}
                </Text>

                <View style={styles.togglesRow}>
                    <View style={styles.toggleItem}>
                        <Text style={[styles.toggleLabel, { color: textSecondary }]}>Enabled</Text>
                        <Switch
                            value={item.is_enabled}
                            onValueChange={() => handleToggleEnabled(item)}
                            trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                            thumbColor="#FFFFFF"
                        />
                    </View>
                    <View style={styles.toggleItem}>
                        <View style={styles.toggleLabelRow}>
                            <Crown size={14} color={item.pro_required ? '#F59E0B' : textSecondary} />
                            <Text style={[styles.toggleLabel, { color: item.pro_required ? '#F59E0B' : textSecondary }]}>Pro Only</Text>
                        </View>
                        <Switch
                            value={item.pro_required}
                            onValueChange={() => handleTogglePro(item)}
                            trackColor={{ false: '#CBD5E1', true: '#F59E0B' }}
                            thumbColor="#FFFFFF"
                        />
                    </View>
                </View>

                <View style={styles.cardActions}>
                    <TouchableOpacity
                        style={[styles.actionIconBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                        onPress={() => openEditModal(item)}
                    >
                        <Pencil size={16} color={colors.primary} />
                    </TouchableOpacity>
                </View>
            </AnimatedPressable>
        );
    }, [cardBg, borderColor, textPrimary, textSecondary, colors.primary, isDark]);

    const filters: { key: typeof filter; label: string }[] = [
        { key: 'all', label: 'All' },
        { key: 'enabled', label: 'Enabled' },
        { key: 'disabled', label: 'Disabled' },
        { key: 'pro', label: 'Pro Only' },
    ];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader title="Premium Features" subtitle="Manage OTA feature flags" showBack />

            <View style={styles.header}>
                <View style={styles.statsRow}>
                    <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.statValue, { color: textPrimary }]}>{stats.total}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>Total</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.enabled}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>Enabled</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.proOnly}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>Pro Only</Text>
                    </View>
                </View>

                <View style={[styles.searchBar, { backgroundColor: cardBg, borderColor }]}>
                    <Search size={18} color={textSecondary} />
                    <TextInput
                        style={[styles.searchInput, { color: textPrimary }]}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search features..."
                        placeholderTextColor={textSecondary}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <X size={16} color={textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ gap: 8 }}>
                    {filters.map(f => (
                        <TouchableOpacity
                            key={f.key}
                            style={[
                                styles.filterChip,
                                { borderColor },
                                filter === f.key && { backgroundColor: colors.primary, borderColor: colors.primary }
                            ]}
                            onPress={() => setFilter(f.key)}
                        >
                            <Text style={[
                                styles.filterChipText,
                                { color: textSecondary },
                                filter === f.key && { color: '#FFFFFF' }
                            ]}>
                                {f.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <Loader2 size={32} color={colors.primary} />
                    <Text style={[styles.loadingText, { color: textSecondary }]}>Loading feature flags...</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredFeatureFlags}
                    keyExtractor={item => item.id}
                    renderItem={renderFeatureFlag}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Flag size={48} color={textSecondary} />
                            <Text style={[styles.emptyTitle, { color: textPrimary }]}>No Feature Flags</Text>
                            <Text style={[styles.emptyText, { color: textSecondary }]}>
                                {searchQuery || filter !== 'all' ? 'No features match the current filter.' : 'No feature flags found in the database.'}
                            </Text>
                        </View>
                    }
                />
            )}

            <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalSheet, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: textPrimary }]}>
                                Edit Feature Flag
                            </Text>
                            <TouchableOpacity onPress={closeModal} style={styles.modalClose}>
                                <X size={20} color={textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                            <View style={styles.modalBody}>
                                <View style={styles.formGroup}>
                                    <Text style={[styles.formLabel, { color: textSecondary }]}>Label *</Text>
                                    <TextInput
                                        style={[styles.formInput, { backgroundColor: colors.card, color: textPrimary, borderColor }]}
                                        value={formLabel}
                                        onChangeText={setFormLabel}
                                        placeholder="e.g. AI Tutor"
                                        placeholderTextColor={textSecondary}
                                    />
                                </View>

                                <View style={styles.formGroup}>
                                    <Text style={[styles.formLabel, { color: textSecondary }]}>Description *</Text>
                                    <TextInput
                                        style={[styles.formInputMultiline, { backgroundColor: colors.card, color: textPrimary, borderColor }]}
                                        value={formDescription}
                                        onChangeText={setFormDescription}
                                        placeholder="Describe what this feature does..."
                                        placeholderTextColor={textSecondary}
                                        multiline
                                        numberOfLines={4}
                                        textAlignVertical="top"
                                    />
                                </View>

                                <View style={styles.formGroup}>
                                    <Text style={[styles.formLabel, { color: textSecondary }]}>Sort Order</Text>
                                    <TextInput
                                        style={[styles.formInput, { backgroundColor: colors.card, color: textPrimary, borderColor }]}
                                        value={formSortOrder}
                                        onChangeText={setFormSortOrder}
                                        placeholder="0"
                                        placeholderTextColor={textSecondary}
                                        keyboardType="number-pad"
                                    />
                                </View>

                                <TouchableOpacity
                                    style={[styles.submitButton, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
                                    onPress={handleSubmit}
                                    disabled={submitting}
                                >
                                    {submitting ? (
                                        <ActivityIndicator color="#FFFFFF" size="small" />
                                    ) : (
                                        <Text style={styles.submitButtonText}>
                                            Update Feature Flag
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

export default function AdminPremiumFeatures() {
    return (
        <AdminGuard>
            <AdminPremiumFeaturesContent />
        </AdminGuard>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    statCard: { flex: 1, padding: 12, borderRadius: 14, alignItems: 'center', borderWidth: 1 },
    statValue: { fontSize: 22, fontWeight: '800' },
    statLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },
    searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, marginBottom: 12, gap: 10 },
    searchInput: { flex: 1, fontSize: 14 },
    filterScroll: { marginBottom: 4 },
    filterChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
    filterChipText: { fontSize: 13, fontWeight: '600' },
    listContent: { paddingHorizontal: 20, paddingBottom: 100 },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 12, fontSize: 14 },
    emptyContainer: { alignItems: 'center', paddingTop: 60 },
    emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 8 },
    emptyText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },

    card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    iconContainer: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    nameKeyContainer: { flex: 1 },
    cardLabel: { fontSize: 15, fontWeight: '700' },
    cardKey: { fontSize: 12, fontWeight: '500', fontFamily: 'monospace' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText: { fontSize: 11, fontWeight: '700' },
    description: { fontSize: 13, lineHeight: 20, marginBottom: 12 },
    togglesRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    toggleItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    toggleLabel: { fontSize: 13, fontWeight: '600' },
    toggleLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    cardActions: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,0.15)' },
    actionIconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
    modalTitle: { fontSize: 18, fontWeight: '700' },
    modalClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
    modalBody: { padding: 24 },

    formGroup: { marginBottom: 18 },
    formLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    formInput: { borderRadius: 14, padding: 14, fontSize: 14, borderWidth: 1 },
    formInputMultiline: { borderRadius: 14, padding: 14, fontSize: 14, borderWidth: 1, minHeight: 100 },
    submitButton: { padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 8 },
    submitButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
