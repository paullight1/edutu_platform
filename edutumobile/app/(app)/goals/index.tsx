import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
    RefreshControl,
    StyleSheet,
    Dimensions,
    Modal,
    Pressable,
    Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Target,
    Plus,
    Search,
    Sparkles,
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
import { useTheme } from '../../../components/context/ThemeContext';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { supabase } from '../../../lib/supabase';
import { notificationService } from '../../../lib/notifications';
import { useGoals } from '@edutu/core/src/hooks/useGoals';
import { fetchOpportunities } from '@edutu/core/src/services/opportunities';
import { toSafeUUID } from '@edutu/core/src/utils/auth';
import { Opportunity } from '@edutu/core/src/types/opportunity';
import {
    GoalCard,
    GoalCalendar,
    UpcomingGoalCard,
    useFilteredGoals,
} from '../../../components/goals';
import type { GoalStatusFilter } from '../../../components/goals';
import type { Goal } from '@edutu/core/src/hooks/useGoals';
import { AdBanner, BannerConfig } from '../../../components/ui/AdBanner';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const CARD_GAP = 10;
const STAT_WIDTH = (width - 32 - CARD_GAP) / 2;
const GRID_ITEM_WIDTH = (width - 44) / 2;

// ─── Slim Stat Card ──────────────────────────────────────────────────────────
function SlimStatCard({
    title,
    value,
    color,
    icon: Icon,
    onPress,
}: {
    title: string;
    value: number;
    color: string;
    icon: any;
    onPress?: () => void;
}) {
    const { isDark } = useTheme();
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.85}
            style={[styles.slimStatCard, { backgroundColor: `${color}12`, borderColor: `${color}25` }]}
        >
            <View style={[styles.statIconCircle, { backgroundColor: `${color}20` }]}>
                <Icon size={18} color={color} />
            </View>
            <View style={styles.statInfo}>
                <Text style={[styles.statVal, { color: isDark ? '#f8fafc' : '#0f172a' }]}>{value}</Text>
                <Text style={[styles.statLab, { color: isDark ? '#94a3b8' : '#64748b' }]} numberOfLines={1}>{title}</Text>
            </View>
        </TouchableOpacity>
    );
}

