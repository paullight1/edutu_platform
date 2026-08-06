import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    RefreshControl,
    StyleSheet,
    Dimensions,
    Modal,
    Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Target,
    Search,
    Filter,
    Award,
    Map,
    CheckCircle2,
    Clock,
    X,
    TrendingUp,
    Volume2,
    Briefcase,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../components/context/ThemeContext';
import { StateView } from '../../../components/state';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { supabase } from '../../../lib/supabase';
import { useGoals } from '@edutu/core/src/hooks/useGoals';
import { useCreditRewards } from '@edutu/core/src/hooks/useCreditRewards';
import { useToast } from '../../../components/context/ToastContext';
import { toSafeUUID } from '@edutu/core/src/utils/auth';
import {
    GoalCard,
    GoalCalendar,
    useFilteredGoals,
} from '../../../components/goals';
import type { GoalStatusFilter } from '../../../components/goals';
import type { Goal } from '@edutu/core/src/hooks/useGoals';
import { AdBanner, BannerConfig } from '../../../components/ui/AdBanner';
import { LinearGradient } from 'expo-linear-gradient';
import { haptics } from '../../../lib/haptics';

const { width } = Dimensions.get('window');
const CARD_GAP = 10;
const GRID_ITEM_WIDTH = (width - 44) / 2;

