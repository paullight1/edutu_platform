import { View, Text, ScrollView, StyleSheet, Dimensions, Image, RefreshControl, TouchableOpacity } from "react-native";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { SvgXml } from "react-native-svg";
import {
    Sparkles,
    ChevronRight,
    Target,
    FileText,
    Store,
    BookmarkPlus,
} from "lucide-react-native";
import { useTheme } from "../../components/context/ThemeContext";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { supabase } from "../../lib/supabase";
import { useOpportunities } from "@edutu/core/src/hooks/useOpportunities";
import { Opportunity } from "@edutu/core/src/types/opportunity";
import { toSafeUUID } from "@edutu/core/src/utils/auth";
import { recordOpportunitySignal } from "@edutu/core/src/services/opportunitySignals";
import { AnimatedPressable } from "../../components/ui/AnimatedPressable";
import { ShimmerCard } from "../../components/ui/Shimmer";
import { syncAndUpdateOpportunityWidgetSnapshot } from "../../lib/opportunityWidgetSync";
import { getDiscoveryCategoryIconSource, getDiscoveryCategoryIconXml, type DiscoveryCategoryIcon } from "../../lib/discoveryCategoryIcons";

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_WIDTH = (width - 40 - CARD_GAP) / 2;

const DISCOVERY_BACKGROUNDS = {
    scholarships: require("../../assets/discovery/scholarships.png"),
    internships: require("../../assets/discovery/internships.png"),
    grants: require("../../assets/discovery/grants.png"),
    fellowships: require("../../assets/discovery/fellowships.png"),
} as const;

// ─── Quick Actions Grid Component ─────────────────────────────────────────────
const QUICK_ACTIONS = [
    { id: '2', title: 'Roadmaps', icon: Store, route: '/roadmaps', gradient: ['#F59E0B', '#EF4444'] as [string, string] },
    { id: '3', title: 'Goals', icon: Target, route: '/goals', gradient: ['#10B981', '#059669'] as [string, string] },
    { id: '4', title: 'CV Builder', icon: FileText, route: '/cv', gradient: ['#3B82F6', '#6366F1'] as [string, string] },
    { id: '5', title: 'Saved', icon: BookmarkPlus, route: '/saved', gradient: ['#EC4899', '#F43F5E'] as [string, string] },
];

const DISCOVERY_CATEGORIES = [
    {
        id: 'scholarships',
        title: 'Scholarships',
        icon: 'scholarship',
        colors: ['rgba(239,68,35,0.94)', 'rgba(153,27,27,0.82)'] as [string, string],
        accent: '#EF4423',
        image: DISCOVERY_BACKGROUNDS.scholarships,
    },
    {
        id: 'internships',
        title: 'Internships',
        icon: 'career',
        colors: ['rgba(37,99,235,0.92)', 'rgba(30,64,175,0.82)'] as [string, string],
        accent: '#2563EB',
        image: DISCOVERY_BACKGROUNDS.internships,
    },
    {
        id: 'grants',
        title: 'Programs',
        icon: 'grant',
        colors: ['rgba(16,185,129,0.92)', 'rgba(4,120,87,0.82)'] as [string, string],
        accent: '#10B981',
        image: DISCOVERY_BACKGROUNDS.grants,
    },
    {
        id: 'fellowships',
        title: 'Fellowships',
        icon: 'leadership',
        colors: ['rgba(249,115,22,0.94)', 'rgba(194,65,12,0.82)'] as [string, string],
        accent: '#F97316',
        image: DISCOVERY_BACKGROUNDS.fellowships,
    },
] satisfies Array<{
    id: string;
    title: string;
    icon: DiscoveryCategoryIcon;
    colors: [string, string];
    accent: string;
    image: number;
}>;

function getUserLookupIds(userId: string): string[] {
    return Array.from(new Set([userId, toSafeUUID(userId)]));
}

function DiscoverySvgIcon({ type }: { type: DiscoveryCategoryIcon }) {
    const xml = getDiscoveryCategoryIconXml(type);

    if (xml) {
        return <SvgXml xml={xml} width={40} height={40} />;
    }

    return (
        <Image
            source={getDiscoveryCategoryIconSource(type)}
            style={{ width: 40, height: 40 }}
            resizeMode="contain"
        />
    );
}

