import { View, Text, FlatList, Image, StyleSheet, ActivityIndicator, Alert, Linking, ScrollView, TouchableOpacity, Modal, TextInput } from "react-native";
import React, { useState, useCallback, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
    Check,
    X,
    ExternalLink,
    User,
    Award,
    ChevronRight,
    ShieldCheck,
    Clock,
    Loader2,
} from "lucide-react-native";
import { useTheme } from "../../components/context/ThemeContext";
import { supabase } from "../../lib/supabase";
import { clerkStatusMetadata } from "../../lib/creator-clerk-metadata";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { AnimatedPressable } from "../../components/ui/AnimatedPressable";
import { AdminGuard } from "../../components/auth/AdminGuard";
import { FadeInDown } from "react-native-reanimated";

// Canonical creator_applications row (see migration 031). Which narrative
// fields are set depends on the writer: the mobile creator wizard fills the
// motivation/opportunity/kyc fields, mobile mentor-apply and the web form fill
// the display/content/proof fields — every one of them is nullable here and
// the UI renders whichever side exists.
interface CreatorApplication {
    id: string;
    user_id: string;
    application_kind?: 'creator' | 'mentor' | null;
    motivation: string | null;
    opportunity_type: string | null;
    opportunity_title: string | null;
    linkedin_url: string | null;
    proof_url: string | null;
    proof_path?: string | null;
    portfolio_url: string | null;
    bio: string | null;
    social_links: string | null;
    kyc_image_url: string | null;
    display_name?: string | null;
    content_type?: string | null;
    experience?: string | null;
    sample_content_url?: string | null;
    email?: string | null;
    phone_number?: string | null;
    country?: string | null;
    status: 'pending' | 'approved' | 'rejected';
    applied_at: string;
    reviewed_at: string | null;
    reviewer_notes: string;
}

const titleCase = (value?: string | null) =>
    value ? value.charAt(0).toUpperCase() + value.slice(1) : '';

