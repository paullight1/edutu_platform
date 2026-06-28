import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Image } from "react-native";
import React, { useState, useCallback, useEffect, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { Bookmark, Clock, Trash2, ExternalLink, Sparkles, Target, AlertCircle, Briefcase, Calendar } from "lucide-react-native";
import { useTheme } from "../../components/context/ThemeContext";
import { supabase } from "../../lib/supabase";
import { fetchSavedOpportunities, unsaveOpportunity } from "../../packages/core/src/services/bookmarks";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { BrandedLoader } from "../../components/ui/BrandedLoader";
import { LinearGradient } from "expo-linear-gradient";

interface MyOpportunity {
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

const CATEGORY_COLORS: Record<string, string[]> = {
    Scholarship: ['#6366F1', '#3b82f6'],
    Fellowship: ['#F59E0B', '#EA580C'],
    Internship: ['#10B981', '#059669'],
    Grant: ['#EC4899', '#DB2777'],
    Competition: ['#EF4444', '#DC2626'],
    Program: ['#3B82F6', '#2563EB'],
    Job: ['#14B8A6', '#0D9488'],
    Workshop: ['#3b82f6', '#2563eb'],
    Conference: ['#F97316', '#EA580C'],
    default: ['#6366F1', '#3b82f6'],
};

function getCategoryGradient(category: string): string[] {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS.default;
}

export default function MyOpportunitiesScreen() {
    const { isDark, colors } = useTheme();
    const { user } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();

    const [myOpps, setMyOpps] = useState<MyOpportunity[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<'all' | 'urgent' | 'upcoming'>('all');

    const fetchSaved = useCallback(async () => {
        if (!user) return;
        try {
            setLoading(true);
            const saved = await fetchSavedOpportunities(supabase, user.id, getToken);
            const mapped: MyOpportunity[] = saved.map((bookmark) => {
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

            setMyOpps(mapped);
        } catch (error) {
            console.error('Error fetching opportunities:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [getToken, user]);

    useEffect(() => {
        fetchSaved();
    }, [fetchSaved]);

    const removeBookmark = async (bookmarkId: string) => {
        try {
            if (!user) return;
            const bookmark = myOpps.find(opp => opp.bookmark_id === bookmarkId);
            if (!bookmark) return;

            const removed = await unsaveOpportunity(supabase, user.id, bookmark.id, getToken);
            if (!removed) throw new Error('Unable to remove bookmark');
            setMyOpps(prev => prev.filter(opp => opp.bookmark_id !== bookmarkId));
        } catch (error) {
            console.error('Error removing:', error);
        }
    };

    const filteredOpps = useMemo(() => {
        if (filter === 'urgent') return myOpps.filter(o => o.daysRemaining <= 7 && o.daysRemaining >= 0);
        if (filter === 'upcoming') return myOpps.filter(o => o.daysRemaining > 7);
        return myOpps;
    }, [myOpps, filter]);

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
        return `${days}d left`;
    };

    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
                <ScreenHeader title="My Opportunities" showBack />
                <View style={styles.loadingContainer}>
                    <BrandedLoader label="Loading your opportunities..." />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
            <ScreenHeader title="My Opportunities" showBack subtitle={`${myOpps.length} saved`} />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
            >
                {myOpps.length === 0 ? (
                    <Animated.View entering={FadeInUp} style={styles.emptyState}>
                        <View style={styles.emptyIconContainer}>
                            <Briefcase size={48} color={isDark ? '#64748B' : '#94A3B8'} />
                        </View>
                        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Opportunities Saved</Text>
                        <Text style={[styles.emptyDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                            Browse opportunities and tap Save to add them here
                        </Text>
                        <TouchableOpacity
                            style={[styles.emptyBtn, { backgroundColor: colors.accent }]}
                            onPress={() => router.push('/opportunities')}
                        >
                            <Target size={18} color="#FFFFFF" />
                            <Text style={styles.emptyBtnText}>Browse Opportunities</Text>
                        </TouchableOpacity>
                    </Animated.View>
                ) : (
                    <>
                        {/* Filter Tabs */}
                        <Animated.View entering={FadeInDown} style={styles.filterContainer}>
                            <TouchableOpacity
                                style={[styles.filterTab, { backgroundColor: filter === 'all' ? colors.accent : 'transparent', borderColor: filter === 'all' ? colors.accent : colors.border }]}
                                onPress={() => setFilter('all')}
                            >
                                <Bookmark size={14} color={filter === 'all' ? '#FFFFFF' : colors.foreground} />
                                <Text style={[styles.filterTabText, { color: filter === 'all' ? '#FFFFFF' : colors.foreground }]}>
                                    All ({myOpps.length})
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.filterTab, { backgroundColor: filter === 'urgent' ? '#EF4444' : 'transparent', borderColor: filter === 'urgent' ? '#EF4444' : colors.border }]}
                                onPress={() => setFilter('urgent')}
                            >
                                <AlertCircle size={14} color={filter === 'urgent' ? '#FFFFFF' : '#EF4444'} />
                                <Text style={[styles.filterTabText, { color: filter === 'urgent' ? '#FFFFFF' : '#EF4444' }]}>
                                    Urgent ({myOpps.filter(o => o.daysRemaining <= 7 && o.daysRemaining >= 0).length})
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.filterTab, { backgroundColor: filter === 'upcoming' ? '#10B981' : 'transparent', borderColor: filter === 'upcoming' ? '#10B981' : colors.border }]}
                                onPress={() => setFilter('upcoming')}
                            >
                                <Clock size={14} color={filter === 'upcoming' ? '#FFFFFF' : '#10B981'} />
                                <Text style={[styles.filterTabText, { color: filter === 'upcoming' ? '#FFFFFF' : '#10B981' }]}>
                                    Upcoming ({myOpps.filter(o => o.daysRemaining > 7).length})
                                </Text>
                            </TouchableOpacity>
                        </Animated.View>

                        {/* Summary Card */}
                        <Animated.View entering={FadeInDown.delay(100)} style={{ marginBottom: 20 }}>
                            <LinearGradient
                                colors={[colors.accent, `${colors.accent}BB`]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.summaryCard}
                            >
                                <View style={styles.summaryRow}>
                                    <View style={styles.summaryItem}>
                                        <Calendar size={20} color="#FFFFFF" />
                                        <Text style={styles.summaryValue}>
                                            {myOpps.filter(o => o.daysRemaining > 0 && o.daysRemaining <= 30).length}
                                        </Text>
                                        <Text style={styles.summaryLabel}>Open</Text>
                                    </View>
                                    <View style={styles.summaryDivider} />
                                    <View style={styles.summaryItem}>
                                        <AlertCircle size={20} color="#FFFFFF" />
                                        <Text style={styles.summaryValue}>
                                            {myOpps.filter(o => o.daysRemaining <= 7 && o.daysRemaining >= 0).length}
                                        </Text>
                                        <Text style={styles.summaryLabel}>Urgent</Text>
                                    </View>
                                    <View style={styles.summaryDivider} />
                                    <View style={styles.summaryItem}>
                                        <Sparkles size={20} color="#FFFFFF" />
                                        <Text style={styles.summaryValue}>
                                            {myOpps.reduce((sum, o) => sum + o.match, 0) / (myOpps.length || 1) | 0}%
                                        </Text>
                                        <Text style={styles.summaryLabel}>Avg Match</Text>
                                    </View>
                                </View>
                            </LinearGradient>
                        </Animated.View>

                        {/* Opportunities List */}
                        {filteredOpps.length === 0 ? (
                            <View style={styles.emptyFilterState}>
                                <Sparkles size={32} color={isDark ? '#64748B' : '#94A3B8'} />
                                <Text style={[styles.emptyFilterText, { color: colors.foreground }]}>No {filter} opportunities</Text>
                            </View>
                        ) : (
                            filteredOpps.map((opp, index) => {
                                const gradient = getCategoryGradient(opp.category);
                                return (
                                    <Animated.View key={opp.id} entering={FadeInDown.delay(index * 50)}>
                                        <TouchableOpacity
                                            style={[styles.oppCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                                            onPress={() => router.push(`/opportunities/${opp.id}`)}
                                            activeOpacity={0.7}
                                        >
                                            {/* Category Color Bar */}
                            <LinearGradient
                                colors={[gradient[0], gradient[1]]}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                                style={styles.categoryBar}
                                            />
                                            {opp.image && (
                                                <Image source={{ uri: opp.image }} style={styles.oppImage} resizeMode="cover" />
                                            )}
                                            <View style={styles.oppContent}>
                                                <View style={styles.oppHeader}>
                                                    <View style={styles.oppTitleRow}>
                                                        <Text style={[styles.oppTitle, { color: colors.foreground }]} numberOfLines={2}>{opp.title}</Text>
                                                        {opp.match > 0 && (
                                                            <View style={styles.matchBadge}>
                                                                <Sparkles size={10} color="#FFFFFF" />
                                                                <Text style={styles.matchText}>{opp.match}%</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    <Text style={[styles.oppOrg, { color: isDark ? '#94A3B8' : '#64748B' }]}>{opp.organization}</Text>
                                                </View>

                                                <View style={styles.oppDetails}>
                                                    <View style={styles.detailRow}>
                                                        <Clock size={14} color={getDeadlineColor(opp.daysRemaining)} />
                                                        <Text style={[styles.detailText, { color: getDeadlineColor(opp.daysRemaining) }]}>
                                                            {getDeadlineText(opp.daysRemaining)}
                                                        </Text>
                                                    </View>
                                                    {opp.category && (
                                                        <View style={[styles.categoryBadge, { backgroundColor: `${gradient[0]}15` }]}>
                                                            <Text style={[styles.categoryText, { color: gradient[0] }]}>{opp.category}</Text>
                                                        </View>
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
                                );
                            })
                        )}
                    </>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 12, fontSize: 14 },
    filterContainer: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    filterTab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        gap: 5,
        borderWidth: 1,
    },
    filterTabText: { fontSize: 12, fontWeight: '600' },
    summaryCard: { borderRadius: 20, padding: 20 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
    summaryItem: { alignItems: 'center' },
    summaryValue: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold', marginTop: 8 },
    summaryLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600', marginTop: 2 },
    summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
    oppCard: { borderRadius: 16, marginBottom: 16, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
    categoryBar: { height: 4 },
    oppImage: { width: '100%', height: 120 },
    oppContent: { padding: 16 },
    oppHeader: { marginBottom: 12 },
    oppTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
    oppTitle: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
    matchBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#6366F1', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 },
    matchText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
    oppOrg: { fontSize: 14 },
    oppDetails: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(148, 163, 184, 0.2)' },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    detailText: { fontSize: 13, fontWeight: '600' },
    categoryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    categoryText: { fontSize: 11, fontWeight: '600' },
    oppActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    viewBtnText: { fontSize: 14, fontWeight: '600' },
    removeBtn: { padding: 8 },
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 40 },
    emptyIconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(99, 102, 241, 0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
    emptyDesc: { fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
    emptyBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, gap: 8 },
    emptyBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    emptyFilterState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
    emptyFilterText: { fontSize: 16, fontWeight: '600' },
});