function DiscoveryCategoryGrid({ router }: { router: any }) {
    return (
        <View style={styles.discoveryGrid}>
            {DISCOVERY_CATEGORIES.map((item, index) => (
                <AnimatedPressable
                    key={item.id}
                    onPress={() => router.push({ pathname: '/opportunities', params: { category: item.id } })}
                    style={styles.discoveryCard}
                    entering={FadeInDown.delay(index * 70).duration(360).springify()}
                    hapticFeedback="medium"
                    scaleTo={0.96}
                >
                    <Image source={item.image} style={styles.discoveryImage} resizeMode="cover" />
                    <View style={styles.discoveryContent}>
                        <View style={styles.discoveryIcon}>
                            <DiscoverySvgIcon type={item.icon} />
                        </View>
                        <Text style={styles.discoveryTitle} numberOfLines={2}>
                            {item.title}
                        </Text>
                    </View>
                </AnimatedPressable>
            ))}
        </View>
    );
}

function QuickActionsGrid({ router }: { router: any }) {
    return (
        <View style={styles.quickActionsContainer}>
            {QUICK_ACTIONS.map((item, index) => (
                <AnimatedPressable
                    key={item.id}
                    onPress={() => router.push(item.route)}
                    style={styles.quickActionCard}
                    entering={FadeInUp.delay(100 + index * 80).duration(400).springify()}
                    hapticFeedback="medium"
                    scaleTo={0.92}
                >
                    <LinearGradient
                        colors={item.gradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.quickActionGradient}
                    >
                        <item.icon size={28} color="#FFFFFF" strokeWidth={1.5} />
                    </LinearGradient>
                    <Text style={styles.quickActionTitle}>{item.title}</Text>
                </AnimatedPressable>
            ))}
        </View>
    );
}

// ─── Opportunity Card Component ─────────────────────────────────────────────
function OpportunityCard({ item, isDark, textPrimary, textSecondary, onPress, onBookmark, bookmarked = false, index = 0 }: {
    item: Opportunity;
    isDark: boolean;
    textPrimary: string;
    textSecondary: string;
    onPress?: () => void;
    onBookmark?: () => void;
    bookmarked?: boolean;
    index?: number;
}) {
    const deadlineText = useMemo(() => {
        if (!item.deadline) return 'Rolling';
        const now = new Date();
        const end = new Date(item.deadline);
        const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return 'Ended';
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Tomorrow';
        return `${diffDays} days left`;
    }, [item.deadline]);

    const deadlineColor = useMemo(() => {
        if (!item.deadline) return isDark ? '#94A3B8' : '#64748B';
        const now = new Date();
        const end = new Date(item.deadline);
        const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) return '#EF4444';
        if (diffDays <= 7) return '#F59E0B';
        return '#10B981';
    }, [item.deadline]);

    return (
        <AnimatedPressable
            onPress={onPress}
            style={[styles.opportunityCard, {
                backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF",
            }]}
            entering={FadeInDown.delay(index * 60).duration(350).springify()}
        >
            {item.image && (
                <Image
                    source={{ uri: item.image }}
                    style={styles.oppCardImage}
                    resizeMode="cover"
                />
            )}
            <View style={styles.oppCardContent}>
                <View style={styles.oppCardTop}>
                    <View style={[styles.oppOrgBadge, { backgroundColor: isDark ? "rgba(99,102,241,0.15)" : "#F0F0FF" }]}>
                        <Text style={styles.oppOrgText}>{item.organization}</Text>
                    </View>
                    {onBookmark && (
                        <TouchableOpacity
                            onPress={(e) => {
                                e.stopPropagation();
                                onBookmark();
                            }}
                            style={styles.bookmarkBtn}
                        >
                            <BookmarkPlus size={16} color={bookmarked ? '#6366F1' : textSecondary} fill={bookmarked ? '#6366F1' : 'transparent'} />
                        </TouchableOpacity>
                    )}
                </View>
                <Text style={[styles.oppTitle, { color: textPrimary }]} numberOfLines={2}>{item.title}</Text>
                <View style={[styles.oppFooter, { borderTopColor: isDark ? "rgba(255,255,255,0.05)" : "#F1F5F9" }]}>
                    <View style={styles.deadlineRow}>
                        <View style={[styles.deadlineDot, { backgroundColor: deadlineColor }]} />
                        <Text style={[styles.oppDeadline, { color: deadlineColor }]}>
                            {deadlineText}
                        </Text>
                    </View>
                    <View style={styles.oppArrowBtn}>
                        <ChevronRight size={14} color="#FFFFFF" />
                    </View>
                </View>
            </View>
        </AnimatedPressable>
    );
}

