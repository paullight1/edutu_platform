import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Clock, Bookmark, CheckCircle, ChevronRight, AlertCircle, CalendarClock } from "lucide-react-native";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useTheme } from "../../components/context/ThemeContext";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { BrandedLoader } from "../../components/ui/BrandedLoader";
import { DeadlineItem, fetchOpportunityDeadlines } from "../../packages/core/src/services/deadlines";
import { useTranslation } from "react-i18next";

const DeadlineSection = ({
    title,
    data,
    isDark,
    colors,
    router
}: {
    title: string;
    data: DeadlineItem[];
    isDark: boolean;
    colors: any;
    router: any;
}) => {
    const { t } = useTranslation('home');
    if (data.length === 0) return null;

    return (
        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
                <View style={[styles.sectionBadge, { backgroundColor: colors.accent }]}>
                    <Text style={styles.sectionBadgeText}>{data.length}</Text>
                </View>
            </View>

            {data.map((item) => (
                <TouchableOpacity
                    key={item.id}
                    style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => router.push(`/opportunities/${item.opportunityId}`)}
                    activeOpacity={0.7}
                >
                    <View style={styles.cardHeader}>
                        <View style={styles.cardLeft}>
                            <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                                {item.title}
                            </Text>
                            <Text style={[styles.cardOrg, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                                {item.organization}
                            </Text>
                        </View>
                        <View style={[
                            styles.deadlineBadge,
                            {
                                backgroundColor: item.daysRemaining <= 3
                                    ? 'rgba(239, 68, 68, 0.15)'
                                    : item.daysRemaining <= 7
                                        ? 'rgba(245, 158, 11, 0.15)'
                                        : 'rgba(16, 185, 129, 0.15)'
                            }
                        ]}>
                            <Text style={[
                                styles.deadlineText,
                                {
                                    color: item.daysRemaining <= 3
                                        ? '#EF4444'
                                        : item.daysRemaining <= 7
                                            ? '#F59E0B'
                                            : '#10B981'
                                }
                            ]}>
                                {item.daysRemaining <= 0 ? t('deadlines.pastDue') : t('deadlines.daysLeft', { count: item.daysRemaining })}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.cardFooter}>
                        <View style={styles.typeBadge}>
                            {item.type === 'applied' ? (
                                <>
                                    <CheckCircle size={14} color="#10B981" />
                                    <Text style={styles.typeText}>{t('deadlines.applied')}</Text>
                                </>
                            ) : (
                                <>
                                    <Bookmark size={14} color="#6366F1" />
                                    <Text style={styles.typeText}>{t('deadlines.bookmarked')}</Text>
                                </>
                            )}
                        </View>
                        <ChevronRight size={16} color={isDark ? '#64748B' : '#94A3B8'} />
                    </View>
                </TouchableOpacity>
            ))}
        </View>
    );
};