// ─── Empty Section Placeholder ───────────────────────────────────────────────
function EmptySection({
    title,
    description,
    icon: Icon,
    color,
    actionLabel,
    onAction,
}: {
    title: string;
    description: string;
    icon: any;
    color: string;
    actionLabel?: string;
    onAction?: () => void;
}) {
    const { isDark } = useTheme();
    return (
        <View style={[styles.emptyBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc' }]}>
            <View style={[styles.emptyIconCircle, { backgroundColor: `${color}12` }]}>
                <Icon size={28} color={color} />
            </View>
            <Text style={[styles.emptyTitle, { color: isDark ? '#f8fafc' : '#1e293b' }]}>{title}</Text>
            <Text style={[styles.emptyDesc, { color: isDark ? '#94a3b8' : '#64748b' }]}>{description}</Text>
            {actionLabel && onAction && (
                <TouchableOpacity
                    onPress={onAction}
                    style={[styles.emptyActionBtn, { backgroundColor: `${color}15` }]}
                >
                    <Text style={[styles.emptyActionText, { color }]}>{actionLabel}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

// ─── My Opportunities Card ───────────────────────────────────────────────────
function MyOpportunitiesCard({ count, urgentCount }: { count: number; urgentCount: number }) {
    const { isDark } = useTheme();
    const router = useRouter();

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
                        <Text style={styles.myOppsTitle}>My Opportunities</Text>
                        <Text style={styles.myOppsSubtitle}>
                            {count} saved{urgentCount > 0 ? ` · ${urgentCount} urgent` : ''}
                        </Text>
                    </View>
                    <View style={styles.myOppsArrow}>
                        <Text style={styles.myOppsArrowText}>View All</Text>
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

    const upcoming = useMemo(() => {
        const now = new Date();
        const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        return goals
            .filter(g => g.status === 'active' && g.deadline)
            .filter(g => new Date(g.deadline!) <= threeDays)
            .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
            .slice(0, 5);
    }, [goals]);

    if (upcoming.length === 0) return null;

    const getDaysUntil = (deadline: string) => {
        return Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    };

    return (
        <View style={styles.upcomingSection}>
            <View style={styles.upcomingHeader}>
                <View style={styles.upcomingTitleRow}>
                    <Clock size={18} color="#ef4444" />
                    <Text style={[styles.upcomingTitle, { color: isDark ? '#f8fafc' : '#1e293b' }]}>Upcoming Deadlines</Text>
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
                                    {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
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

    const { goals, isLoading, updateGoal, deleteGoal } = useGoals(supabase, user?.id || null, {
        onGoalCreated: async (goal) => {
            if (goal.deadline) {
                const nid = await notificationService.scheduleGoalReminder(goal.id, goal.title, goal.deadline);
                if (nid) {
                    await updateGoal(goal.id, { notification_id: nid });
                }
            }
        },
        onGoalUpdated: async (goal) => {
            if (goal.notification_id) {
                await notificationService.cancelNotification(goal.notification_id);
            }
            if (goal.status === 'active' && goal.deadline) {
                const nid = await notificationService.scheduleGoalReminder(goal.id, goal.title, goal.deadline);
                if (nid) {
                    await updateGoal(goal.id, { notification_id: nid });
                }
            }
        },
        onGoalDeleted: async (id) => {
            const goal = goals.find(g => g.id === id);
            if (goal?.notification_id) {
                await notificationService.cancelNotification(goal.notification_id);
            }
        }
    });

    const [bookmarkedOpps, setBookmarkedOpps] = useState<{ id: string, title: string, closeDate: string }[]>([]);
    const [personalizedOpps, setPersonalizedOpps] = useState<Opportunity[]>([]);
    const [loadingOpps, setLoadingOpps] = useState(false);
    const [dismissedBanner, setDismissedBanner] = useState(false);

    const loadBookmarks = useCallback(async () => {
        if (!user?.id) return;
        try {
            const { data: bookmarks, error } = await supabase
                .from('bookmarks')
                .select('id, opportunity_id')
                .eq('user_id', toSafeUUID(user.id));

            if (error || !bookmarks || bookmarks.length === 0) {
                setBookmarkedOpps([]);
                return;
            }

            const oppIds = bookmarks.map(b => b.opportunity_id);
            const { data: opportunities } = await supabase
                .from('opportunities')
                .select('id, title, close_date')
                .in('id', oppIds);

            if (opportunities) {
                const formatted = opportunities
                    .map(o => ({
                        id: o.id,
                        title: o.title || 'Opportunity',
                        closeDate: o.close_date,
                    }))
                    .filter(o => o.closeDate);
                setBookmarkedOpps(formatted);
            }
        } catch (e) {
            console.error('Error loading bookmarks for calendar:', e);
        }
    }, [user?.id]);

    useEffect(() => {
        loadBookmarks();
    }, [loadBookmarks]);

    const [statusFilter, setStatusFilter] = useState<GoalStatusFilter>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);

    const getDaysUntil = useCallback((deadline: string | null | undefined): number => {
        if (!deadline) return 0;
        return Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }, []);

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

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadBookmarks();
        setRefreshing(false);
    }, [loadBookmarks]);

    const handleShareBannerDismiss = useCallback(() => {
        setDismissedBanner(true);
    }, []);

    const SHARE_OPPORTUNITIES_BANNER: BannerConfig = {
        id: 'share-opportunities',
        title: 'Have Opportunities to Share?',
        subtitle: 'Contact us if you have scholarships, jobs, or programs you\'d like to share with our community',
        gradient: ['#F59E0B', '#EA580C'],
        icon: Volume2,
        actionLabel: 'Contact Us',
        route: '/help',
    };

    const filterOptions: { label: string; value: GoalStatusFilter; icon: any }[] = [
        { label: 'All Goals', value: 'all', icon: Award },
        { label: 'Active', value: 'active', icon: Target },
        { label: 'Completed', value: 'completed', icon: CheckCircle2 },
    ];

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94a3b8' : '#64748b';
    const divider = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
    const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9';

    const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title="Goals"
                showBack
                subtitle={`${stats.active} active · ${completionRate}% completed`}
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
                            title="Active"
                            value={stats.active}
                            color="#3b82f6"
                            icon={Target}
                            onPress={() => { setStatusFilter(statusFilter === 'active' ? 'all' : 'active'); }}
                        />
                        <SlimStatCard
                            title="Completed"
                            value={stats.completed}
                            color="#10b981"
                            icon={CheckCircle2}
                            onPress={() => { setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed'); }}
                        />
                    </View>
                    <View style={styles.statRow}>
                        <SlimStatCard
                            title="Roadmaps"
                            value={stats.roadmap}
                            color="#f59e0b"
                            icon={Map}
                        />
                        <SlimStatCard
                            title="Completion"
                            value={completionRate}
                            color={colors.accent}
                            icon={TrendingUp}
                        />
                    </View>
                </View>

                {/* ── My Opportunities Card ── */}
                <MyOpportunitiesCard
                    count={bookmarkedOpps.length}
                    urgentCount={bookmarkedOpps.filter(o => {
                        if (!o.closeDate) return 0;
                        const days = Math.ceil((new Date(o.closeDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        return days <= 7 && days >= 0 ? 1 : 0;
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
                        placeholder="Search your goals..."
                        placeholderTextColor={textSecondary}
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                        onFocus={() => setIsSearchFocused(true)}
                        onBlur={() => setIsSearchFocused(false)}
                    />
                    {searchTerm.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchTerm('')} style={styles.clearBtn}>
                            <X size={16} color={textSecondary} />
                        </TouchableOpacity>
                    )}
                    <View style={[styles.vDivider, { backgroundColor: divider }]} />
                    <TouchableOpacity
                        onPress={() => setShowFilterMenu(true)}
                        style={styles.filterTrigger}
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
                            Filter: {filterOptions.find(f => f.value === statusFilter)?.label}
                        </Text>
                        <TouchableOpacity onPress={() => setStatusFilter('all')}>
                            <Text style={[styles.clearFilterText, { color: textSecondary }]}>Clear</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── Roadmap Section ── */}
                {(searchTerm || statusFilter === 'all' || roadmapGoals.length > 0) && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <View style={styles.sectionTitleRow}>
                                <Map size={18} color="#f59e0b" />
                                <Text style={[styles.sectionTitle, { color: textPrimary }]}>Roadmaps</Text>
                                {roadmapGoals.length > 0 && (
                                    <View style={[styles.sectionCount, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                                        <Text style={styles.sectionCountText}>{roadmapGoals.length}</Text>
                                    </View>
                                )}
                            </View>
                            <TouchableOpacity onPress={() => router.push('/goals/all-roadmaps')}>
                                <Text style={[styles.viewMore, { color: colors.accent }]}>View All</Text>
                            </TouchableOpacity>
                        </View>

                        {roadmapGoals.length > 0 ? (
                            <View style={styles.grid}>
                                {roadmapGoals.slice(0, 4).map((goal) => (
                                    <View key={goal.id} style={{ width: GRID_ITEM_WIDTH }}>
                                        <GoalCard goal={goal} compact getDaysUntil={getDaysUntil} />
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <EmptySection
                                icon={Map}
                                color="#f59e0b"
                                title="No Roadmaps"
                                description="Import an opportunity roadmap to see goals here."
                                actionLabel="Browse Roadmaps"
                                onAction={() => router.push('/goals/all-roadmaps')}
                            />
                        )}
                    </View>
                )}

                {/* ── My Personal Goals Section ── */}
                {(searchTerm || statusFilter === 'all' || personalGoals.length > 0) && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <View style={styles.sectionTitleRow}>
                                <Sparkles size={18} color={colors.accent} />
                                <Text style={[styles.sectionTitle, { color: textPrimary }]}>Personal Goals</Text>
                                {personalGoals.length > 0 && (
                                    <View style={[styles.sectionCount, { backgroundColor: `${colors.accent}15` }]}>
                                        <Text style={[styles.sectionCountText, { color: colors.accent }]}>{personalGoals.length}</Text>
                                    </View>
                                )}
                            </View>
                            <TouchableOpacity onPress={() => router.push('/goals/my-list')}>
                                <Text style={[styles.viewMore, { color: colors.accent }]}>View All</Text>
                            </TouchableOpacity>
                        </View>

                        {personalGoals.length > 0 ? (
                            <View style={styles.listContainer}>
                                {personalGoals.slice(0, 3).map((goal) => (
                                    <GoalCard
                                        key={goal.id}
                                        goal={goal}
                                        onComplete={async (id) => updateGoal(id, { status: 'completed', progress: 100 })}
                                        onReopen={async (id) => updateGoal(id, { status: 'active', progress: 0 })}
                                        onDelete={deleteGoal as any}
                                        getDaysUntil={getDaysUntil}
                                    />
                                ))}
                            </View>
                        ) : (
                            <EmptySection
                                icon={Target}
                                color={colors.accent}
                                title="No Personal Goals"
                                description="Tap the plus icon to add your first goal."
                                actionLabel="Create Goal"
                                onAction={() => router.push('/goals/add')}
                            />
                        )}
                    </View>
                )}

                {/* ── Search Results Count ── */}
                {searchTerm.length > 0 && (
                    <View style={styles.resultsInfo}>
                        <Text style={[styles.resultsText, { color: textSecondary }]}>
                            Found {filteredGoals.length} goal{filteredGoals.length !== 1 ? 's' : ''} matching "{searchTerm}"
                        </Text>
                    </View>
                )}

                {/* ── Floating Filter Menu ── */}
                <Modal
                    visible={showFilterMenu}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowFilterMenu(false)}
                >
                    <Pressable
                        style={styles.modalOverlay}
                        onPress={() => setShowFilterMenu(false)}
                    >
                        <View style={[styles.filterMenu, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                            <View style={styles.filterMenuHeader}>
                                <Text style={[styles.menuTitle, { color: textPrimary }]}>Filter by Status</Text>
                                {statusFilter !== 'all' && (
                                    <TouchableOpacity onPress={() => { setStatusFilter('all'); setShowFilterMenu(false); }}>
                                        <Text style={[styles.clearFilterBtn, { color: colors.accent }]}>Clear</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            {filterOptions.map((opt) => {
                                const isActive = statusFilter === opt.value;
                                const Icon = opt.icon;
                                return (
                                    <TouchableOpacity
                                        key={opt.value}
                                        style={[styles.menuItem, isActive && { backgroundColor: `${colors.accent}08` }]}
                                        onPress={() => {
                                            setStatusFilter(opt.value);
                                            setShowFilterMenu(false);
                                        }}
                                    >
                                        <View style={[styles.menuRadio, { borderColor: isActive ? colors.accent : textSecondary }]}>
                                            {isActive && <View style={[styles.radioDot, { backgroundColor: colors.accent }]} />}
                                        </View>
                                        <Icon size={18} color={isActive ? colors.accent : textSecondary} style={{ marginRight: 10 }} />
                                        <Text style={[styles.menuLabel, { color: isActive ? colors.accent : textPrimary }]}>
                                            {opt.label}
                                        </Text>
                                        {isActive && (
                                            <View style={styles.activeIndicator} />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </Pressable>
                </Modal>

                <View style={{ height: 100 }} />
            </ScrollView>

            <TouchableOpacity
                onPress={() => router.push('/goals/add')}
                style={[styles.fab, { backgroundColor: colors.accent, shadowColor: colors.accent }]}
                activeOpacity={0.8}
            >
                <Plus size={24} color="white" strokeWidth={3} />
            </TouchableOpacity>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 16 },
    fab: {
        position: 'absolute',
        bottom: 30,
        right: 24,
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
    },

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
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        borderWidth: 1,
    },
    statIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    statInfo: { flex: 1 },
    statVal: { fontSize: 18, fontWeight: 'bold' },
    statLab: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },

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
    clearBtn: { padding: 6, marginRight: 4 },
    vDivider: { width: 1, height: 24, marginHorizontal: 12 },
    filterTrigger: { paddingHorizontal: 4, position: 'relative' },
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
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionTitle: { fontSize: 17, fontWeight: '700' },
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
    emptyBox: {
        borderRadius: 20,
        padding: 30,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        borderStyle: 'dashed',
    },
    emptyIconCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    emptyTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
    emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
    emptyActionBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 10,
    },
    emptyActionText: {
        fontSize: 13,
        fontWeight: '700',
    },

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
    menuTitle: { fontSize: 18, fontWeight: 'bold' },
    clearFilterBtn: { fontSize: 14, fontWeight: '600' },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
    },
    menuRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
    radioDot: { width: 10, height: 10, borderRadius: 5 },
    menuLabel: { fontSize: 16, fontWeight: '500', flex: 1 },
    activeIndicator: {
        width: 4,
        height: 20,
        borderRadius: 2,
        backgroundColor: '#6366f1',
    },

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
