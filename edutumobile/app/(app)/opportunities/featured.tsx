import { View, Text, FlatList, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { Star } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../components/context/ThemeContext";
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { OpportunityCard } from "../../../components/home/OpportunityCard";
import { ShimmerCard } from "../../../components/ui/Shimmer";
import { supabase } from "../../../lib/supabase";
import {
    fetchFeaturedOpportunities,
    getCachedFeaturedOpportunities,
} from "@edutu/core/src/services/opportunities";
import { Opportunity } from "@edutu/core/src/types/opportunity";
import { toSafeUUID } from "@edutu/core/src/utils/auth";
import { recordOpportunitySignal } from "@edutu/core/src/services/opportunitySignals";
import { shareOpportunity } from "../../../lib/shareOpportunity";

function getUserLookupIds(userId: string): string[] {
    return Array.from(new Set([userId, toSafeUUID(userId)]));
}

export default function FeaturedOpportunitiesScreen() {
    const { t } = useTranslation('home');
    const { isDark, colors } = useTheme();
    const { user } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';

    // Same source as the home rail: the featured endpoint, not a filter over
    // the personalized feed (which hid spotlights outside a user's ranked
    // candidate window).
    const [featured, setFeatured] = useState<Opportunity[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        setLoading(true);
        return fetchFeaturedOpportunities(50)
            .then(setFeatured)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        let isActive = true;
        void getCachedFeaturedOpportunities().then((cached) => {
            if (isActive && cached.length > 0) setFeatured(cached);
        });
        void fetchFeaturedOpportunities(50).then((rows) => {
            if (!isActive) return;
            setFeatured(rows);
            setLoading(false);
        });
        return () => {
            isActive = false;
        };
    }, []);

    const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);

    useEffect(() => {
        const fetchBookmarks = async () => {
            if (!user) return;
            try {
                const { data: bookmarks } = await supabase
                    .from('bookmarks')
                    .select('opportunity_id')
                    .in('user_id', getUserLookupIds(user.id));
                setBookmarkedIds(Array.from(new Set(bookmarks?.map(b => b.opportunity_id) || [])));
            } catch (err) {
                console.error('Bookmarks fetch failed', err);
            }
        };
        fetchBookmarks();
    }, [user]);

    const toggleBookmark = useCallback(async (opportunityId: string) => {
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
                setBookmarkedIds(prev => prev.filter(id => id !== opportunityId));
            } else {
                await supabase
                    .from('bookmarks')
                    .insert({ user_id: lookupIds[0], opportunity_id: opportunityId });
                setBookmarkedIds(prev => [...prev, opportunityId]);
            }
            void recordOpportunitySignal({
                opportunityId,
                signalType: 'save',
                signalValue: isBookmarked ? -1 : 1,
                source: 'mobile_featured',
                context: isBookmarked ? 'featured_unsave' : 'featured_save',
            }, getToken);
        } catch (err) {
            console.error('Bookmark toggle failed', err);
        }
    }, [user, bookmarkedIds, getToken]);

    const handleShare = useCallback((item: Opportunity) => {
        void recordOpportunitySignal({
            opportunityId: item.id,
            signalType: 'share',
            signalValue: 2,
            source: 'mobile_featured',
            context: 'featured_share',
        }, getToken);
        void shareOpportunity(item);
    }, [getToken]);

    const handleOpen = useCallback((id: string) => {
        void recordOpportunitySignal({
            opportunityId: id,
            signalType: 'click',
            signalValue: 1,
            source: 'mobile_featured',
            context: 'featured_open',
        }, getToken);
        router.push(`/opportunities/${id}`);
    }, [getToken, router]);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={t('home.featuredOpportunities', { defaultValue: 'Featured Opportunities' })}
                showBack
            />
            <FlatList
                data={featured}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#6366F1" colors={["#6366F1"]} />
                }
                renderItem={({ item, index }) => (
                    <OpportunityCard
                        item={item}
                        isDark={isDark}
                        textPrimary={textPrimary}
                        textSecondary={textSecondary}
                        accent={colors.accent || '#6366F1'}
                        border={colors.border}
                        index={index}
                        bookmarked={bookmarkedIds.includes(item.id)}
                        onPress={handleOpen}
                        onBookmark={toggleBookmark}
                        onShare={handleShare}
                        showMatchBadge
                    />
                )}
                ListEmptyComponent={
                    loading ? (
                        <View>
                            <ShimmerCard isDark={isDark} />
                            <ShimmerCard isDark={isDark} style={{ marginTop: 12 }} />
                            <ShimmerCard isDark={isDark} style={{ marginTop: 12 }} />
                        </View>
                    ) : (
                        <View style={styles.emptyState}>
                            <View style={styles.emptyIcon}>
                                <Star size={32} color="#6366F1" fill="#6366F1" />
                            </View>
                            <Text style={[styles.emptyTitle, { color: textPrimary }]}>
                                {t('featured.emptyTitle', { defaultValue: 'No featured opportunities yet' })}
                            </Text>
                            <Text style={[styles.emptyDesc, { color: textSecondary }]}>
                                {t('featured.emptyDescription', { defaultValue: 'Check back soon — hand-picked opportunities land here.' })}
                            </Text>
                        </View>
                    )
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    listContent: {
        padding: 20,
        paddingBottom: 120,
    },
    emptyState: {
        alignItems: 'center',
        paddingTop: 64,
        paddingHorizontal: 24,
    },
    emptyIcon: {
        width: 64,
        height: 64,
        borderRadius: 20,
        backgroundColor: 'rgba(99,102,241,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 6,
        textAlign: 'center',
    },
    emptyDesc: {
        fontSize: 13,
        lineHeight: 19,
        textAlign: 'center',
    },
});