export default function DeadlinesScreen() {
    const { t } = useTranslation('home');
    const { isDark, colors } = useTheme();
    const router = useRouter();
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();

    const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState(false);

    const fetchDeadlines = useCallback(async () => {
        if (!user) {
            // Clerk finished loading with no user — stop the spinner instead
            // of spinning forever waiting for a fetch that will never start.
            if (isLoaded) {
                setLoading(false);
                setRefreshing(false);
            }
            return;
        }
        try {
            setLoading(true);
            setLoadError(false);
            const result = await Promise.race([
                fetchOpportunityDeadlines(supabase, user.id, getToken),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('deadlines fetch timed out')), 15000),
                ),
            ]);
            setDeadlines(result);
        } catch (error) {
            console.error('Error fetching deadlines:', error);
            setLoadError(true);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [getToken, user, isLoaded]);

    useEffect(() => {
        fetchDeadlines();
    }, [fetchDeadlines]);

    const groupedDeadlines = useMemo(() => {
        const now = Date.now();
        const week = 7 * 24 * 60 * 60 * 1000;
        const twoWeeks = 14 * 24 * 60 * 60 * 1000;
        const month = 30 * 24 * 60 * 60 * 1000;

        const groups = {
            thisWeek: [] as DeadlineItem[],
            nextWeek: [] as DeadlineItem[],
            thisMonth: [] as DeadlineItem[],
            later: [] as DeadlineItem[],
        };

        deadlines.forEach((item) => {
            const deadlineTime = new Date(item.deadline).getTime();
            const diff = deadlineTime - now;

            if (diff <= week) {
                groups.thisWeek.push(item);
            } else if (diff <= twoWeeks) {
                groups.nextWeek.push(item);
            } else if (diff <= month) {
                groups.thisMonth.push(item);
            } else {
                groups.later.push(item);
            }
        });

        return groups;
    }, [deadlines]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchDeadlines();
    }, [fetchDeadlines]);

    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
                <ScreenHeader title={t('deadlines.title')} showBack />
                <View style={styles.loadingContainer}>
                    <BrandedLoader label={t('deadlines.loading')} />
                </View>
            </SafeAreaView>
        );
    }

    const totalDeadlines = deadlines.length;
    const urgentCount = groupedDeadlines.thisWeek.length + groupedDeadlines.nextWeek.length;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={t('deadlines.title')}
                showBack
                subtitle={t('deadlines.subtitle', { total: totalDeadlines, urgent: urgentCount })}
            />

            <FlatList
                data={[]}
                renderItem={() => null}
                ListHeaderComponent={
                    <>
                        {loadError && totalDeadlines === 0 ? (
                            <View style={styles.errorState}>
                                <AlertCircle size={40} color="#F59E0B" />
                                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                                    {t('deadlines.errorTitle', { defaultValue: "Couldn't load deadlines" })}
                                </Text>
                                <Text style={[styles.emptyDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                                    {t('deadlines.errorDescription', { defaultValue: 'Check your connection and try again.' })}
                                </Text>
                                <TouchableOpacity
                                    style={[styles.emptyBtn, { backgroundColor: colors.accent }]}
                                    onPress={() => void fetchDeadlines()}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.emptyBtnText}>
                                        {t('deadlines.retry', { defaultValue: 'Retry' })}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ) : totalDeadlines === 0 ? (
                            <View style={styles.emptyState}>
                                <View
                                    style={[
                                        styles.emptyIconWrap,
                                        { backgroundColor: isDark ? 'rgba(16,185,129,0.14)' : 'rgba(16,185,129,0.10)' },
                                    ]}
                                >
                                    <CalendarClock size={40} color="#10B981" />
                                </View>
                                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                                    {t('deadlines.emptyTitle')}
                                </Text>
                                <Text style={[styles.emptyDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                                    {t('deadlines.emptyDescription')}
                                </Text>
                                <TouchableOpacity
                                    style={[styles.emptyBtn, { backgroundColor: colors.accent }]}
                                    onPress={() => router.push('/opportunities')}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.emptyBtnText}>
                                        {t('deadlines.browseOpportunities')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <>
                                <DeadlineSection
                                    title={t('deadlines.thisWeek')}
                                    data={groupedDeadlines.thisWeek}
                                    isDark={isDark}
                                    colors={colors}
                                    router={router}
                                />
                                <DeadlineSection
                                    title={t('deadlines.nextWeek')}
                                    data={groupedDeadlines.nextWeek}
                                    isDark={isDark}
                                    colors={colors}
                                    router={router}
                                />
                                <DeadlineSection
                                    title={t('deadlines.thisMonth')}
                                    data={groupedDeadlines.thisMonth}
                                    isDark={isDark}
                                    colors={colors}
                                    router={router}
                                />
                                <DeadlineSection
                                    title={t('deadlines.later')}
                                    data={groupedDeadlines.later}
                                    isDark={isDark}
                                    colors={colors}
                                    router={router}
                                />
                            </>
                        )}
                    </>
                }
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.accent}
                    />
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    listContent: {
        paddingBottom: 100,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
    },
    section: {
        marginBottom: 24,
        paddingHorizontal: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    sectionBadge: {
        marginLeft: 8,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
    },
    sectionBadgeText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    card: {
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        marginBottom: 12,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    cardLeft: {
        flex: 1,
        marginRight: 12,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '600',
        lineHeight: 20,
    },
    cardOrg: {
        fontSize: 13,
        marginTop: 4,
    },
    deadlineBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    deadlineText: {
        fontSize: 12,
        fontWeight: '700',
    },
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 12,
        borderTopWidth: 1,
    },
    typeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    typeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
    },
    errorState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
        paddingHorizontal: 40,
        gap: 4,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
        paddingHorizontal: 40,
    },
    emptyIconWrap: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 20,
        marginBottom: 8,
    },
    emptyDesc: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    emptyBtn: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
    },
    emptyBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
});