// ─── Opportunity Section Component ───────────────────────────────────────────
function OpportunitySection({
    title,
    data,
    isDark,
    showViewMore = true,
    onViewMorePress,
    icon,
    textPrimary,
    textSecondary,
    grid = false,
    bookmarkedIds = [],
    onBookmark,
    router,
    onOpenOpportunity,
}: {
    title: string;
    data: Opportunity[];
    isDark: boolean;
    showViewMore?: boolean;
    onViewMorePress?: () => void;
    icon?: React.ReactNode;
    textPrimary: string;
    textSecondary: string;
    grid?: boolean;
    bookmarkedIds?: string[];
    onBookmark?: (id: string) => void;
    router?: any;
    onOpenOpportunity?: (id: string) => void;
}) {
    const displayData = grid ? data.slice(0, 8) : data;
    return (
        <Animated.View entering={FadeInDown.duration(400).delay(100)}>
            <View style={styles.sectionHeader}>
                {icon && <View style={[styles.sectionIcon, { backgroundColor: isDark ? "rgba(99,102,241,0.15)" : "#F0F0FF" }]}>{icon}</View>}
                <Text style={[styles.sectionTitle, { color: textPrimary }]}>{title}</Text>
                {showViewMore && (
                    <AnimatedPressable onPress={onViewMorePress} style={styles.viewMoreBtn}>
                        <Text style={styles.viewMoreText}>View More</Text>
                        <ChevronRight size={13} color="#6366F1" />
                    </AnimatedPressable>
                )}
            </View>
            <View style={grid ? styles.oppGridContainer : styles.oppListContainer}>
                {displayData.map((item, idx) => (
                    <View
                        key={item.id}
                        style={grid ? styles.oppGridItem : null}
                    >
                        <OpportunityCard
                            item={item}
                            isDark={isDark}
                            textPrimary={textPrimary}
                            textSecondary={textSecondary}
                            onPress={() => {
                                onOpenOpportunity?.(item.id);
                                router?.push(`/opportunities/${item.id}`);
                            }}
                            onBookmark={onBookmark ? () => onBookmark(item.id) : undefined}
                            bookmarked={bookmarkedIds.includes(item.id)}
                            index={idx}
                        />
                    </View>
                ))}
            </View>
        </Animated.View>
    );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
    const { isDark, colors } = useTheme();
    const { user } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const backgroundColor = colors.background;
    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';

    const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);

    useEffect(() => {
        const fetchBookmarks = async () => {
            if (!user) return;
            try {
                const lookupIds = getUserLookupIds(user.id);
                const { data: bookmarks } = await supabase
                    .from('bookmarks')
                    .select('opportunity_id')
                    .in('user_id', lookupIds);

                const uniqueBookmarkIds = Array.from(new Set(bookmarks?.map(b => b.opportunity_id) || []));
                setBookmarkedIds(uniqueBookmarkIds);
            } catch (err) {
                console.error("Bookmarks fetch failed", err);
            }
        };
        fetchBookmarks();
    }, [user]);

    const syncOpportunityWidget = useCallback(async (freshOpportunities: Opportunity[]) => {
        await syncAndUpdateOpportunityWidgetSnapshot({
            userId: user?.id,
            opportunities: freshOpportunities,
        });
    }, [user?.id]);

    // Fetch real opportunities from API (already filtered by backend/core logic)
    const { data: opportunities, loading: opportunitiesLoading, refresh } = useOpportunities({
        supabase,
        userId: user?.id,
        getAuthToken: getToken,
        onSyncSnapshot: syncOpportunityWidget,
    });

    // Featured: Show top of the list, max 5
    const featuredOpportunities = useMemo(() => {
        return opportunities.filter(o => o.featured).slice(0, 5);
    }, [opportunities]);

    // Other Recommended: max 10
    const otherOpportunities = useMemo(() => {
        return opportunities.slice(0, 10);
    }, [opportunities]);

    const toggleBookmark = async (opportunityId: string) => {
        if (!user) return;
        try {
            const lookupIds = getUserLookupIds(user.id);
            const isBookmarked = bookmarkedIds.includes(opportunityId);

            if (isBookmarked) {
                await supabase
                    .from('bookmarks')
                    .delete()
                    .in('user_id', lookupIds)
                    .eq('opportunity_id', opportunityId);
                void recordOpportunitySignal({
                    opportunityId,
                    signalType: 'save',
                    signalValue: -1,
                    source: 'mobile_home',
                    context: 'home_card_unsave',
                }, getToken);
                setBookmarkedIds(prev => prev.filter(id => id !== opportunityId));
            } else {
                await supabase
                    .from('bookmarks')
                    .delete()
                    .in('user_id', lookupIds)
                    .eq('opportunity_id', opportunityId);

                await supabase
                    .from('bookmarks')
                    .insert({ user_id: user.id, opportunity_id: opportunityId });
                void recordOpportunitySignal({
                    opportunityId,
                    signalType: 'save',
                    signalValue: 3,
                    source: 'mobile_home',
                    context: 'home_card_save',
                }, getToken);
                setBookmarkedIds(prev => [...prev, opportunityId]);
            }
        } catch (error) {
            console.error('Error toggling bookmark:', error);
        }
    };

    const recordOpportunityOpen = useCallback((opportunityId: string) => {
        void recordOpportunitySignal({
            opportunityId,
            signalType: 'view',
            signalValue: 1,
            source: 'mobile_home',
            context: 'home_card_open',
        }, getToken);
    }, [getToken]);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor }} edges={['left', 'right']}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={opportunitiesLoading}
                        onRefresh={refresh}
                        tintColor="#6366F1"
                        colors={['#6366F1']}
                    />
                }
            >
                {/* Header Spacer - accounts for AppHeader height + safe area */}
                <View style={{ height: insets.top + 60 }} />

                <Animated.View entering={FadeInDown.duration(400).delay(50)}>
                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: textPrimary }]}>Explore opportunities</Text>
                    </View>
                    <DiscoveryCategoryGrid router={router} />
                </Animated.View>

                {/* Featured Opportunities Section - Admin Controlled (5 items) */}
                {featuredOpportunities.length > 0 && (
                    <Animated.View entering={FadeInDown.duration(400).delay(50)} style={styles.sectionSpacing}>
                        <OpportunitySection
                            title="Featured Opportunities"
                            data={featuredOpportunities}
                            isDark={isDark}
                            showViewMore={true}
                            onViewMorePress={() => router.push('/opportunities')}
                            icon={<Sparkles size={20} color={colors.accent} />}
                            textPrimary={textPrimary}
                            textSecondary={textSecondary}
                            bookmarkedIds={bookmarkedIds}
                            onBookmark={toggleBookmark}
                            onOpenOpportunity={recordOpportunityOpen}
                            router={router}
                        />
                    </Animated.View>
                )}

                {/* Quick Actions Grid */}
                <Animated.View entering={FadeInDown.duration(400).delay(150)} style={{ marginTop: 4 }}>
                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: textPrimary }]}>Quick Actions</Text>
                    </View>
                    <QuickActionsGrid router={router} />
                </Animated.View>

                {/* Other Opportunities Section (10 items) - Personalized */}
                {otherOpportunities.length > 0 ? (
                    <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.sectionSpacing}>
                        <OpportunitySection
                            title="Recommended Opportunities"
                            data={otherOpportunities}
                            isDark={isDark}
                            showViewMore={true}
                            onViewMorePress={() => router.push('/opportunities')}
                            textPrimary={textPrimary}
                            textSecondary={textSecondary}
                            grid
                            bookmarkedIds={bookmarkedIds}
                            onBookmark={toggleBookmark}
                            onOpenOpportunity={recordOpportunityOpen}
                            router={router}
                        />
                    </Animated.View>
                ) : opportunitiesLoading ? (
                    <View style={styles.sectionSpacing}>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Recommended Opportunities</Text>
                        </View>
                        <ShimmerCard isDark={isDark} />
                        <ShimmerCard isDark={isDark} style={{ marginTop: 12 }} />
                    </View>
                ) : (
                    <View style={styles.sectionSpacing}>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Recommended Opportunities</Text>
                        </View>
                    </View>
                )}

                {/* Empty State for No Recommendations */}
                {otherOpportunities.length === 0 && !opportunitiesLoading && (
                    <Animated.View entering={FadeInUp.duration(400).delay(200)} style={[styles.emptyStateCard, { backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF" }]}>
                        <View style={styles.emptyStateIcon}>
                            <Target size={32} color="#6366F1" />
                        </View>
                        <Text style={[styles.emptyStateTitle, { color: textPrimary }]}>
                            No Recommendations Yet
                        </Text>
                        <Text style={[styles.emptyStateDesc, { color: textSecondary }]}>
                            Explore opportunities and save the ones you want to track.
                        </Text>
                        <AnimatedPressable
                            style={styles.emptyStateBtn}
                            onPress={() => router.push('/opportunities')}
                            hapticFeedback="medium"
                        >
                            <Text style={styles.emptyStateBtnText}>Explore Opportunities</Text>
                        </AnimatedPressable>
                    </Animated.View>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        borderWidth: 1,
    },
    filterChipText: {
        fontSize: 13,
        fontWeight: '600',
    },
    greetingBlock: {
        marginTop: 24,
        marginBottom: 32,
    },
    profileStatusBar: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 16,
        gap: 8,
    },
    profileStatusBarText: {
        flex: 1,
    },
    profileStatusText: {
        flex: 1,
        fontSize: 12,
        fontWeight: '600',
    },
    profileBannerWrapper: {
        marginBottom: 18,
    },
    statusBarCloseBtn: {
        padding: 4,
    },
    sectionSpacing: {
        marginTop: 22,
    },
    discoveryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: CARD_GAP,
        marginBottom: 16,
    },
    discoveryCard: {
        width: CARD_WIDTH,
        minHeight: 88,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#0F172A',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
    },
    discoveryImage: {
        ...StyleSheet.absoluteFillObject,
        width: '100%',
        height: '100%',
    },
    discoveryContent: {
        minHeight: 88,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    discoveryIcon: {
        width: 46,
        height: 46,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    discoveryTitle: {
        flex: 1,
        minWidth: 0,
        color: '#FFFFFF',
        fontSize: 13,
        lineHeight: 16,
        fontWeight: '900',
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
        width: '100%',
    },
    sectionIcon: {
        width: 28,
        height: 28,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitle: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
        minWidth: 0,
    },
    // ─── Banner Styles ─────────────────────────────────────────────────────
    bannerContainer: {
        height: 160,
    },
    bannerCard: {
        width: width - 40,
        height: 140,
        borderRadius: 20,
        overflow: 'hidden',
        marginRight: 12,
    },
    bannerGradient: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 24,
    },
    bannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    bannerIconContainer: {
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    bannerTextContainer: {
        justifyContent: 'center',
    },
    bannerTitle: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    bannerSubtitle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        fontWeight: '500',
    },
    bannerArrow: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bannerPagination: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 12,
        gap: 6,
    },
    paginationDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(99,102,241,0.3)',
    },
    paginationDotActive: {
        backgroundColor: '#6366F1',
        width: 20,
    },
    // ─── Quick Actions Grid Styles ──────────────────────────────────────────
    quickActionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 8,
    },
    quickActionCard: {
        width: (width - 40 - 48) / 5,
        alignItems: 'center',
    },
    quickActionGradient: {
        width: 64,
        height: 64,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    quickActionTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
        textAlign: 'center',
    },
    // ─── Opportunity Card Styles ───────────────────────────────────────────
    opportunityCard: {
        borderRadius: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(99,102,241,0.1)',
        overflow: 'hidden',
    },
    oppCardImage: {
        width: '100%',
        height: 92,
    },
    oppCardContent: {
        padding: 11,
    },
    oppCardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 7,
    },
    bookmarkBtn: {
        padding: 4,
    },
    oppOrgBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 8,
        marginBottom: 7,
    },
    oppOrgText: {
        fontSize: 9,
        fontWeight: '600',
        color: '#6366F1',
    },
    oppTitle: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '600',
        marginBottom: 8,
    },
    oppFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 8,
        borderTopWidth: 1,
    },
    deadlineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    deadlineDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    oppDeadline: {
        fontSize: 10,
        fontWeight: '500',
    },
    oppArrowBtn: {
        backgroundColor: '#6366F1',
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    oppListContainer: {
        gap: 12,
    },
    oppGridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 10,
    },
    oppGridItem: {
        width: CARD_WIDTH,
    },
    viewMoreBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 'auto',
        flexShrink: 0,
        minWidth: 124,
        paddingHorizontal: 12,
        paddingVertical: 2,
        gap: 4,
    },
    viewMoreText: {
        color: '#6366F1',
        fontSize: 11,
        fontWeight: '600',
        lineHeight: 14,
        flexShrink: 0,
        includeFontPadding: false,
    },
    // Empty State Styles
    emptyStateCard: {
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(99,102,241,0.1)',
        marginTop: 16,
    },
    emptyStateIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(99,102,241,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    emptyStateTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    emptyStateDesc: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 20,
    },
    emptyStateBtn: {
        backgroundColor: '#6366F1',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
    },
    emptyStateBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: 'bold',
    },
    // Notification Styles
    notificationList: {
        gap: 12,
        marginTop: 16,
    },
    notificationCard: {
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(99,102,241,0.2)',
    },
    matchBadge: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#6366F1',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        gap: 4,
        marginBottom: 8,
    },
    matchBadgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: 'bold',
    },
    notificationTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    notificationDesc: {
        fontSize: 13,
        lineHeight: 18,
    },
});
