import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, ScrollView, TouchableOpacity, Modal, TextInput } from "react-native";
import React, { useState, useCallback, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import {
    Star,
    StarOff,
    Plus,
    Pencil,
    Trash2,
    ToggleLeft,
    ToggleRight,
    X,
    User,
    Video,
    Globe,
    Loader2,
    MessageSquare,
} from "lucide-react-native";
import { useTheme } from "../../components/context/ThemeContext";
import { supabase } from "../../lib/supabase";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { AdminGuard } from "../../components/auth/AdminGuard";
import { AnimatedPressable } from "../../components/ui/AnimatedPressable";
import { FadeInDown, FadeInUp } from "react-native-reanimated";

interface Testimonial {
    id: string;
    name: string;
    role: string;
    country: string;
    avatar_url: string;
    rating: number;
    review_text: string;
    video_url: string;
    youtube_id: string;
    is_active: boolean;
    sort_order: number;
    created_at: string;
}

function extractYouTubeId(url: string): string {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : '';
}

function AdminTestimonialsContent() {
    const { isDark, colors } = useTheme();
    const router = useRouter();
    const { user } = useUser();

    const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [modalVisible, setModalVisible] = useState(false);
    const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const [formName, setFormName] = useState('');
    const [formRole, setFormRole] = useState('');
    const [formCountry, setFormCountry] = useState('');
    const [formRating, setFormRating] = useState(5);
    const [formReviewText, setFormReviewText] = useState('');
    const [formVideoUrl, setFormVideoUrl] = useState('');

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const cardBg = colors.card;
    const borderColor = colors.border;

    const fetchTestimonials = useCallback(async () => {
        setLoading(true);
        try {
            const query = supabase
                .from('testimonials')
                .select('*')
                .order('sort_order', { ascending: true });

            const { data, error } = await query;
            if (error) throw error;
            setTestimonials(data || []);
        } catch (e: any) {
            console.error('Failed to fetch testimonials:', e);
            Alert.alert('Error', 'Failed to load testimonials.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchTestimonials(); }, [fetchTestimonials]);

    const openAddModal = () => {
        setEditingTestimonial(null);
        setFormName('');
        setFormRole('');
        setFormCountry('');
        setFormRating(5);
        setFormReviewText('');
        setFormVideoUrl('');
        setModalVisible(true);
    };

    const openEditModal = (item: Testimonial) => {
        setEditingTestimonial(item);
        setFormName(item.name);
        setFormRole(item.role);
        setFormCountry(item.country || '');
        setFormRating(item.rating);
        setFormReviewText(item.review_text);
        setFormVideoUrl(item.video_url || '');
        setModalVisible(true);
    };

    const closeModal = () => {
        setModalVisible(false);
        setEditingTestimonial(null);
    };

    const handleSubmit = async () => {
        if (!formName.trim() || !formRole.trim() || !formReviewText.trim()) {
            Alert.alert('Validation Error', 'Name, Role, and Review text are required.');
            return;
        }

        setSubmitting(true);
        try {
            const youtubeId = formVideoUrl ? extractYouTubeId(formVideoUrl) : '';

            if (editingTestimonial) {
                const { error } = await supabase
                    .from('testimonials')
                    .update({
                        name: formName.trim(),
                        role: formRole.trim(),
                        country: formCountry.trim(),
                        rating: formRating,
                        review_text: formReviewText.trim(),
                        video_url: formVideoUrl.trim(),
                        youtube_id: youtubeId,
                    })
                    .eq('id', editingTestimonial.id);

                if (error) throw error;
                Alert.alert('Success', 'Testimonial updated successfully.');
            } else {
                const { error } = await supabase
                    .from('testimonials')
                    .insert({
                        name: formName.trim(),
                        role: formRole.trim(),
                        country: formCountry.trim(),
                        rating: formRating,
                        review_text: formReviewText.trim(),
                        video_url: formVideoUrl.trim(),
                        youtube_id: youtubeId,
                        is_active: true,
                        sort_order: testimonials.length,
                    });

                if (error) throw error;
                Alert.alert('Success', 'Testimonial added successfully.');
            }

            closeModal();
            fetchTestimonials();
        } catch (e: any) {
            console.error('Submit error:', e);
            Alert.alert('Error', e.message || 'Failed to save testimonial.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = (item: Testimonial) => {
        Alert.alert(
            'Delete Testimonial',
            `Are you sure you want to delete "${item.name}"? This action cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from('testimonials')
                                .delete()
                                .eq('id', item.id);

                            if (error) throw error;
                            Alert.alert('Success', 'Testimonial deleted.');
                            fetchTestimonials();
                        } catch (e: any) {
                            console.error('Delete error:', e);
                            Alert.alert('Error', 'Failed to delete testimonial.');
                        }
                    },
                },
            ]
        );
    };

    const handleToggleActive = async (item: Testimonial) => {
        try {
            const { error } = await supabase
                .from('testimonials')
                .update({ is_active: !item.is_active })
                .eq('id', item.id);

            if (error) throw error;
            fetchTestimonials();
        } catch (e: any) {
            console.error('Toggle error:', e);
            Alert.alert('Error', 'Failed to update status.');
        }
    };

    const filteredTestimonials = testimonials.filter(t => {
        if (filter === 'active') return t.is_active;
        if (filter === 'inactive') return !t.is_active;
        return true;
    });

    const stats = {
        total: testimonials.length,
        active: testimonials.filter(t => t.is_active).length,
        inactive: testimonials.filter(t => !t.is_active).length,
    };

    const renderStars = (rating: number) => {
        const stars = [];
        for (let i = 1; i <= 5; i++) {
            stars.push(
                <Star
                    key={i}
                    size={14}
                    color={i <= rating ? '#F59E0B' : textSecondary}
                    fill={i <= rating ? '#F59E0B' : 'transparent'}
                />
            );
        }
        return stars;
    };

    const renderTestimonial = useCallback(({ item, index }: { item: Testimonial; index: number }) => {
        return (
            <AnimatedPressable
                style={[styles.card, { backgroundColor: cardBg, borderColor }]}
                entering={FadeInDown.delay(index * 60).duration(350).springify()}
            >
                <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                        <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
                            <User size={18} color={colors.primary} />
                        </View>
                        <View style={styles.nameRoleContainer}>
                            <Text style={[styles.cardName, { color: textPrimary }]} numberOfLines={1}>
                                {item.name}
                            </Text>
                            <Text style={[styles.cardRole, { color: textSecondary }]} numberOfLines={1}>
                                {item.role}{item.country ? ` · ${item.country}` : ''}
                            </Text>
                        </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: item.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }]}>
                        <Text style={[styles.statusText, { color: item.is_active ? '#10B981' : '#EF4444' }]}>
                            {item.is_active ? 'Active' : 'Inactive'}
                        </Text>
                    </View>
                </View>

                <View style={styles.ratingRow}>
                    {renderStars(item.rating)}
                    <Text style={[styles.ratingText, { color: textSecondary }]}>
                        {item.rating}/5
                    </Text>
                </View>

                <Text style={[styles.reviewText, { color: textSecondary }]} numberOfLines={2}>
                    {item.review_text}
                </Text>

                {item.youtube_id && (
                    <View style={styles.videoRow}>
                        <Video size={12} color={colors.primary} />
                        <Text style={[styles.videoText, { color: colors.primary }]} numberOfLines={1}>
                            YouTube video linked
                        </Text>
                    </View>
                )}

                <View style={styles.cardActions}>
                    <TouchableOpacity
                        style={[styles.actionIconBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                        onPress={() => handleToggleActive(item)}
                    >
                        {item.is_active ? (
                            <ToggleRight size={18} color="#10B981" />
                        ) : (
                            <ToggleLeft size={18} color="#EF4444" />
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionIconBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                        onPress={() => openEditModal(item)}
                    >
                        <Pencil size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionIconBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                        onPress={() => handleDelete(item)}
                    >
                        <Trash2 size={16} color="#EF4444" />
                    </TouchableOpacity>
                </View>
            </AnimatedPressable>
        );
    }, [cardBg, borderColor, textPrimary, textSecondary, colors.primary, isDark]);

    const filters: { key: typeof filter; label: string }[] = [
        { key: 'all', label: 'All' },
        { key: 'active', label: 'Active' },
        { key: 'inactive', label: 'Inactive' },
    ];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader title="Testimonials" subtitle="Manage client testimonials" showBack />

            <View style={styles.header}>
                <View style={styles.statsRow}>
                    <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.statValue, { color: textPrimary }]}>{stats.total}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>Total</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.active}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>Active</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.statValue, { color: '#EF4444' }]}>{stats.inactive}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>Inactive</Text>
                    </View>
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

            <View style={styles.addButtonContainer}>
                <TouchableOpacity
                    style={[styles.addButton, { backgroundColor: colors.primary }]}
                    onPress={openAddModal}
                >
                    <Plus size={18} color="#FFFFFF" />
                    <Text style={styles.addButtonText}>Add Testimonial</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <Loader2 size={32} color={colors.primary} />
                    <Text style={[styles.loadingText, { color: textSecondary }]}>Loading testimonials...</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredTestimonials}
                    keyExtractor={item => item.id}
                    renderItem={renderTestimonial}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <MessageSquare size={48} color={textSecondary} />
                            <Text style={[styles.emptyTitle, { color: textPrimary }]}>No Testimonials</Text>
                            <Text style={[styles.emptyText, { color: textSecondary }]}>
                                {filter !== 'all' ? 'No testimonials match the current filter.' : 'Tap the button above to add your first testimonial.'}
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
                                {editingTestimonial ? 'Edit Testimonial' : 'Add Testimonial'}
                            </Text>
                            <TouchableOpacity onPress={closeModal} style={styles.modalClose}>
                                <X size={20} color={textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                            <View style={styles.modalBody}>
                                <View style={styles.formGroup}>
                                    <Text style={[styles.formLabel, { color: textSecondary }]}>Name *</Text>
                                    <TextInput
                                        style={[styles.formInput, { backgroundColor: colors.card, color: textPrimary, borderColor }]}
                                        value={formName}
                                        onChangeText={setFormName}
                                        placeholder="e.g. John Doe"
                                        placeholderTextColor={textSecondary}
                                    />
                                </View>

                                <View style={styles.formGroup}>
                                    <Text style={[styles.formLabel, { color: textSecondary }]}>Role *</Text>
                                    <TextInput
                                        style={[styles.formInput, { backgroundColor: colors.card, color: textPrimary, borderColor }]}
                                        value={formRole}
                                        onChangeText={setFormRole}
                                        placeholder="e.g. Software Engineer"
                                        placeholderTextColor={textSecondary}
                                    />
                                </View>

                                <View style={styles.formGroup}>
                                    <Text style={[styles.formLabel, { color: textSecondary }]}>
                                        Country <Text style={{ opacity: 0.6 }}>(optional)</Text>
                                    </Text>
                                    <View style={[styles.formInputWithIcon, { backgroundColor: colors.card, borderColor }]}>
                                        <Globe size={16} color={textSecondary} />
                                        <TextInput
                                            style={[styles.formInputIconed, { color: textPrimary }]}
                                            value={formCountry}
                                            onChangeText={setFormCountry}
                                            placeholder="e.g. 🇳🇬 Nigeria"
                                            placeholderTextColor={textSecondary}
                                        />
                                    </View>
                                </View>

                                <View style={styles.formGroup}>
                                    <Text style={[styles.formLabel, { color: textSecondary }]}>Rating</Text>
                                    <View style={styles.ratingPicker}>
                                        {[1, 2, 3, 4, 5].map(num => (
                                            <TouchableOpacity
                                                key={num}
                                                style={[
                                                    styles.ratingOption,
                                                    { borderColor: formRating >= num ? '#F59E0B' : borderColor },
                                                    formRating >= num && { backgroundColor: 'rgba(245,158,11,0.1)' }
                                                ]}
                                                onPress={() => setFormRating(num)}
                                            >
                                                <Star
                                                    size={24}
                                                    color={formRating >= num ? '#F59E0B' : textSecondary}
                                                    fill={formRating >= num ? '#F59E0B' : 'transparent'}
                                                />
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                <View style={styles.formGroup}>
                                    <Text style={[styles.formLabel, { color: textSecondary }]}>Review Text *</Text>
                                    <TextInput
                                        style={[styles.formInputMultiline, { backgroundColor: colors.card, color: textPrimary, borderColor }]}
                                        value={formReviewText}
                                        onChangeText={setFormReviewText}
                                        placeholder="Write the testimonial review..."
                                        placeholderTextColor={textSecondary}
                                        multiline
                                        numberOfLines={4}
                                        textAlignVertical="top"
                                    />
                                </View>

                                <View style={styles.formGroup}>
                                    <Text style={[styles.formLabel, { color: textSecondary }]}>
                                        YouTube URL <Text style={{ opacity: 0.6 }}>(optional)</Text>
                                    </Text>
                                    <View style={[styles.formInputWithIcon, { backgroundColor: colors.card, borderColor }]}>
                                        <Video size={16} color={textSecondary} />
                                        <TextInput
                                            style={[styles.formInputIconed, { color: textPrimary }]}
                                            value={formVideoUrl}
                                            onChangeText={setFormVideoUrl}
                                            placeholder="https://www.youtube.com/watch?v=..."
                                            placeholderTextColor={textSecondary}
                                            autoCapitalize="none"
                                            keyboardType="url"
                                        />
                                    </View>
                                    {formVideoUrl && (
                                        <Text style={[styles.formHint, { color: textSecondary }]}>
                                            {extractYouTubeId(formVideoUrl)
                                                ? `Video ID: ${extractYouTubeId(formVideoUrl)}`
                                                : 'Could not extract video ID from URL'}
                                        </Text>
                                    )}
                                </View>

                                <TouchableOpacity
                                    style={[styles.submitButton, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
                                    onPress={handleSubmit}
                                    disabled={submitting}
                                    testID="testimonial-modal-submit"
                                >
                                    {submitting ? (
                                        <ActivityIndicator color="#FFFFFF" size="small" />
                                    ) : (
                                        <Text style={styles.submitButtonText}>
                                            {editingTestimonial ? 'Update Testimonial' : 'Add Testimonial'}
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

export default function AdminTestimonials() {
    return (
        <AdminGuard>
            <AdminTestimonialsContent />
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
    filterScroll: { marginBottom: 4 },
    filterChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
    filterChipText: { fontSize: 13, fontWeight: '600' },
    addButtonContainer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
    addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14 },
    addButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
    listContent: { paddingHorizontal: 20, paddingBottom: 100 },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 12, fontSize: 14 },
    emptyContainer: { alignItems: 'center', paddingTop: 60 },
    emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 8 },
    emptyText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },

    card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    nameRoleContainer: { flex: 1 },
    cardName: { fontSize: 15, fontWeight: '700' },
    cardRole: { fontSize: 12, fontWeight: '500' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText: { fontSize: 11, fontWeight: '700' },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
    ratingText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
    reviewText: { fontSize: 13, lineHeight: 20, marginBottom: 8 },
    videoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    videoText: { fontSize: 12, fontWeight: '600' },
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
    formInputWithIcon: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, gap: 10 },
    formInputIconed: { flex: 1, paddingVertical: 14, fontSize: 14 },
    formHint: { fontSize: 11, marginTop: 6 },
    ratingPicker: { flexDirection: 'row', gap: 8 },
    ratingOption: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
    submitButton: { padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 8 },
    submitButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
