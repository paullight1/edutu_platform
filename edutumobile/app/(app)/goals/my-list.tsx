import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { useTheme } from '../../../components/context/ThemeContext';
import { supabase } from '../../../lib/supabase';
import { useGoals } from '@edutu/core/src/hooks/useGoals';
import { GoalCard, useFilteredGoals } from '../../../components/goals';
import { AnimatedPressable } from '../../../components/ui/AnimatedPressable';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import {
    Search,
    X,
    ArrowUpDown,
    CheckCircle2,
    Target,
    Calendar,
    TrendingUp,
    Zap,
    Sparkles,
    ChevronRight,
    Star,
    Trophy,
    Timer,
    Plus,
    BookmarkCheck,
} from 'lucide-react-native';

type SortOption = 'newest' | 'oldest' | 'priority' | 'deadline' | 'progress' | 'title';
type StatusFilter = 'all' | 'active' | 'completed';

export default function MyListScreen() {
    const { colors, isDark } = useTheme();
    const router = useRouter();
    const { user } = useUser();
    const { goals, updateGoal, deleteGoal } = useGoals(supabase, user?.id || null);

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [showSortMenu, setShowSortMenu] = useState(false);

    const { filteredGoals } = useFilteredGoals({
        goals,
        activeTab: 'custom',
        statusFilter: 'all',
        searchTerm: '',
    });

    const finalGoals = useMemo(() => {
        let result = filteredGoals;

        if (statusFilter !== 'all') {
            result = result.filter(g => g.status === statusFilter);
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(g =>
                g.title.toLowerCase().includes(term) ||
                g.description?.toLowerCase().includes(term) ||
                g.opportunity_title?.toLowerCase().includes(term)
            );
        }

        return result.sort((a, b) => {
            switch (sortBy) {
                case 'newest':
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                case 'oldest':
                    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                case 'priority': {
                    const order = { high: 0, medium: 1, low: 2 };
                    return (order[a.priority || 'medium'] ?? 1) - (order[b.priority || 'medium'] ?? 1);
                }
                case 'deadline': {
                    if (!a.deadline && !b.deadline) return 0;
                    if (!a.deadline) return 1;
                    if (!b.deadline) return -1;
                    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
                }
                case 'progress':
                    return b.progress - a.progress;
                case 'title':
                    return a.title.localeCompare(b.title);
                default:
                    return 0;
            }
        });
    }, [filteredGoals, statusFilter, searchTerm, sortBy]);

    const activeGoals = finalGoals.filter(g => g.status === 'active');
    const completedGoals = finalGoals.filter(g => g.status === 'completed');
    const highPriorityGoals = finalGoals.filter(g => g.priority === 'high' && g.status === 'active');
    const avgProgress = finalGoals.length > 0 ? Math.round(finalGoals.reduce((sum, g) => sum + g.progress, 0) / finalGoals.length) : 0;

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94a3b8' : '#64748b';
    const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';

    const sortOptions: { label: string; value: SortOption; icon: any }[] = [
        { label: 'Newest First', value: 'newest', icon: Calendar },
        { label: 'Oldest First', value: 'oldest', icon: Calendar },
        { label: 'Priority', value: 'priority', icon: Target },
        { label: 'Deadline', value: 'deadline', icon: Calendar },
        { label: 'Progress', value: 'progress', icon: TrendingUp },
        { label: 'Title (A-Z)', value: 'title', icon: ArrowUpDown },
    ];

    const statusOptions: { label: string; value: StatusFilter; count: number; icon: any }[] = [
        { label: 'All', value: 'all', count: finalGoals.length, icon: Target },
        { label: 'Active', value: 'active', count: activeGoals.length, icon: Zap },
        { label: 'Completed', value: 'completed', count: completedGoals.length, icon: Trophy },
    ];

    const getDaysUntil = (deadline: string | null | undefined): number => {
        if (!deadline) return 0;
        return Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    };

    const isSearchActive = searchTerm.length > 0 || statusFilter !== 'all';

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title="My Goals"
                subtitle={`${finalGoals.length} goal${finalGoals.length !== 1 ? 's' : ''} tracked`}
                showBack
                right={
                    <TouchableOpacity
                        onPress={() => router.push('/goals')}
                        style={[styles.headerAction, { backgroundColor: colors.primary + '15' }]}
                    >
                        <Plus size={18} color={colors.primary} />
                    </TouchableOpacity>
                }
            />

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero Banner */}
                <Animated.View entering={FadeInDown.duration(400)} style={styles.heroBanner}>
                    <LinearGradient
                        colors={['#6366F1', '#3b82f6', '#3b82f6']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.heroGradient}
                    >
                        <View style={styles.heroContent}>
                            <View style={styles.heroTextContainer}>
                                <Text style={styles.heroTitle}>Stay Focused 🎯</Text>
                                <Text style={styles.heroSubtitle}>
                                    {completedGoals.length > 0
                                        ? `You've completed ${completedGoals.length} goal${completedGoals.length > 1 ? 's' : ''}. Keep the momentum going!`
                                        : 'Turn your ambitions into achievable goals. Start tracking today!'
                                    }
                                </Text>
                            </View>
                            <View style={styles.heroIconContainer}>
                                <Sparkles size={24} color="#FFFFFF" />
                            </View>
                        </View>
                    </LinearGradient>
                </Animated.View>

                {/* Stats Cards */}
                <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.statsRow}>
                    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor }]}>
                        <View style={[styles.statIconBox, { backgroundColor: '#3B82F615' }]}>
                            <Target size={18} color="#3B82F6" />
                        </View>
                        <Text style={[styles.statValue, { color: textPrimary }]}>{finalGoals.length}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>Total</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor }]}>
                        <View style={[styles.statIconBox, { backgroundColor: '#10B98115' }]}>
                            <Zap size={18} color="#10B981" />
                        </View>
                        <Text style={[styles.statValue, { color: textPrimary }]}>{activeGoals.length}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>Active</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor }]}>
                        <View style={[styles.statIconBox, { backgroundColor: '#F59E0B15' }]}>
                            <Trophy size={18} color="#F59E0B" />
                        </View>
                        <Text style={[styles.statValue, { color: textPrimary }]}>{completedGoals.length}</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>Done</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor }]}>
                        <View style={[styles.statIconBox, { backgroundColor: '#3b82f615' }]}>
                            <TrendingUp size={18} color="#3b82f6" />
                        </View>
                        <Text style={[styles.statValue, { color: textPrimary }]}>{avgProgress}%</Text>
                        <Text style={[styles.statLabel, { color: textSecondary }]}>Progress</Text>
                    </View>
                </Animated.View>

                {/* CTA Banner for Creating Goals */}
                {finalGoals.length < 3 && (
                    <AnimatedPressable
                        onPress={() => router.push('/goals')}
                        style={[styles.ctaBanner, { borderColor }]}
                        entering={FadeInDown.duration(400).delay(200)}
                        hapticFeedback="medium"
                    >
                        <LinearGradient
                            colors={['#F59E0B', '#EF4444']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.ctaContent}>
                            <View style={styles.ctaLeft}>
                                <View style={styles.ctaIconBox}>
                                    <Star size={20} color="#FFFFFF" />
                                </View>
                                <View style={styles.ctaText}>
                                    <Text style={styles.ctaTitle}>Create Your First Goal</Text>
                                    <Text style={styles.ctaSubtitle}>Set targets and track your progress</Text>
                                </View>
                            </View>
                            <ChevronRight size={20} color="#FFFFFF" />
                        </View>
                    </AnimatedPressable>
                )}

                {/* Urgent Goals Alert */}
                {highPriorityGoals.length > 0 && statusFilter === 'all' && !isSearchActive && (
                    <AnimatedPressable
                        onPress={() => {
                            setStatusFilter('active');
                            setSortBy('priority');
                        }}
                        style={[styles.alertBanner, { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.15)' }]}
                        entering={FadeInDown.duration(400).delay(150)}
                    >
                        <View style={styles.alertIconBox}>
                            <Timer size={16} color="#EF4444" />
                        </View>
                        <Text style={[styles.alertText, { color: '#EF4444' }]}>
                            {highPriorityGoals.length} high-priority goal{highPriorityGoals.length > 1 ? 's' : ''} need{highPriorityGoals.length === 1 ? 's' : ''} attention
                        </Text>
                        <ChevronRight size={16} color="#EF4444" />
                    </AnimatedPressable>
                )}

                {/* Search Bar */}
                <View style={[styles.searchBar, { backgroundColor: inputBg, borderColor }]}>
                    <Search size={18} color={textSecondary} />
                    <TextInput
                        style={[styles.searchInput, { color: textPrimary }]}
                        placeholder="Search goals..."
                        placeholderTextColor={textSecondary}
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                    />
                    {isSearchActive && (
                        <TouchableOpacity onPress={() => { setSearchTerm(''); setStatusFilter('all'); }} style={styles.clearBtn}>
                            <X size={16} color={textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Status Filter Tabs */}
                <View style={styles.statusTabs}>
                    {statusOptions.map(opt => (
                        <TouchableOpacity
                            key={opt.value}
                            onPress={() => setStatusFilter(opt.value)}
                            style={[
                                styles.statusTab,
                                {
                                    backgroundColor: statusFilter === opt.value ? `${colors.accent}15` : 'transparent',
                                    borderColor: statusFilter === opt.value ? colors.accent : 'transparent',
                                }
                            ]}
                        >
                            <opt.icon size={14} color={statusFilter === opt.value ? colors.accent : textSecondary} />
                            <Text style={[
                                styles.statusTabText,
                                { color: statusFilter === opt.value ? colors.accent : textSecondary }
                            ]}>
                                {opt.label}
                            </Text>
                            <View style={[
                                styles.statusCount,
                                { backgroundColor: statusFilter === opt.value ? `${colors.accent}20` : `${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}` }
                            ]}>
                                <Text style={[
                                    styles.statusCountText,
                                    { color: statusFilter === opt.value ? colors.accent : textSecondary }
                                ]}>
                                    {opt.count}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Sort Button */}
                <TouchableOpacity
                    onPress={() => setShowSortMenu(true)}
                    style={[styles.sortButton, { backgroundColor: inputBg, borderColor }]}
                >
                    <ArrowUpDown size={16} color={textSecondary} />
                    <Text style={[styles.sortButtonText, { color: textSecondary }]}>
                        Sort: {sortOptions.find(s => s.value === sortBy)?.label}
                    </Text>
                </TouchableOpacity>

                {/* Goals List */}
                <View style={styles.goalsList}>
                    {finalGoals.length > 0 ? (
                        finalGoals.map((goal, index) => (
                            <Animated.View
                                key={goal.id}
                                entering={FadeInUp.delay(index * 60).duration(300).springify()}
                            >
                                <GoalCard
                                    goal={goal}
                                    onComplete={async (id) => updateGoal(id, { status: 'completed', progress: 100 })}
                                    onReopen={async (id) => updateGoal(id, { status: 'active', progress: 0 })}
                                    onDelete={deleteGoal as any}
                                    getDaysUntil={getDaysUntil}
                                />
                            </Animated.View>
                        ))
                    ) : (
                        <View style={styles.emptyState}>
                            <View style={[styles.emptyIconBox, { backgroundColor: `${colors.accent}10` }]}>
                                <BookmarkCheck size={48} color={colors.accent} />
                            </View>
                            <Text style={[styles.emptyTitle, { color: textPrimary }]}>
                                {searchTerm ? 'No matching goals' : 'No goals yet'}
                            </Text>
                            <Text style={[styles.emptyDesc, { color: textSecondary }]}>
                                {searchTerm
                                    ? 'Try adjusting your search or filters'
                                    : 'Start by creating your first goal to track progress and stay motivated'
                                }
                            </Text>
                            {!searchTerm && (
                                <AnimatedPressable
                                    onPress={() => router.push('/goals')}
                                    style={[styles.emptyCtaBtn, { backgroundColor: colors.accent }]}
                                    entering={FadeInUp.duration(400).delay(100)}
                                    hapticFeedback="medium"
                                >
                                    <Plus size={18} color="#FFFFFF" />
                                    <Text style={styles.emptyCtaText}>Create Goal</Text>
                                </AnimatedPressable>
                            )}
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Sort Menu Modal */}
            {showSortMenu && (
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowSortMenu(false)} />
                    <View style={[styles.sortMenu, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                        <Text style={[styles.sortMenuTitle, { color: textPrimary }]}>Sort By</Text>
                        {sortOptions.map(opt => {
                            const isActive = sortBy === opt.value;
                            const Icon = opt.icon;
                            return (
                                <TouchableOpacity
                                    key={opt.value}
                                    style={[styles.sortMenuItem, isActive && { backgroundColor: `${colors.accent}08` }]}
                                    onPress={() => {
                                        setSortBy(opt.value);
                                        setShowSortMenu(false);
                                    }}
                                >
                                    <Icon size={18} color={isActive ? colors.accent : textSecondary} style={{ marginRight: 12 }} />
                                    <Text style={[styles.sortMenuItemText, { color: isActive ? colors.accent : textPrimary }]}>
                                        {opt.label}
                                    </Text>
                                    {isActive && (
                                        <CheckCircle2 size={18} color={colors.accent} />
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    scrollContent: { paddingBottom: 40 },

    heroBanner: {
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 24,
        overflow: 'hidden',
    },
    heroGradient: {
        padding: 20,
    },
    heroContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    heroTextContainer: {
        flex: 1,
        paddingRight: 16,
    },
    heroTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#FFFFFF',
        marginBottom: 8,
    },
    heroSubtitle: {
        fontSize: 14,
        lineHeight: 20,
        color: 'rgba(255,255,255,0.85)',
    },
    heroIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    statsRow: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        marginTop: 16,
        marginBottom: 16,
    },
    statCard: {
        flex: 1,
        padding: 14,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
    },
    statIconBox: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    statValue: {
        fontSize: 20,
        fontWeight: '800',
    },
    statLabel: {
        fontSize: 10,
        fontWeight: '600',
        marginTop: 2,
    },

    ctaBanner: {
        marginHorizontal: 16,
        marginBottom: 16,
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
    },
    ctaContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        position: 'relative',
    },
    ctaLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        flex: 1,
    },
    ctaIconBox: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    ctaText: {
        flex: 1,
    },
    ctaTitle: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 2,
    },
    ctaSubtitle: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 12,
        lineHeight: 16,
    },

    alertBanner: {
        marginHorizontal: 16,
        marginBottom: 16,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderWidth: 1,
        gap: 12,
    },
    alertIconBox: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: 'rgba(239,68,68,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    alertText: {
        fontSize: 13,
        fontWeight: '600',
        flex: 1,
    },

    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        height: 48,
        borderRadius: 16,
        borderWidth: 1,
        marginHorizontal: 16,
        marginBottom: 12,
    },
    searchInput: { flex: 1, fontSize: 14, marginLeft: 10, height: '100%' },
    clearBtn: { padding: 6 },

    statusTabs: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        marginBottom: 12,
        gap: 8,
    },
    statusTab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        gap: 8,
    },
    statusTabText: {
        fontSize: 13,
        fontWeight: '600',
    },
    statusCount: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
        minWidth: 20,
        alignItems: 'center',
    },
    statusCountText: {
        fontSize: 11,
        fontWeight: '700',
    },

    sortButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        marginHorizontal: 16,
        marginBottom: 16,
        gap: 8,
    },
    sortButtonText: {
        fontSize: 13,
        fontWeight: '500',
    },

    goalsList: { padding: 16, gap: 12 },

    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    emptyIconBox: {
        width: 80,
        height: 80,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
    },
    emptyDesc: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
        paddingHorizontal: 40,
    },
    emptyCtaBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 16,
    },
    emptyCtaText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },

    headerAction: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Modal
    modalOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1000,
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sortMenu: {
        position: 'absolute',
        bottom: 100,
        left: 16,
        right: 16,
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 10,
    },
    sortMenuTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    sortMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 10,
    },
    sortMenuItemText: {
        fontSize: 15,
        fontWeight: '500',
        flex: 1,
    },
});
