import { View, Text, FlatList, Image, StyleSheet, ActivityIndicator, Alert, ScrollView, TouchableOpacity, Modal, TextInput } from "react-native";
import React, { useState, useCallback, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import {
    Check,
    X,
    ExternalLink,
    User,
    Award,
    MessageSquare,
    Eye,
    ChevronRight,
    ShieldCheck,
    Clock,
    Loader2,
} from "lucide-react-native";
import { useTheme } from "../../components/context/ThemeContext";
import { supabase } from "../../lib/supabase";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { AnimatedPressable } from "../../components/ui/AnimatedPressable";
import { AdminGuard } from "../../components/auth/AdminGuard";
import { FadeInDown, FadeInUp } from "react-native-reanimated";

interface CreatorApplication {
    id: string;
    user_id: string;
    motivation: string;
    opportunity_type: string;
    opportunity_title: string;
    linkedin_url: string;
    proof_url: string;
    portfolio_url: string;
    bio: string;
    social_links: string;
    kyc_image_url: string;
    status: 'pending' | 'approved' | 'rejected';
    applied_at: string;
    reviewed_at: string | null;
    reviewer_notes: string;
}

function AdminCreatorApplicationsContent() {
    const { isDark, colors } = useTheme();
    const router = useRouter();
    const { user } = useUser();

    const [applications, setApplications] = useState<CreatorApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
    const [selectedApp, setSelectedApp] = useState<CreatorApplication | null>(null);
    const [reviewNote, setReviewNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [profileCache, setProfileCache] = useState<Record<string, { name: string; email: string; avatar: string }>>({});

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const cardBg = colors.card;
    const borderColor = colors.border;

    const fetchApplications = useCallback(async () => {
        setLoading(true);
        try {
            const query = supabase
                .from('creator_applications')
                .select('*')
                .order('applied_at', { ascending: false });

            if (filter !== 'all') {
                query.eq('status', filter);
            }

            const { data, error } = await query;
            if (error) throw error;
            setApplications(data || []);

            const userIds = (data || []).map(app => app.user_id);
            if (userIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('user_id, full_name, email')
                    .in('user_id', userIds);

                const cache: Record<string, { name: string; email: string; avatar: string }> = {};
                profiles?.forEach(p => {
                    cache[p.user_id] = {
                        name: p.full_name || 'Unknown',
                        email: p.email || '',
                        avatar: '',
                    };
                });
                setProfileCache(cache);
            }
        } catch (e: any) {
            console.error('Failed to fetch applications:', e);
            Alert.alert('Error', 'Failed to load applications.');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { fetchApplications(); }, [fetchApplications]);

    const handleReview = async (applicationId: string, newStatus: 'approved' | 'rejected') => {
        setSubmitting(true);
        try {
            const { data, error } = await supabase.rpc('review_creator_application', {
                p_application_id: applicationId,
                p_status: newStatus,
                p_notes: reviewNote || `${newStatus === 'approved' ? 'Approved' : 'Rejected'} by admin`,
            });

            if (error) throw error;

            if (data?.error) {
                Alert.alert('Error', data.error);
                setSubmitting(false);
                return;
            }

            if (newStatus === 'approved') {
                try {
                    await supabase.functions.invoke('clerk-metadata', {
                        body: {
                            userId: data?.user_id,
                            metadata: { creatorStatus: 'approved' },
                        },
                    });
                } catch (e) {
                    console.error('Clerk metadata sync failed:', e);
                }
            }

            setSelectedApp(null);
            setReviewNote('');
            fetchApplications();

            Alert.alert(
                'Success',
                `Application ${newStatus === 'approved' ? 'approved' : 'rejected'} successfully.`
            );
        } catch (e: any) {
            console.error('Review error:', e);

            const { error: appError } = await supabase
                .from('creator_applications')
                .update({
                    status: newStatus,
                    reviewed_at: new Date().toISOString(),
                    reviewer_notes: reviewNote || `${newStatus} by admin`,
                })
                .eq('id', applicationId);

            if (appError) {
                Alert.alert('Error', appError.message || 'Failed to review application.');
                setSubmitting(false);
                return;
            }

            const { data: app } = await supabase
                .from('creator_applications')
                .select('user_id')
                .eq('id', applicationId)
                .single();

            if (app?.user_id) {
                await supabase
                    .from('profiles')
                    .update({ creator_status: newStatus })
                    .eq('user_id', app.user_id);

                if (newStatus === 'approved') {
                    try {
                        await supabase.functions.invoke('clerk-metadata', {
                            body: { userId: app.user_id, metadata: { creatorStatus: 'approved' } },
                        });
                    } catch (e) {
                        console.error('Clerk metadata sync failed:', e);
                    }
                }
            }

            setSelectedApp(null);
            setReviewNote('');
            fetchApplications();
            Alert.alert('Success', `Application ${newStatus} successfully.`);
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'approved': return '#10B981';
            case 'rejected': return '#EF4444';
            default: return '#F59E0B';
        }
    };

    const getStatusBg = (status: string) => {
        switch (status) {
            case 'approved': return 'rgba(16,185,129,0.1)';
            case 'rejected': return 'rgba(239,68,68,0.1)';
            default: return 'rgba(245,158,11,0.1)';
        }
    };

    const renderApplication = useCallback(({ item, index }: { item: CreatorApplication; index: number }) => {
        const profile = profileCache[item.user_id];
        const applicantName = profile?.name || 'Unknown User';
        const applicantEmail = profile?.email || '';

        return (
            <AnimatedPressable
                onPress={() => setSelectedApp(item)}
                style={[styles.card, { backgroundColor: cardBg, borderColor }]}
                entering={FadeInDown.delay(index * 60).duration(350).springify()}
            >
                <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                        <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
                            <User size={18} color={colors.primary} />
                        </View>
                        <View>
                            <Text style={[styles.cardName, { color: textPrimary }]} numberOfLines={1}>
                                {applicantName}
                            </Text>
                            <Text style={[styles.cardEmail, { color: textSecondary }]} numberOfLines={1}>
                                {applicantEmail}
                            </Text>
                        </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusBg(item.status) }]}>
                        <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                        </Text>
                    </View>
                </View>

                <View style={styles.cardBody}>
                    <View style={styles.typeRow}>
                        <Award size={14} color={getStatusColor(item.status)} />
                        <Text style={[styles.typeText, { color: textPrimary }]}>
                            {item.opportunity_title}
                        </Text>
                    </View>
                    <Text style={[styles.opportunityType, { color: textSecondary }]}>
                        {item.opportunity_type.charAt(0).toUpperCase() + item.opportunity_type.slice(1)}
                    </Text>
                </View>

                <View style={styles.cardFooter}>
                    <View style={styles.dateRow}>
                        <Clock size={12} color={textSecondary} />
                        <Text style={[styles.dateText, { color: textSecondary }]}>
                            {new Date(item.applied_at).toLocaleDateString()}
                        </Text>
                    </View>
                    <ChevronRight size={16} color={textSecondary} />
                </View>
            </AnimatedPressable>
        );
    }, [cardBg, borderColor, textPrimary, textSecondary, colors.primary, profileCache]);

    const filters: { key: typeof filter; label: string }[] = [
        { key: 'pending', label: 'Pending' },
        { key: 'approved', label: 'Approved' },
        { key: 'rejected', label: 'Rejected' },
        { key: 'all', label: 'All' },
    ];

    const stats = {
        total: applications.length,
        pending: applications.filter(a => a.status === 'pending').length,
        approved: applications.filter(a => a.status === 'approved').length,
        rejected: applications.filter(a => a.status === 'rejected').length,
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader title="Creator Applications" subtitle="Review and manage applications" showBack />

            <View style={styles.header}>
                {/* Stats */}
                <View style={styles.statsRow}>
                    <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.statValue, { color: textPrimary }]}>{stats.total}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>Total</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.pending}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>Pending</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.approved}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>Approved</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.statValue, { color: '#EF4444' }]}>{stats.rejected}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>Rejected</Text>
                    </View>
                </View>

                {/* Filter Chips */}
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
                    <Text style={[styles.loadingText, { color: textSecondary }]}>Loading applications...</Text>
                </View>
            ) : (
                <FlatList
                    data={applications}
                    keyExtractor={item => item.id}
                    renderItem={renderApplication}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <ShieldCheck size={48} color={textSecondary} />
                            <Text style={[styles.emptyTitle, { color: textPrimary }]}>No Applications</Text>
                            <Text style={[styles.emptyText, { color: textSecondary }]}>
                                {filter === 'pending' ? 'No pending applications to review.' : 'No applications found.'}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Detail Modal */}
            <Modal visible={!!selectedApp} transparent animationType="slide" onRequestClose={() => { setSelectedApp(null); setReviewNote(''); }}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalSheet, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: textPrimary }]}>Application Details</Text>
                            <TouchableOpacity onPress={() => { setSelectedApp(null); setReviewNote(''); }} style={styles.modalClose}>
                                <X size={20} color={textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {selectedApp && (
                            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                                <View style={styles.modalBody}>
                                    <View style={[styles.statusRow, { backgroundColor: getStatusBg(selectedApp.status) }]}>
                                        <Text style={[styles.statusTextLarge, { color: getStatusColor(selectedApp.status) }]}>
                                            {selectedApp.status.toUpperCase()}
                                        </Text>
                                        {selectedApp.reviewed_at && (
                                            <Text style={[styles.reviewedAt, { color: textSecondary }]}>
                                                Reviewed {new Date(selectedApp.reviewed_at).toLocaleDateString()}
                                            </Text>
                                        )}
                                    </View>

                                    <View style={styles.detailSection}>
                                        <Text style={[styles.detailLabel, { color: textSecondary }]}>Applicant</Text>
                                        <View style={styles.applicantRow}>
                                            <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
                                                <User size={20} color={colors.primary} />
                                            </View>
                                            <View>
                                                <Text style={[styles.applicantName, { color: textPrimary }]}>
                                                    {profileCache[selectedApp.user_id]?.name || 'Unknown User'}
                                                </Text>
                                                <Text style={[styles.applicantEmail, { color: textSecondary }]}>
                                                    {profileCache[selectedApp.user_id]?.email || ''}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>

                                    <View style={styles.detailSection}>
                                        <Text style={[styles.detailLabel, { color: textSecondary }]}>Opportunity</Text>
                                        <Text style={[styles.detailValue, { color: textPrimary }]}>{selectedApp.opportunity_title}</Text>
                                        <Text style={[styles.detailType, { color: textSecondary }]}>
                                            {selectedApp.opportunity_type.charAt(0).toUpperCase() + selectedApp.opportunity_type.slice(1)}
                                        </Text>
                                    </View>

                                    <View style={styles.detailSection}>
                                        <Text style={[styles.detailLabel, { color: textSecondary }]}>Motivation</Text>
                                        <Text style={[styles.detailValue, { color: textPrimary }]}>{selectedApp.motivation}</Text>
                                    </View>

                                    <View style={styles.detailSection}>
                                        <Text style={[styles.detailLabel, { color: textSecondary }]}>Bio</Text>
                                        <Text style={[styles.detailValue, { color: textPrimary }]}>{selectedApp.bio}</Text>
                                    </View>

                                    {selectedApp.linkedin_url && (
                                        <View style={styles.detailSection}>
                                            <Text style={[styles.detailLabel, { color: textSecondary }]}>LinkedIn</Text>
                                            <TouchableOpacity
                                                style={styles.linkRow}
                                                onPress={() => {/* open link */}}
                                            >
                                                <ExternalLink size={14} color={colors.primary} />
                                                <Text style={[styles.linkText, { color: colors.primary }]} numberOfLines={1}>
                                                    {selectedApp.linkedin_url}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {selectedApp.kyc_image_url && (
                                        <View style={styles.detailSection}>
                                            <Text style={[styles.detailLabel, { color: textSecondary }]}>Verification Document</Text>
                                            <Image
                                                source={{ uri: selectedApp.kyc_image_url }}
                                                style={styles.kycImage}
                                                resizeMode="contain"
                                            />
                                        </View>
                                    )}

                                    {selectedApp.proof_url && (
                                        <View style={styles.detailSection}>
                                            <Text style={[styles.detailLabel, { color: textSecondary }]}>Proof URL</Text>
                                            <Text style={[styles.linkText, { color: colors.primary }]} numberOfLines={1}>
                                                {selectedApp.proof_url}
                                            </Text>
                                        </View>
                                    )}

                                    <View style={styles.detailSection}>
                                        <Text style={[styles.detailLabel, { color: textSecondary }]}>Applied On</Text>
                                        <Text style={[styles.detailValue, { color: textPrimary }]}>
                                            {new Date(selectedApp.applied_at).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric',
                                            })}
                                        </Text>
                                    </View>

                                    {selectedApp.status === 'pending' && (
                                        <View style={styles.reviewSection}>
                                            <Text style={[styles.detailLabel, { color: textSecondary }]}>Reviewer Notes</Text>
                                            <TextInput
                                                style={[styles.reviewInput, {
                                                    backgroundColor: colors.card,
                                                    color: textPrimary,
                                                    borderColor: colors.border
                                                }]}
                                                value={reviewNote}
                                                onChangeText={setReviewNote}
                                                placeholder="Add a note about this decision..."
                                                placeholderTextColor={textSecondary}
                                                multiline
                                                numberOfLines={3}
                                            />

                                            <View style={styles.actionButtons}>
                                                <TouchableOpacity
                                                    style={[styles.actionBtn, styles.rejectBtn]}
                                                    onPress={() => handleReview(selectedApp.id, 'rejected')}
                                                    disabled={submitting}
                                                >
                                                    <X size={18} color="#FFFFFF" />
                                                    <Text style={styles.rejectBtnText}>Reject</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.actionBtn, styles.approveBtn]}
                                                    onPress={() => handleReview(selectedApp.id, 'approved')}
                                                    disabled={submitting}
                                                >
                                                    {submitting ? (
                                                        <ActivityIndicator color="#FFFFFF" size="small" />
                                                    ) : (
                                                        <>
                                                            <Check size={18} color="#FFFFFF" />
                                                            <Text style={styles.approveBtnText}>Approve</Text>
                                                        </>
                                                    )}
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}

                                    {selectedApp.reviewer_notes && (
                                        <View style={styles.detailSection}>
                                            <Text style={[styles.detailLabel, { color: textSecondary }]}>Reviewer Notes</Text>
                                            <Text style={[styles.detailValue, { color: textPrimary }]}>
                                                {selectedApp.reviewer_notes}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

export default function AdminCreatorApplications() {
    return (
        <AdminGuard>
            <AdminCreatorApplicationsContent />
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
    listContent: { paddingHorizontal: 20, paddingBottom: 100 },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 12, fontSize: 14 },
    emptyContainer: { alignItems: 'center', paddingTop: 60 },
    emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 8 },
    emptyText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },

    card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    cardName: { fontSize: 15, fontWeight: '700' },
    cardEmail: { fontSize: 12, fontWeight: '500' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText: { fontSize: 11, fontWeight: '700' },
    cardBody: { marginBottom: 12 },
    typeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    typeText: { fontSize: 14, fontWeight: '600' },
    opportunityType: { fontSize: 12, fontWeight: '500' },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dateText: { fontSize: 12 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
    modalTitle: { fontSize: 18, fontWeight: '700' },
    modalClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
    modalBody: { padding: 24 },
    statusRow: { padding: 12, borderRadius: 12, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statusTextLarge: { fontSize: 14, fontWeight: '800' },
    reviewedAt: { fontSize: 12 },
    detailSection: { marginBottom: 20 },
    detailLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    detailValue: { fontSize: 15, lineHeight: 22 },
    detailType: { fontSize: 13, marginTop: 4 },
    applicantRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    applicantName: { fontSize: 16, fontWeight: '700' },
    applicantEmail: { fontSize: 13, marginTop: 2 },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    linkText: { fontSize: 14, fontWeight: '500', flex: 1 },
    kycImage: { width: '100%', height: 200, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
    reviewSection: { marginTop: 8, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
    reviewInput: { borderRadius: 14, padding: 14, fontSize: 14, borderWidth: 1, minHeight: 80, textAlignVertical: 'top', marginBottom: 16 },
    actionButtons: { flexDirection: 'row', gap: 12 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14 },
    rejectBtn: { backgroundColor: '#EF4444' },
    rejectBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
    approveBtn: { backgroundColor: '#10B981' },
    approveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