// ─── Slim Stat Card ──────────────────────────────────────────────────────────
// `unit` exists because "Completion 33" next to "Active 1" reads as a count of
// 33 goals. A rate needs its symbol attached to the number.
function SlimStatCard({
    title,
    value,
    unit,
    color,
    icon: Icon,
    onPress,
    selected = false,
}: {
    title: string;
    value: number;
    unit?: string;
    color: string;
    icon: any;
    onPress?: () => void;
    selected?: boolean;
}) {
    const { isDark } = useTheme();
    return (
        <TouchableOpacity
            onPress={onPress}
            // Only the filter cards are pressable; the read-outs must not fake
            // an affordance they don't have.
            disabled={!onPress}
            activeOpacity={onPress ? 0.85 : 1}
            accessibilityRole={onPress ? 'button' : 'text'}
            accessibilityState={onPress ? { selected } : undefined}
            accessibilityLabel={`${value}${unit ?? ''} ${title}`}
            style={[
                styles.slimStatCard,
                { backgroundColor: `${color}12`, borderColor: selected ? color : `${color}25` },
                selected && styles.slimStatCardSelected,
            ]}
        >
            <View style={[styles.statIconCircle, { backgroundColor: `${color}20` }]}>
                <Icon size={18} color={color} />
            </View>
            <View style={styles.statInfo}>
                <Text style={[styles.statVal, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                    {value}{unit}
                </Text>
                <Text style={[styles.statLab, { color: isDark ? '#94a3b8' : '#64748b' }]} numberOfLines={1}>{title}</Text>
            </View>
        </TouchableOpacity>
    );
}

// ─── Empty Section Placeholder ───────────────────────────────────────────────
// ─── My Opportunities Card ───────────────────────────────────────────────────
function MyOpportunitiesCard({ count, urgentCount }: { count: number; urgentCount: number }) {
    const router = useRouter();
    const { t } = useTranslation('goals');

    return (
        <TouchableOpacity
            onPress={() => router.push('/my-opportunities')}
            activeOpacity={0.85}
        >
            <LinearGradient
                colors={['#6366F1', '#3b82f6', '#3b82f6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.myOppsCard}
            >
                <View style={styles.myOppsContent}>
                    <View style={styles.myOppsIconWrap}>
                        <Briefcase size={24} color="#FFFFFF" />
                    </View>
                    <View style={styles.myOppsInfo}>
                        <Text style={styles.myOppsTitle}>{t('dashboard.myOpportunities')}</Text>
                        <Text style={styles.myOppsSubtitle}>
                            {urgentCount > 0 ? t('dashboard.savedSummaryWithUrgent', { count, urgent: urgentCount }) : t('dashboard.savedSummary', { count })}
                        </Text>
                    </View>
                    <View style={styles.myOppsArrow}>
                        <Text style={styles.myOppsArrowText}>{t('viewAll')}</Text>
                    </View>
                </View>
                <View style={styles.myOppsBgPattern}>
                    <View style={[styles.myOppsCircle, { top: -20, right: -20 }]} />
                    <View style={[styles.myOppsCircle, { bottom: -30, left: 40, width: 60, height: 60 }]} />
                </View>
            </LinearGradient>
        </TouchableOpacity>
    );
}

// ─── Upcoming Deadlines Strip ────────────────────────────────────────────────
function UpcomingStrip({ goals }: { goals: Goal[] }) {
    const { isDark } = useTheme();
    const router = useRouter();
    const { t } = useTranslation('goals');

    const upcoming = useMemo(() => {
        const now = new Date();
        const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        return goals
            .filter(g => g.status === 'active' && g.deadline)
            .filter(g => new Date(g.deadline!) <= threeDays)
            .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
            .slice(0, 5);
    }, [goals]);

    // Snapshot the clock once — day-granularity math doesn't need a live clock,
    // and Date.now() during render is impure.
    const [nowTs] = useState(() => Date.now());

    if (upcoming.length === 0) return null;

    const getDaysUntil = (deadline: string) => {
        return Math.ceil((new Date(deadline).getTime() - nowTs) / (1000 * 60 * 60 * 24));
    };

    return (
        <View style={styles.upcomingSection}>
            <View style={styles.upcomingHeader}>
                <View style={styles.upcomingTitleRow}>
                    <Clock size={18} color="#ef4444" />
                    <Text style={[styles.upcomingTitle, { color: isDark ? '#f8fafc' : '#1e293b' }]}>{t('dashboard.upcomingDeadlines')}</Text>
                    <View style={[styles.upcomingBadge, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                        <Text style={styles.upcomingBadgeText}>{upcoming.length}</Text>
                    </View>
                </View>
            </View>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.upcomingScroll}
            >
                {upcoming.map((goal) => {
                    const days = getDaysUntil(goal.deadline!);
                    return (
                        <TouchableOpacity
                            key={goal.id}
                            onPress={() => router.push(`/goals/${goal.id}`)}
                            style={[
                                styles.upcomingCard,
                                {
                                    backgroundColor: days <= 0 ? 'rgba(239, 68, 68, 0.08)' : isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                                    borderColor: days <= 0 ? 'rgba(239, 68, 68, 0.25)' : isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
                                }
                            ]}
                        >
                            <View style={styles.upcomingCardHeader}>
                                <View style={[styles.upcomingDot, { backgroundColor: days <= 0 ? '#ef4444' : days <= 1 ? '#f59e0b' : '#6366f1' }]} />
                                <Text style={[
                                    styles.upcomingDays,
                                    { color: days <= 0 ? '#f87171' : days <= 1 ? '#fbbf24' : '#818cf8' }
                                ]}>
                                    {days === 0 ? t('time.today') : days === 1 ? t('time.tomorrow') : days < 0 ? t('time.overdueShort', { count: Math.abs(days) }) : t('time.leftShort', { count: days })}
                                </Text>
                            </View>
                            <Text style={[styles.upcomingCardTitle, { color: isDark ? '#f8fafc' : '#1e293b' }]} numberOfLines={2}>
                                {goal.title}
                            </Text>
                            {goal.opportunity_title && (
                                <Text style={[styles.upcomingCardSub, { color: isDark ? '#94a3b8' : '#64748b' }]} numberOfLines={1}>
                                    {goal.opportunity_title}
                                </Text>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function GoalsDashboard() {
    const { colors, isDark } = useTheme();
    const { user } = useUser();
    const router = useRouter();
    const { t } = useTranslation('goals');

    // No local reminder scheduling here. The backend owns goal reminders
    // (7/3/1/0 days before the deadline, in the user's timezone, honoring their
    // notification preferences and quiet hours) and keeps them across
    // reinstalls, so scheduling a second local series on create/update only
    // produced duplicate notifications on the overlapping days.
    const { goals, updateGoal, deleteGoal } = useGoals(supabase, user?.id || null);

    const { show: showToast } = useToast();
    const { award } = useCreditRewards(supabase, user?.id || null, {
        onEarned: (amount) => {
            showToast({
                emoji: '🎉',
                variant: 'success',
                message: t('creditsEarned', { count: amount }),
            });
        },
    });

    const handleCompleteGoal = useCallback(async (id: string) => {
        await updateGoal(id, { status: 'completed', progress: 100 });
        // Celebrate + narrate progress — milestones should feel witnessed,
        // not just silently re-rendered.
        void haptics.success();
        const total = goals.length;
        const done = goals.filter((g) => g.status === 'completed' || g.id === id).length;
        if (total > 0) {
            showToast({
                emoji: '🏁',
                variant: 'success',
                message: `${done} of ${total} done — further than most applicants ever get.`,
            });
        }
        // Reward completion (server grants at most once/day; toast via onEarned).
        void award('COMPLETE_GOAL');
    }, [updateGoal, award, goals, showToast]);

    const [bookmarkedOpps, setBookmarkedOpps] = useState<{ id: string, title: string, closeDate: string }[]>([]);
    const [dismissedBanner, setDismissedBanner] = useState(false);

    // Promise-chain style (not async/await) so every setState lives in an
    // async callback — the set-state-in-effect rule treats awaited sets in a
    // named async callee as synchronous.
    const loadBookmarks = useCallback(() => {
        const uid = user?.id;
        if (!uid) return Promise.resolve();
        return supabase
            .from('bookmarks')
            .select('id, opportunity_id')
            .eq('user_id', toSafeUUID(uid))
            .then(({ data: bookmarks, error }) => {
                if (error || !bookmarks || bookmarks.length === 0) {
                    setBookmarkedOpps([]);
                    return;
                }

                const oppIds = bookmarks.map(b => b.opportunity_id);
                return supabase
                    .from('opportunities')
                    .select('id, title, close_date')
                    .in('id', oppIds)
                    .then(({ data: opportunities }) => {
                        if (opportunities) {
                            const formatted = opportunities
                                .map(o => ({
                                    id: o.id,
                                    title: o.title || t('dashboard.opportunityFallback'),
                                    closeDate: o.close_date,
                                }))
                                .filter(o => o.closeDate);
                            setBookmarkedOpps(formatted);
                        }
                    });
            })
            .then(undefined, (e) => {
                console.error('Error loading bookmarks for calendar:', e);
            });
    }, [user?.id, t]);

    useEffect(() => {
        loadBookmarks();
    }, [loadBookmarks]);

    const [statusFilter, setStatusFilter] = useState<GoalStatusFilter>('all');
    const [searchTerm, setSearchTerm] = useState('');
    // Snapshot the clock once — day-granularity urgency math doesn't need a
    // live clock, and Date.now() during render is impure.
    const [nowTs] = useState(() => Date.now());
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);

    const getDaysUntil = useCallback((deadline: string | null | undefined): number => {
        if (!deadline) return 0;
        // Off the same mount snapshot the rest of the screen uses, so two
        // badges rendered a second apart can't disagree about "1d left".
        return Math.ceil((new Date(deadline).getTime() - nowTs) / (1000 * 60 * 60 * 24));
    }, [nowTs]);

    const { filteredGoals } = useFilteredGoals({
        goals,
        activeTab: 'all',
        statusFilter,
        searchTerm,
    });

    const roadmapGoals = useMemo(() => filteredGoals.filter(g => g.source === 'imported'), [filteredGoals]);
    const personalGoals = useMemo(() => filteredGoals.filter(g => g.source === 'custom'), [filteredGoals]);

    const stats = useMemo(() => ({
        active: goals.filter(g => g.status === 'active').length,
        completed: goals.filter(g => g.status === 'completed').length,
        roadmap: goals.filter(g => g.source === 'imported').length,
        total: goals.length,
    }), [goals]);

    // A search or a filter that returns nothing is a different situation from
    // an empty account, and it needs a different sentence. Without this the
    // dashboard told users with 20 goals that they had none.
    const isNarrowed = searchTerm.length > 0 || statusFilter !== 'all';

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadBookmarks();
        setRefreshing(false);
    }, [loadBookmarks]);

    const handleShareBannerDismiss = useCallback(() => {
        setDismissedBanner(true);
    }, []);

    const clearNarrowing = useCallback(() => {
        setSearchTerm('');
        setStatusFilter('all');
    }, []);

    const SHARE_OPPORTUNITIES_BANNER: BannerConfig = {
        id: 'share-opportunities',
        title: t('dashboard.shareBanner.title'),
        subtitle: t('dashboard.shareBanner.subtitle'),
        gradient: ['#F59E0B', '#EA580C'],
        icon: Volume2,
        actionLabel: t('dashboard.shareBanner.action'),
        route: '/help',
    };

    const filterOptions: { label: string; value: GoalStatusFilter; icon: any; count: number }[] = [
        { label: t('filter.allGoals'), value: 'all', icon: Award, count: stats.total },
        { label: t('filter.active'), value: 'active', icon: Target, count: stats.active },
        { label: t('filter.completed'), value: 'completed', icon: CheckCircle2, count: stats.completed },
    ];

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94a3b8' : '#64748b';
    const divider = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
    const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9';

    const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={t('dashboard.title')}
                showBack
                subtitle={stats.total === 0
                    ? t('dashboard.subtitleEmpty')
                    : t('dashboard.subtitle', { active: stats.active, rate: completionRate })}
            />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
            >
                {/* ── Calendar Strip ── */}
                <GoalCalendar goals={goals} opportunities={bookmarkedOpps} />

                {/* ── Upcoming Deadlines ── */}
                {!searchTerm && statusFilter === 'all' && <UpcomingStrip goals={goals} />}

                {/* ── 2x2 Slim Stats ── */}
                <View style={styles.statGrid}>
                    <View style={styles.statRow}>
                        <SlimStatCard
                            title={t('stats.active')}
                            value={stats.active}
                            color="#3b82f6"
                            icon={Target}
                            selected={statusFilter === 'active'}
                            onPress={() => { setStatusFilter(statusFilter === 'active' ? 'all' : 'active'); }}
                        />
                        <SlimStatCard
                            title={t('stats.completed')}
                            value={stats.completed}
                            color="#10b981"
                            icon={CheckCircle2}
                            selected={statusFilter === 'completed'}
                            onPress={() => { setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed'); }}
                        />
                    </View>
                    <View style={styles.statRow}>
                        <SlimStatCard
                            title={t('stats.roadmaps')}
                            value={stats.roadmap}
                            color="#f59e0b"
                            icon={Map}
                            onPress={() => router.push('/goals/all-roadmaps')}
                        />
                        <SlimStatCard
                            title={t('stats.completion')}
                            value={completionRate}
                            unit="%"
                            color={colors.accent}
                            icon={TrendingUp}
                        />
                    </View>
                </View>

                {/* ── My Opportunities Card ── */}
                <MyOpportunitiesCard
                    count={bookmarkedOpps.length}
                    urgentCount={bookmarkedOpps.filter(o => {
                        if (!o.closeDate) return false;
                        const days = Math.ceil((new Date(o.closeDate).getTime() - nowTs) / (1000 * 60 * 60 * 24));
                        return days <= 7 && days >= 0;
                    }).length}
                />

                {/* ── Share Opportunities Banner ── */}
                {!dismissedBanner && (
                    <AdBanner
                        config={SHARE_OPPORTUNITIES_BANNER}
                        onPress={() => router.push('/help')}
                        onClose={handleShareBannerDismiss}
                        showClose
                        autoDismiss
                        swipeToDismiss
                    />
                )}

                {/* ── Integrated Search & Filter ── */}
                <View style={[styles.searchBar, {
                    backgroundColor: isSearchFocused ? (isDark ? 'rgba(255,255,255,0.08)' : '#ffffff') : inputBg,
                    borderColor: isSearchFocused ? colors.accent : divider,
                    shadowColor: isSearchFocused ? colors.accent : 'transparent',
                    shadowOpacity: isSearchFocused ? 0.15 : 0,
                    shadowRadius: 8,
                    elevation: isSearchFocused ? 3 : 0,
                }]}>
                    <Search size={18} color={isSearchFocused ? colors.accent : textSecondary} style={{ marginRight: 10 }} />
                    <TextInput
                        style={[styles.searchInput, { color: textPrimary }]}
                        placeholder={t('dashboard.searchPlaceholder')}
                        placeholderTextColor={textSecondary}
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                        onFocus={() => setIsSearchFocused(true)}
                        onBlur={() => setIsSearchFocused(false)}
                    />
                    {searchTerm.length > 0 && (
                        <TouchableOpacity
                            onPress={() => setSearchTerm('')}
                            style={styles.clearBtn}
                            accessibilityRole="button"
                            accessibilityLabel={t('a11y.clearSearch')}
                        >
                            <X size={18} color={textSecondary} />
                        </TouchableOpacity>
                    )}
                    <View style={[styles.vDivider, { backgroundColor: divider }]} />
                    <TouchableOpacity
                        onPress={() => setShowFilterMenu(true)}
                        style={styles.filterTrigger}
                        accessibilityRole="button"
                        accessibilityLabel={t('a11y.openFilters')}
                    >
                        <Filter size={18} color={statusFilter !== 'all' ? colors.accent : textSecondary} />
                        {statusFilter !== 'all' && (
                            <View style={[styles.filterDot, { backgroundColor: colors.accent }]} />
                        )}
                    </TouchableOpacity>
                </View>

                {/* ── Active Filter Indicator ── */}
                {statusFilter !== 'all' && (
                    <View style={styles.activeFilterBar}>
                        <Text style={[styles.activeFilterText, { color: colors.accent }]}>
                            {t('filter.activeLabel', { label: filterOptions.find(f => f.value === statusFilter)?.label })}
                        </Text>
                        <TouchableOpacity
                            onPress={() => setStatusFilter('all')}
                            accessibilityRole="button"
                            accessibilityLabel={t('filter.clear')}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Text style={[styles.clearFilterText, { color: textSecondary }]}>{t('filter.clear')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── One "nothing matches" block, not one per section ── */}
                {isNarrowed && filteredGoals.length === 0 && (
                    <View style={styles.section}>
                        <StateView
                            state={{ kind: 'empty', reason: 'filtered' }}
                            flow="goals"
                            fill={false}
                            sceneSize={150}
                            title={t('empty.noMatch.title')}
                            body={t('empty.noMatch.description')}
                            actionLabel={t('empty.noMatch.action')}
                            onAction={clearNarrowing}
                        />
                    </View>
                )}

                {/* ── Roadmap Section ── */}
                {/* Hidden while narrowed-and-empty: the other section holds the
                    hits, and repeating "nothing matches" twice reads as broken. */}
                {(roadmapGoals.length > 0 || !isNarrowed) && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <View style={styles.sectionTitleRow}>
                                <Map size={18} color="#f59e0b" />
                                <Text style={[styles.sectionTitle, { color: textPrimary }]}>{t('sections.roadmaps')}</Text>
                                {roadmapGoals.length > 0 && (
                                    <View style={[styles.sectionCount, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                                        <Text style={styles.sectionCountText}>{roadmapGoals.length}</Text>
                                    </View>
                                )}
                            </View>
                            <TouchableOpacity
                                onPress={() => router.push('/goals/all-roadmaps')}
                                accessibilityRole="button"
                                accessibilityLabel={t('viewAll')}
                            >
                                <Text style={[styles.viewMore, { color: colors.accent }]}>{t('viewAll')}</Text>
                            </TouchableOpacity>
                        </View>

                        {roadmapGoals.length > 0 ? (
                            <>
                                <Text style={[styles.sectionHint, { color: textSecondary }]}>{t('sections.roadmapsHint')}</Text>
                                <View style={styles.grid}>
                                    {roadmapGoals.slice(0, 4).map((goal) => (
                                        <View key={goal.id} style={{ width: GRID_ITEM_WIDTH }}>
                                            <GoalCard goal={goal} compact getDaysUntil={getDaysUntil} />
                                        </View>
                                    ))}
                                </View>
                            </>
                        ) : (
                            <StateView
                                state={{ kind: 'empty', reason: 'firstRun' }}
                                flow="goals"
                                fill={false}
                                sceneSize={150}
                                title={t('empty.noRoadmaps.title')}
                                body={t('empty.noRoadmaps.description')}
                                actionLabel={t('empty.noRoadmaps.action')}
                                onAction={() => router.push('/roadmaps')}
                            />
                        )}
                    </View>
                )}

                {/* ── My Personal Goals Section ── */}
                {(personalGoals.length > 0 || !isNarrowed) && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <View style={styles.sectionTitleRow}>
                                <Target size={18} color={colors.accent} />
                                <Text style={[styles.sectionTitle, { color: textPrimary }]}>{t('sections.personalGoals')}</Text>
                                {personalGoals.length > 0 && (
                                    <View style={[styles.sectionCount, { backgroundColor: `${colors.accent}15` }]}>
                                        <Text style={[styles.sectionCountText, { color: colors.accent }]}>{personalGoals.length}</Text>
                                    </View>
                                )}
                            </View>
                            <TouchableOpacity
                                onPress={() => router.push('/goals/my-list')}
                                accessibilityRole="button"
                                accessibilityLabel={t('viewAll')}
                            >
                                <Text style={[styles.viewMore, { color: colors.accent }]}>{t('viewAll')}</Text>
                            </TouchableOpacity>
                        </View>

                        {personalGoals.length > 0 ? (
                            <>
                                <Text style={[styles.sectionHint, { color: textSecondary }]}>{t('sections.personalGoalsHint')}</Text>
                                <View style={styles.listContainer}>
                                    {personalGoals.slice(0, 3).map((goal) => (
                                        <GoalCard
                                            key={goal.id}
                                            goal={goal}
                                            onComplete={handleCompleteGoal}
                                            onReopen={async (id) => updateGoal(id, { status: 'active', progress: 0 })}
                                            onDelete={deleteGoal as any}
                                            getDaysUntil={getDaysUntil}
                                        />
                                    ))}
                                </View>
                            </>
                        ) : (
                            <StateView
                                state={{ kind: 'empty', reason: 'firstRun' }}
                                flow="goals"
                                fill={false}
                                sceneSize={150}
                                title={t('empty.noPersonalGoals.title')}
                                body={t('empty.noPersonalGoals.description')}
                                actionLabel={t('empty.noPersonalGoals.action')}
                                onAction={() => router.push('/goals/add')}
                            />
                        )}
                    </View>
                )}

                {/* ── Search Results Count ── */}
                {searchTerm.length > 0 && (
                    <View style={styles.resultsInfo}>
                        <Text style={[styles.resultsText, { color: textSecondary }]}>
                            {t('dashboard.searchResults', { count: filteredGoals.length, term: searchTerm })}
                        </Text>
                    </View>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* ── Status Filter Menu ──
                Lives outside the ScrollView: a Modal nested in scrollable
                content inherits its layout pass for nothing and makes the
                backdrop's hit area depend on the scroll offset. */}
            <Modal
                visible={showFilterMenu}
                transparent
                animationType="fade"
                onRequestClose={() => setShowFilterMenu(false)}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setShowFilterMenu(false)}
                    accessibilityRole="button"
                    accessibilityLabel={t('common:actions.close')}
                >
                    {/* Stop the backdrop press from firing through the sheet. */}
                    <Pressable
                        onPress={(e) => e.stopPropagation()}
                        style={[styles.filterMenu, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}
                    >
                        <View style={styles.filterMenuHeader}>
                            <Text style={[styles.menuTitle, { color: textPrimary }]}>{t('filter.byStatus')}</Text>
                            {statusFilter !== 'all' && (
                                <TouchableOpacity
                                    onPress={() => { setStatusFilter('all'); setShowFilterMenu(false); }}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('filter.clear')}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                    <Text style={[styles.clearFilterBtn, { color: colors.accent }]}>{t('filter.clear')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        {filterOptions.map((opt) => {
                            const isActive = statusFilter === opt.value;
                            const Icon = opt.icon;
                            return (
                                <TouchableOpacity
                                    key={opt.value}
                                    style={[styles.menuItem, isActive && { backgroundColor: `${colors.accent}12` }]}
                                    onPress={() => {
                                        setStatusFilter(opt.value);
                                        setShowFilterMenu(false);
                                    }}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: isActive }}
                                    accessibilityLabel={t('a11y.statusTab', { label: opt.label, count: opt.count })}
                                >
                                    <View style={[styles.menuRadio, { borderColor: isActive ? colors.accent : textSecondary }]}>
                                        {isActive && <View style={[styles.radioDot, { backgroundColor: colors.accent }]} />}
                                    </View>
                                    <Icon size={20} color={isActive ? colors.accent : textSecondary} style={{ marginRight: 12 }} />
                                    <Text style={[styles.menuLabel, { color: isActive ? colors.accent : textPrimary }]}>
                                        {opt.label}
                                    </Text>
                                    <View style={[
                                        styles.menuCount,
                                        { backgroundColor: isActive ? `${colors.accent}1F` : (isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9') },
                                    ]}>
                                        <Text style={[styles.menuCountText, { color: isActive ? colors.accent : textSecondary }]}>
                                            {opt.count}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 16 },

    // Share Opportunities Banner
    shareBanner: {
        marginBottom: 16,
    },

    // Upcoming Deadlines Strip
    upcomingSection: {
        marginBottom: 20,
    },
    upcomingHeader: {
        marginBottom: 12,
    },
    upcomingTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    upcomingTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    upcomingBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        minWidth: 20,
        alignItems: 'center',
    },
    upcomingBadgeText: {
        color: '#f87171',
        fontSize: 11,
        fontWeight: '700',
    },
    upcomingScroll: {
        paddingRight: 8,
    },
    upcomingCard: {
        width: 160,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        marginRight: 10,
    },
    upcomingCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 6,
    },
    upcomingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    upcomingDays: {
        fontSize: 12,
        fontWeight: '700',
    },
    upcomingCardTitle: {
        fontSize: 13,
        fontWeight: '600',
        lineHeight: 18,
        marginBottom: 4,
    },
    upcomingCardSub: {
        fontSize: 11,
    },

    // Slim Stats Grid
    statGrid: { gap: CARD_GAP, marginBottom: 24 },
    statRow: { flexDirection: 'row', gap: CARD_GAP },
    slimStatCard: {
        flex: 1,
        height: 80,
        borderRadius: 16,
        borderCurve: 'continuous',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        borderWidth: 1,
    },
    // Selection is a state, so it gets the accent border at full weight.
    slimStatCardSelected: { borderWidth: 2 },
    statIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    statInfo: { flex: 1 },
    statVal: { fontSize: 20, fontWeight: '800' },
    // 11pt is the scale's floor; 10pt uppercase was below it and unreadable
    // on the darker packs.
    statLab: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },

    // Integrated Search Bar
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        height: 52,
        borderRadius: 14,
        borderWidth: 1,
        marginBottom: 12,
    },
    searchInput: { flex: 1, fontSize: 14, height: '100%' },
    clearBtn: { padding: 8, marginRight: 2 },
    vDivider: { width: 1, height: 24, marginHorizontal: 10 },
    filterTrigger: { paddingHorizontal: 8, paddingVertical: 10, position: 'relative' },
    filterDot: {
        position: 'absolute',
        top: -4,
        right: -4,
        width: 6,
        height: 6,
        borderRadius: 3,
    },

    // Active Filter Bar
    activeFilterBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 4,
        marginBottom: 16,
    },
    activeFilterText: {
        fontSize: 13,
        fontWeight: '600',
    },
    clearFilterText: {
        fontSize: 13,
        fontWeight: '600',
    },

    // Sections
    section: { marginBottom: 30 },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 12 },
    sectionTitle: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
    // One line telling you where these rows came from — the two sections were
    // otherwise indistinguishable apart from an icon tint.
    sectionHint: { fontSize: 13, lineHeight: 18, marginTop: -6, marginBottom: 14 },
    sectionCount: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        minWidth: 20,
        alignItems: 'center',
    },
    sectionCountText: {
        fontSize: 11,
        fontWeight: '700',
    },
    viewMore: { fontSize: 13, fontWeight: '600' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    listContainer: { gap: 12 },

    // Results Info
    resultsInfo: {
        paddingVertical: 8,
        alignItems: 'center',
    },
    resultsText: {
        fontSize: 12,
        fontStyle: 'italic',
    },

    // Empty State for sections

    // Modal / Filter Menu
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
    filterMenu: {
        width: width * 0.8,
        borderRadius: 20,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    filterMenuHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    menuTitle: { fontSize: 18, fontWeight: '700' },
    clearFilterBtn: { fontSize: 15, fontWeight: '600' },
    // 60pt rows with 17pt labels: the old 40pt / 16pt rows sat under the 44pt
    // touch minimum and three of them read as one dense block.
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        minHeight: 60,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 16,
        borderCurve: 'continuous',
    },
    menuRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, marginRight: 14, alignItems: 'center', justifyContent: 'center' },
    radioDot: { width: 11, height: 11, borderRadius: 6 },
    menuLabel: { fontSize: 17, fontWeight: '600', flex: 1 },
    menuCount: {
        minWidth: 30,
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 999,
        alignItems: 'center',
    },
    menuCountText: { fontSize: 13, fontWeight: '700' },

    // My Opportunities Card
    myOppsCard: {
        borderRadius: 20,
        padding: 20,
        marginBottom: 20,
        overflow: 'hidden',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    myOppsContent: { flexDirection: 'row', alignItems: 'center', position: 'relative', zIndex: 1 },
    myOppsIconWrap: {
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    myOppsInfo: { flex: 1 },
    myOppsTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
    myOppsSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '500' },
    myOppsArrow: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 20,
    },
    myOppsArrowText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    myOppsBgPattern: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    myOppsCircle: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.08)' },
});
