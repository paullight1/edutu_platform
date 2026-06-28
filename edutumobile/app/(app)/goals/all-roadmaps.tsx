import React, { useState, useMemo } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, Text, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { useTheme } from '../../../components/context/ThemeContext';
import { supabase } from '../../../lib/supabase';
import { useGoals } from '@edutu/core/src/hooks/useGoals';
import { GoalCard, useFilteredGoals } from '../../../components/goals';
import { Map, Search, X, Grid, List } from 'lucide-react-native';
import { BrandedLoader } from '../../../components/ui/BrandedLoader';

const { width } = Dimensions.get('window');
const GRID_GAP = 12;
const ITEM_WIDTH = (width - 44) / 2;

type ViewMode = 'grid' | 'list';

export default function AllRoadmapsScreen() {
    const { colors, isDark } = useTheme();
    const { user } = useUser();
    const { goals, isLoading } = useGoals(supabase, user?.id || null);

    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');

    const { filteredGoals } = useFilteredGoals({
        goals,
        activeTab: 'roadmaps',
        statusFilter: 'all',
        searchTerm: '',
    });

    const roadmapGoals = useMemo(() => {
        let result = filteredGoals;

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(g =>
                g.title.toLowerCase().includes(term) ||
                g.opportunity_title?.toLowerCase().includes(term)
            );
        }

        return result;
    }, [filteredGoals, searchTerm]);

    const groupedByOpportunity = useMemo(() => {
        const groups: Record<string, typeof roadmapGoals> = {};
        roadmapGoals.forEach(goal => {
            const key = goal.opportunity_title || 'Other';
            if (!groups[key]) groups[key] = [];
            groups[key].push(goal);
        });
        return groups;
    }, [roadmapGoals]);

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94a3b8' : '#64748b';
    const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';

    const getDaysUntil = (deadline: string | null | undefined): number => {
        if (!deadline) return 0;
        return Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    };

    if (isLoading) {
        return (
            <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
                <ScreenHeader title="Roadmap Goals" showBack />
                <View style={styles.loadingContainer}>
                    <BrandedLoader label="Loading roadmaps..." />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title="Roadmap Goals"
                showBack
                subtitle={`${roadmapGoals.length} goal${roadmapGoals.length !== 1 ? 's' : ''}`}
            />

            {/* Search and View Toggle */}
            <View style={styles.toolbar}>
                <View style={[styles.searchBar, { backgroundColor: inputBg, borderColor }]}>
                    <Search size={18} color={textSecondary} />
                    <TextInput
                        style={[styles.searchInput, { color: textPrimary }]}
                        placeholder="Search roadmaps..."
                        placeholderTextColor={textSecondary}
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                    />
                    {searchTerm.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchTerm('')} style={styles.clearBtn}>
                            <X size={16} color={textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>
                <View style={[styles.viewToggle, { backgroundColor: inputBg, borderColor }]}>
                    <TouchableOpacity
                        onPress={() => setViewMode('grid')}
                        style={[styles.viewBtn, viewMode === 'grid' && { backgroundColor: `${colors.accent}15` }]}
                    >
                        <Grid size={18} color={viewMode === 'grid' ? colors.accent : textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setViewMode('list')}
                        style={[styles.viewBtn, viewMode === 'list' && { backgroundColor: `${colors.accent}15` }]}
                    >
                        <List size={18} color={viewMode === 'list' ? colors.accent : textSecondary} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {roadmapGoals.length > 0 ? (
                    viewMode === 'grid' ? (
                        Object.entries(groupedByOpportunity).map(([oppTitle, goals]) => (
                            <View key={oppTitle} style={styles.groupSection}>
                                <View style={styles.groupHeader}>
                                    <Map size={16} color="#f59e0b" />
                                    <Text style={[styles.groupTitle, { color: textPrimary }]}>{oppTitle}</Text>
                                    <View style={[styles.groupCount, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                                        <Text style={styles.groupCountText}>{goals.length}</Text>
                                    </View>
                                </View>
                                <View style={styles.grid}>
                                    {goals.map((goal) => (
                                        <View key={goal.id} style={{ width: ITEM_WIDTH }}>
                                            <GoalCard goal={goal} compact getDaysUntil={getDaysUntil} />
                                        </View>
                                    ))}
                                </View>
                            </View>
                        ))
                    ) : (
                        Object.entries(groupedByOpportunity).map(([oppTitle, goals]) => (
                            <View key={oppTitle} style={styles.groupSection}>
                                <View style={styles.groupHeader}>
                                    <Map size={16} color="#f59e0b" />
                                    <Text style={[styles.groupTitle, { color: textPrimary }]}>{oppTitle}</Text>
                                    <View style={[styles.groupCount, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                                        <Text style={styles.groupCountText}>{goals.length}</Text>
                                    </View>
                                </View>
                                {goals.map((goal) => (
                                    <GoalCard
                                        key={goal.id}
                                        goal={goal}
                                        getDaysUntil={getDaysUntil}
                                    />
                                ))}
                            </View>
                        ))
                    )
                ) : (
                    <View style={styles.emptyState}>
                        <Map size={48} color={textSecondary} />
                        <Text style={[styles.emptyTitle, { color: textPrimary }]}>No roadmap goals</Text>
                        <Text style={[styles.emptyDesc, { color: textSecondary }]}>
                            {searchTerm ? 'Try adjusting your search' : 'Import goals from a roadmap to see them here'}
                        </Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 14,
    },
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
        gap: 10,
    },
    searchBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
    },
    searchInput: { flex: 1, fontSize: 14, marginLeft: 10, height: '100%' },
    clearBtn: { padding: 6 },
    viewToggle: {
        flexDirection: 'row',
        borderRadius: 10,
        borderWidth: 1,
        overflow: 'hidden',
    },
    viewBtn: {
        padding: 10,
    },
    scrollContent: { padding: 16 },
    groupSection: {
        marginBottom: 24,
    },
    groupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    groupTitle: {
        fontSize: 16,
        fontWeight: '700',
        flex: 1,
    },
    groupCount: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        minWidth: 20,
        alignItems: 'center',
    },
    groupCountText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#f59e0b',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: GRID_GAP,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginTop: 16,
        marginBottom: 8,
    },
    emptyDesc: {
        fontSize: 14,
        textAlign: 'center',
    },
});
