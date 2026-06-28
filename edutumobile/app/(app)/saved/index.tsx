import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Image } from "react-native";
import React, { useState, useCallback, useEffect, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { Bookmark, Clock, Trash2, ExternalLink, Sparkles, AlertCircle } from "lucide-react-native";
import { useTheme } from "../../../components/context/ThemeContext";
import { supabase } from "../../../lib/supabase";
import { fetchSavedOpportunities, unsaveOpportunity } from "../../../packages/core/src/services/bookmarks";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { ErrorBoundary } from "../../../components/ui/ErrorBoundary";
import { EmptyState } from "../../../components/ui/EmptyState";
import { OpportunityCardSkeleton } from "../../../components/ui/Skeleton";

interface SavedOpportunity {
    id: string;
    bookmark_id: string;
    title: string;
    organization: string;
    deadline: string;
    category: string;
    location: string;
    image: string;
    match: number;
    created_at: string;
    daysRemaining: number;
}

export default function SavedScreen() {
    const { isDark, colors } = useTheme();
    const { user } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();

    const [savedOpps, setSavedOpps] = useState<SavedOpportunity[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<'all' | 'urgent' | 'upcoming'>('all');

    const fetchSaved = useCallback(async () => {
        if (!user) return;
        try {
            setLoading(true);
            const saved = await fetchSavedOpportunities(supabase, user.id, getToken);
            const mapped: SavedOpportunity[] = saved.map((bookmark) => {
                const deadline = bookmark.deadline;
                const daysRemaining = deadline
                    ? Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : 999;

                return {
                    id: bookmark.opportunity_id,
                    bookmark_id: bookmark.id,
                    title: bookmark.title || 'Opportunity',
                    organization: bookmark.organization || 'Unknown',
                    deadline: deadline || '',
                    category: bookmark.category || '',
                    location: bookmark.location || '',
                    image: bookmark.image || '',
                    match: bookmark.match_score || 0,
                    created_at: bookmark.created_at || '',
                    daysRemaining,
                };
            });

            setSavedOpps(mapped);
        } catch (error) {
            console.error('Error fetching saved opportunities:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [getToken, user]);

    useEffect(() => {
        fetchSaved();
    }, [fetchSaved]);

    const removeBookmark = async (bookmarkId: string) => {
        if (!user) return;
        try {
            const bookmark = savedOpps.find(opp => opp.bookmark_id === bookmarkId);
            if (!bookmark) return;

            const removed = await unsaveOpportunity(supabase, user.id, bookmark.id, getToken);
            if (!removed) throw new Error('Unable to remove bookmark');
            setSavedOpps(prev => prev.filter(opp => opp.bookmark_id !== bookmarkId));
        } catch (error) {
            console.error('Error removing bookmark:', error);
        }
    };

    const filteredOpps = useMemo(() => {
        if (filter === 'urgent') {
            return savedOpps.filter(opp => opp.daysRemaining <= 7 && opp.daysRemaining >= 0);
        }
        if (filter === 'upcoming') {
            return savedOpps.filter(opp => opp.daysRemaining > 7);
        }
        return savedOpps;
    }, [savedOpps, filter]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchSaved();
    }, [fetchSaved]);

    const getDeadlineColor = (days: number) => {
        if (days <= 0) return '#EF4444';
        if (days <= 3) return '#EF4444';
        if (days <= 7) return '#F59E0B';
        return '#10B981';
    };

    const getDeadlineText = (days: number) => {
        if (days < 0) return 'Ended';
        if (days === 0) return 'Today';
        if (days === 1) return 'Tomorrow';
        if (days <= 7) return `${days} days left`;
        return `${days} days left`;
    };

    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
                <ScreenHeader title="Saved Opportunities" showBack />
                <View style={styles.loadingContainer}>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <OpportunityCardSkeleton key={i} />
                    ))}
                </View>
            </SafeAreaView>
        );
    }

    return (
        <ErrorBoundary message="Failed to load saved opportunities">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title="Saved Opportunities"
                showBack
                subtitle={`${savedOpps.length} saved`}
            />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.accent}
                    />
                }
            >
                {savedOpps.length === 0 ? (
                    <EmptyState
                        variant="saved"
                        onAction={() => router.push('/opportunities')}
                    />
                ) : (
                    <>
                        {/* Filter Tabs */}
                        <Animated.View entering={FadeInDown} style={styles.filterContainer}>
                            <TouchableOpacity
                                style={[styles.filterTab, filter === 'all' && { backgroundColor: colors.accent }]}
                                onPress={() => setFilter('all')}
                                accessibilityLabel={`Show all saved opportunities, ${savedOpps.length} total`}
                                accessibilityRole="button"
                            >
                                <Bookmark size={16} color={filter === 'all' ? '#FFFFFF' : colors.foreground} />
                                <Text style={[styles.filterTabText, { color: filter === 'all' ? '#FFFFFF' : colors.foreground }]}>
                                    All ({savedOpps.length})
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.filterTab, filter === 'urgent' && { backgroundColor: '#EF4444' }]}
                                onPress={() => setFilter('urgent')}
                                accessibilityLabel={`Show urgent opportunities, ${savedOpps.filter(o => o.daysRemaining <= 7 && o.daysRemaining >= 0).length} due within 7 days`}
                                accessibilityRole="button"
                            >
                                <AlertCircle size={16} color={filter === 'urgent' ? '#FFFFFF' : '#EF4444'} />
                                <Text style={[styles.filterTabText, { color: filter === 'urgent' ? '#FFFFFF' : '#EF4444' }]}>
                                    Urgent ({savedOpps.filter(o => o.daysRemaining <= 7 && o.daysRemaining >= 0).length})
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.filterTab, filter === 'upcoming' && { backgroundColor: '#10B981' }]}
                                onPress={() => setFilter('upcoming')}
                                accessibilityLabel={`Show upcoming opportunities, ${savedOpps.filter(o => o.daysRemaining > 7).length} due later`}
                                accessibilityRole="button"
                            >
                                <Clock size={16} color={filter === 'upcoming' ? '#FFFFFF' : '#10B981'} />
                                <Text style={[styles.filterTabText, { color: filter === 'upcoming' ? '#FFFFFF' : '#10B981' }]}>
                                    Upcoming ({savedOpps.filter(o => o.daysRemaining > 7).length})
                                </Text>
                            </TouchableOpacity>
                        </Animated.View>

                        {/* Saved Opportunities List */}
                        {filteredOpps.length === 0 ? (
                            <View style={styles.emptyFilterState}>
                                <Sparkles size={32} color={isDark ? '#64748B' : '#94A3B8'} />
                                <Text style={[styles.emptyFilterText, { color: colors.foreground }]}>
                                    No {filter} opportunities
                                </Text>
                            </View>
                        ) : (
                            filteredOpps.map((opp, index) => (
                                <Animated.View
                                    key={opp.id}
                                    entering={FadeInDown.delay(index * 50)}
                                >
                                    <TouchableOpacity
                                        style={[styles.oppCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                                        onPress={() => router.push(`/opportunities/${opp.id}`)}
                                        activeOpacity={0.7}
                                    >
                                        {opp.image && (
                                            <Image
                                                source={{ uri: opp.image }}
                                                style={styles.oppImage}
                                                resizeMode="cover"
                                            />
                                        )}
                                        <View style={styles.oppContent}>
                                            <View style={styles.oppHeader}>
                                                <View style={styles.oppTitleRow}>
                                                    <Text style={[styles.oppTitle, { color: colors.foreground }]} numberOfLines={2}>
                                                        {opp.title}
                                                    </Text>
                                                    {opp.match > 0 && (
                                                        <View style={styles.matchBadge}>
                                                            <Sparkles size={10} color="#FFFFFF" />
                                                            <Text style={styles.matchText}>{opp.match}%</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <Text style={[styles.oppOrg, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                                                    {opp.organization}
                                                </Text>
                                            </View>

                                            <View style={styles.oppDetails}>
                                                <View style={styles.detailRow}>
                                                    <Clock size={14} color={getDeadlineColor(opp.daysRemaining)} />
                                                    <Text style={[styles.detailText, { color: getDeadlineColor(opp.daysRemaining) }]}>
                                                        {getDeadlineText(opp.daysRemaining)}
                                                    </Text>
                                                </View>
                                                {opp.category && (
                                                    <Text style={[styles.categoryTag, { color: colors.accent }]}>
                                                        {opp.category}
                                                    </Text>
                                                )}
                                            </View>

                                            <View style={styles.oppActions}>
                                                <TouchableOpacity
                                                    style={styles.viewBtn}
                                                    onPress={() => router.push(`/opportunities/${opp.id}`)}
                                                >
                                                    <ExternalLink size={16} color={colors.accent} />
                                                    <Text style={[styles.viewBtnText, { color: colors.accent }]}>View Details</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={styles.removeBtn}
                                                    onPress={() => removeBookmark(opp.bookmark_id)}
                                                >
                                                    <Trash2 size={18} color="#EF4444" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                </Animated.View>
                            ))
                        )}
                    </>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>
        </SafeAreaView>
        </ErrorBoundary>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
    },
    filterContainer: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 20,
    },
    filterTab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    filterTabText: {
        fontSize: 13,
        fontWeight: '600',
    },
    oppCard: {
        borderRadius: 16,
        marginBottom: 16,
        borderWidth: 1,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    oppImage: {
        width: '100%',
        height: 140,
    },
    oppContent: {
        padding: 16,
    },
    oppHeader: {
        marginBottom: 12,
    },
    oppTitleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 6,
    },
    oppTitle: {
        fontSize: 16,
        fontWeight: '700',
        flex: 1,
        marginRight: 8,
    },
    matchBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#6366F1',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    matchText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '700',
    },
    oppOrg: {
        fontSize: 14,
    },
    oppDetails: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(148, 163, 184, 0.2)',
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    detailText: {
        fontSize: 13,
        fontWeight: '600',
    },
    categoryTag: {
        fontSize: 12,
        fontWeight: '600',
    },
    oppActions: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    viewBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    viewBtnText: {
        fontSize: 14,
        fontWeight: '600',
    },
    removeBtn: {
        padding: 8,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
        paddingHorizontal: 40,
    },
    emptyIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    emptyDesc: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    emptyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    emptyBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    emptyFilterState: {
        alignItems: 'center',
        paddingVertical: 40,
        gap: 12,
    },
    emptyFilterText: {
        fontSize: 16,
        fontWeight: '600',
    },
    profileStatusBar: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
        marginHorizontal: 20,
        gap: 8,
    },
    profileStatusText: {
        flex: 1,
        fontSize: 12,
        fontWeight: '600',
    },
});