function AdminCreatorApplicationsContent() {
    const { t } = useTranslation('misc');
    const { isDark, colors } = useTheme();

    const [applications, setApplications] = useState<CreatorApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
    const [selectedApp, setSelectedApp] = useState<CreatorApplication | null>(null);
    const [reviewNote, setReviewNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [profileCache, setProfileCache] = useState<Record<string, { name: string; email: string; avatar: string }>>({});
    const [signedKycUrl, setSignedKycUrl] = useState<string | null>(null);
    const [signedProofUrl, setSignedProofUrl] = useState<string | null>(null);

    // KYC docs live in a PRIVATE bucket. Resolve a short-lived signed URL when
    // an application is opened. Legacy rows may hold a full public URL — use
    // those as-is for backward compatibility (derived at render, no effect).
    const rawKyc = selectedApp?.kyc_image_url ?? null;
    const directKycUrl = rawKyc && /^https?:\/\//i.test(rawKyc) ? rawKyc : null;

    // Adjust-during-render (React's documented alternative to a state-syncing
    // effect): clear the stale signed URL when the opened application changes.
    const [prevRawKyc, setPrevRawKyc] = useState(rawKyc);
    if (prevRawKyc !== rawKyc) {
        setPrevRawKyc(rawKyc);
        setSignedKycUrl(null);
    }

    useEffect(() => {
        if (!rawKyc || directKycUrl) return;
        let cancelled = false;
        supabase.storage
            .from('creator-applications')
            .createSignedUrl(rawKyc, 3600)
            .then(({ data }) => { if (!cancelled) setSignedKycUrl(data?.signedUrl ?? null); });
        return () => { cancelled = true; };
    }, [rawKyc, directKycUrl]);

    const kycUrl = directKycUrl ?? signedKycUrl;

    const rawProof = selectedApp?.proof_path ?? null;
    const legacyProofUrl = selectedApp?.proof_url && /^https?:\/\//i.test(selectedApp.proof_url)
        ? selectedApp.proof_url
        : null;

    const [prevRawProof, setPrevRawProof] = useState(rawProof);
    if (prevRawProof !== rawProof) {
        setPrevRawProof(rawProof);
        setSignedProofUrl(null);
    }

    useEffect(() => {
        if (!rawProof || legacyProofUrl) return;
        let cancelled = false;
        supabase.storage
            .from('creator-proofs')
            .createSignedUrl(rawProof, 3600)
            .then(({ data }) => { if (!cancelled) setSignedProofUrl(data?.signedUrl ?? null); });
        return () => { cancelled = true; };
    }, [rawProof, legacyProofUrl]);

    const proofUrl = legacyProofUrl ?? signedProofUrl;

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const cardBg = colors.card;
    const borderColor = colors.border;

    // Bumped by event handlers to refetch after a review. Loading starts true;
    // the effect never sets state synchronously (all sets follow an await),
    // and filter-driven refetches keep showing the previous list (SWR-style).
    const [reloadNonce, setReloadNonce] = useState(0);
    useEffect(() => {
        const fetchApplications = async () => {
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
                        name: p.full_name || t('admin.creatorApplications.unknown'),
                        email: p.email || '',
                        avatar: '',
                    };
                });
                setProfileCache(cache);
            }
        } catch (e: any) {
            console.error('Failed to fetch applications:', e);
            Alert.alert(t('common:states.error'), t('admin.creatorApplications.alerts.loadFailed'));
        } finally {
            setLoading(false);
        }
        };
        fetchApplications();
    }, [filter, t, reloadNonce]);

    // Post-review refetch. Deliberately does NOT flip `loading`: the nonce
    // defers the fetch to the next effect pass, so a spinner would blank the
    // list for a full render cycle after every review. Fresh rows swap in
    // place instead.
    const refreshApplications = useCallback(() => {
        setReloadNonce((nonce) => nonce + 1);
    }, []);

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
                Alert.alert(t('common:states.error'), data.error);
                setSubmitting(false);
                return;
            }

            if (newStatus === 'approved') {
                try {
                    await supabase.functions.invoke('clerk-metadata', {
                        body: {
                            userId: data?.user_id,
                            metadata: clerkStatusMetadata(selectedApp?.application_kind, 'approved'),
                        },
                    });
                } catch (e) {
                    console.error('Clerk metadata sync failed:', e);
                }
            }

            setSelectedApp(null);
            setReviewNote('');
            refreshApplications();

            Alert.alert(
                t('common:states.success'),
                newStatus === 'approved' ? t('admin.creatorApplications.alerts.approvedSuccess') : t('admin.creatorApplications.alerts.rejectedSuccess')
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
                Alert.alert(t('common:states.error'), appError.message || t('admin.creatorApplications.alerts.reviewFailed'));
                setSubmitting(false);
                return;
            }

            const { data: app } = await supabase
                .from('creator_applications')
                .select('user_id')
                .eq('id', applicationId)
                .single();

            if (app?.user_id) {
                // creator_status is a protected profile column (migration 015);
                // the admin path of this RPC sets it for the target user.
                await supabase.rpc('set_creator_status', {
                    p_status: newStatus,
                    p_user_id: app.user_id,
                });

                if (newStatus === 'approved') {
                    try {
                        await supabase.functions.invoke('clerk-metadata', {
                            body: { userId: app.user_id, metadata: clerkStatusMetadata(selectedApp?.application_kind, 'approved') },
                        });
                    } catch (e) {
                        console.error('Clerk metadata sync failed:', e);
                    }
                }
            }

            setSelectedApp(null);
            setReviewNote('');
            refreshApplications();
            Alert.alert(t('common:states.success'), newStatus === 'approved' ? t('admin.creatorApplications.alerts.approvedSuccess') : t('admin.creatorApplications.alerts.rejectedSuccess'));
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
        const applicantName = profile?.name || item.display_name || t('admin.creatorApplications.unknownUser');
        const applicantEmail = profile?.email || item.email || '';
        const cardTitle = item.opportunity_title
            || (item.content_type ? titleCase(item.content_type) : '')
            || t('admin.creatorApplications.card.untitled');
        const cardKind = item.opportunity_type
            || (item.application_kind === 'mentor'
                ? t('admin.creatorApplications.kind.mentor')
                : t('admin.creatorApplications.kind.creator'));

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
                            {t(`admin.creatorApplications.status.${item.status}`)}
                        </Text>
                    </View>
                </View>

                <View style={styles.cardBody}>
                    <View style={styles.typeRow}>
                        <Award size={14} color={getStatusColor(item.status)} />
                        <Text style={[styles.typeText, { color: textPrimary }]}>
                            {cardTitle}
                        </Text>
                    </View>
                    <Text style={[styles.opportunityType, { color: textSecondary }]}>
                        {titleCase(cardKind)}
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
    }, [cardBg, borderColor, textPrimary, textSecondary, colors.primary, profileCache, t]);

    const filters: { key: typeof filter; label: string }[] = [
        { key: 'pending', label: t('admin.creatorApplications.status.pending') },
        { key: 'approved', label: t('admin.creatorApplications.status.approved') },
        { key: 'rejected', label: t('admin.creatorApplications.status.rejected') },
        { key: 'all', label: t('admin.creatorApplications.filters.all') },
    ];

    const stats = {
        total: applications.length,
        pending: applications.filter(a => a.status === 'pending').length,
        approved: applications.filter(a => a.status === 'approved').length,
        rejected: applications.filter(a => a.status === 'rejected').length,
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader title={t('admin.creatorApplications.title')} subtitle={t('admin.creatorApplications.subtitle')} showBack />

            <View style={styles.header}>
                {/* Stats */}
                <View style={styles.statsRow}>
                    <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.statValue, { color: textPrimary }]}>{stats.total}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>{t('admin.creatorApplications.stats.total')}</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.pending}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>{t('admin.creatorApplications.status.pending')}</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.approved}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>{t('admin.creatorApplications.status.approved')}</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.statValue, { color: '#EF4444' }]}>{stats.rejected}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>{t('admin.creatorApplications.status.rejected')}</Text>
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
                    <Text style={[styles.loadingText, { color: textSecondary }]}>{t('admin.creatorApplications.loading')}</Text>
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
                            <Text style={[styles.emptyTitle, { color: textPrimary }]}>{t('admin.creatorApplications.empty.title')}</Text>
                            <Text style={[styles.emptyText, { color: textSecondary }]}>
                                {filter === 'pending' ? t('admin.creatorApplications.empty.pending') : t('admin.creatorApplications.empty.generic')}
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
                            <Text style={[styles.modalTitle, { color: textPrimary }]}>{t('admin.creatorApplications.modal.title')}</Text>
                            <TouchableOpacity onPress={() => { setSelectedApp(null); setReviewNote(''); }} style={styles.modalClose}>
                                <X size={20} color={textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {selectedApp && (
                            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                                <View style={styles.modalBody}>
                                    <View style={[styles.statusRow, { backgroundColor: getStatusBg(selectedApp.status) }]}>
                                        <Text style={[styles.statusTextLarge, { color: getStatusColor(selectedApp.status) }]}>
                                            {`${t(selectedApp.application_kind === 'mentor' ? 'admin.creatorApplications.kind.mentor' : 'admin.creatorApplications.kind.creator')} · ${t(`admin.creatorApplications.status.${selectedApp.status}`)}`.toUpperCase()}
                                        </Text>
                                        {selectedApp.reviewed_at && (
                                            <Text style={[styles.reviewedAt, { color: textSecondary }]}>
                                                {t('admin.creatorApplications.modal.reviewedOn', { date: new Date(selectedApp.reviewed_at).toLocaleDateString() })}
                                            </Text>
                                        )}
                                    </View>

                                    <View style={styles.detailSection}>
                                        <Text style={[styles.detailLabel, { color: textSecondary }]}>{t('admin.creatorApplications.modal.applicant')}</Text>
                                        <View style={styles.applicantRow}>
                                            <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
                                                <User size={20} color={colors.primary} />
                                            </View>
                                            <View>
                                                <Text style={[styles.applicantName, { color: textPrimary }]}>
                                                    {profileCache[selectedApp.user_id]?.name || selectedApp.display_name || t('admin.creatorApplications.unknownUser')}
                                                </Text>
                                                <Text style={[styles.applicantEmail, { color: textSecondary }]}>
                                                    {profileCache[selectedApp.user_id]?.email || selectedApp.email || ''}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>

                                    {(selectedApp.opportunity_title || selectedApp.opportunity_type) && (
                                        <View style={styles.detailSection}>
                                            <Text style={[styles.detailLabel, { color: textSecondary }]}>{t('admin.creatorApplications.modal.opportunity')}</Text>
                                            {selectedApp.opportunity_title && (
                                                <Text style={[styles.detailValue, { color: textPrimary }]}>{selectedApp.opportunity_title}</Text>
                                            )}
                                            {selectedApp.opportunity_type && (
                                                <Text style={[styles.detailType, { color: textSecondary }]}>
                                                    {titleCase(selectedApp.opportunity_type)}
                                                </Text>
                                            )}
                                        </View>
                                    )}

                                    {selectedApp.content_type && (
                                        <View style={styles.detailSection}>
                                            <Text style={[styles.detailLabel, { color: textSecondary }]}>{t('admin.creatorApplications.modal.contentType')}</Text>
                                            <Text style={[styles.detailValue, { color: textPrimary }]}>{titleCase(selectedApp.content_type)}</Text>
                                        </View>
                                    )}

                                    {selectedApp.motivation && (
                                        <View style={styles.detailSection}>
                                            <Text style={[styles.detailLabel, { color: textSecondary }]}>{t('admin.creatorApplications.modal.motivation')}</Text>
                                            <Text style={[styles.detailValue, { color: textPrimary }]}>{selectedApp.motivation}</Text>
                                        </View>
                                    )}

                                    {selectedApp.bio && (
                                        <View style={styles.detailSection}>
                                            <Text style={[styles.detailLabel, { color: textSecondary }]}>{t('admin.creatorApplications.modal.bio')}</Text>
                                            <Text style={[styles.detailValue, { color: textPrimary }]}>{selectedApp.bio}</Text>
                                        </View>
                                    )}

                                    {selectedApp.experience && (
                                        <View style={styles.detailSection}>
                                            <Text style={[styles.detailLabel, { color: textSecondary }]}>{t('admin.creatorApplications.modal.experience')}</Text>
                                            <Text style={[styles.detailValue, { color: textPrimary }]}>{selectedApp.experience}</Text>
                                        </View>
                                    )}

                                    {(selectedApp.phone_number || selectedApp.country) && (
                                        <View style={styles.detailSection}>
                                            <Text style={[styles.detailLabel, { color: textSecondary }]}>{t('admin.creatorApplications.modal.contact')}</Text>
                                            <Text style={[styles.detailValue, { color: textPrimary }]}>
                                                {[selectedApp.phone_number, selectedApp.country].filter(Boolean).join(' · ')}
                                            </Text>
                                        </View>
                                    )}

                                    {selectedApp.sample_content_url && (
                                        <View style={styles.detailSection}>
                                            <Text style={[styles.detailLabel, { color: textSecondary }]}>{t('admin.creatorApplications.modal.sampleContent')}</Text>
                                            <TouchableOpacity
                                                style={styles.linkRow}
                                                onPress={() => {
                                                    const url = selectedApp.sample_content_url?.startsWith('http')
                                                        ? selectedApp.sample_content_url
                                                        : `https://${selectedApp.sample_content_url}`;
                                                    Linking.openURL(url).catch(() => {});
                                                }}
                                            >
                                                <ExternalLink size={14} color={colors.primary} />
                                                <Text style={[styles.linkText, { color: colors.primary }]} numberOfLines={1}>
                                                    {selectedApp.sample_content_url}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {selectedApp.linkedin_url && (
                                        <View style={styles.detailSection}>
                                            <Text style={[styles.detailLabel, { color: textSecondary }]}>{t('admin.creatorApplications.modal.linkedin')}</Text>
                                            <TouchableOpacity
                                                style={styles.linkRow}
                                                onPress={() => {
                                                    const url = selectedApp.linkedin_url?.startsWith('http')
                                                        ? selectedApp.linkedin_url
                                                        : `https://${selectedApp.linkedin_url}`;
                                                    Linking.openURL(url).catch(() => {});
                                                }}
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
                                            <Text style={[styles.detailLabel, { color: textSecondary }]}>{t('admin.creatorApplications.modal.verificationDocument')}</Text>
                                            {kycUrl ? (
                                                <Image
                                                    source={{ uri: kycUrl }}
                                                    style={styles.kycImage}
                                                    resizeMode="contain"
                                                />
                                            ) : (
                                                <View style={[styles.kycImage, { alignItems: 'center', justifyContent: 'center' }]}>
                                                    <ActivityIndicator color={colors.primary} />
                                                </View>
                                            )}
                                        </View>
                                    )}

                                    {(() => {
                                        if (!proofUrl) return null;
                                        return (
                                            <View style={styles.detailSection}>
                                                <Text style={[styles.detailLabel, { color: textSecondary }]}>{t('admin.creatorApplications.modal.proofUrl')}</Text>
                                                <TouchableOpacity
                                                    style={styles.linkRow}
                                                onPress={() => { Linking.openURL(proofUrl).catch(() => {}); }}
                                                >
                                                    <ExternalLink size={14} color={colors.primary} />
                                                    <Text style={[styles.linkText, { color: colors.primary }]} numberOfLines={1}>
                                                    {proofUrl}
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })()}

                                    <View style={styles.detailSection}>
                                        <Text style={[styles.detailLabel, { color: textSecondary }]}>{t('admin.creatorApplications.modal.appliedOn')}</Text>
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
                                            <Text style={[styles.detailLabel, { color: textSecondary }]}>{t('admin.creatorApplications.modal.reviewerNotes')}</Text>
                                            <TextInput
                                                style={[styles.reviewInput, {
                                                    backgroundColor: colors.card,
                                                    color: textPrimary,
                                                    borderColor: colors.border
                                                }]}
                                                value={reviewNote}
                                                onChangeText={setReviewNote}
                                                placeholder={t('admin.creatorApplications.modal.notePlaceholder')}
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
                                                    <Text style={styles.rejectBtnText}>{t('admin.creatorApplications.modal.reject')}</Text>
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
                                                            <Text style={styles.approveBtnText}>{t('admin.creatorApplications.modal.approve')}</Text>
                                                        </>
                                                    )}
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}

                                    {selectedApp.reviewer_notes && (
                                        <View style={styles.detailSection}>
                                            <Text style={[styles.detailLabel, { color: textSecondary }]}>{t('admin.creatorApplications.modal.reviewerNotes')}</Text>
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
