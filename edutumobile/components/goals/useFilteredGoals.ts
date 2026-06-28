import { useMemo } from 'react';
import type { Goal } from '@edutu/core/src/hooks/useGoals';
import { PRIORITY_ORDER } from './constants';

export type GoalTab = 'all' | 'roadmaps' | 'custom';
export type GoalStatusFilter = 'all' | 'active' | 'completed';

interface UseFilteredGoalsOptions {
    goals: Goal[];
    activeTab: GoalTab;
    statusFilter: GoalStatusFilter;
    searchTerm: string;
}

export function useFilteredGoals({ goals, activeTab, statusFilter, searchTerm }: UseFilteredGoalsOptions) {
    const filteredGoals = useMemo(() => {
        let filtered = goals;

        if (activeTab === 'roadmaps') {
            filtered = filtered.filter(g => g.source === 'imported');
        } else if (activeTab === 'custom') {
            filtered = filtered.filter(g => g.source === 'custom');
        }

        if (statusFilter === 'active') {
            filtered = filtered.filter(g => g.status === 'active');
        } else if (statusFilter === 'completed') {
            filtered = filtered.filter(g => g.status === 'completed');
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(g =>
                g.title.toLowerCase().includes(term) ||
                g.opportunity_title?.toLowerCase().includes(term) ||
                g.category?.toLowerCase().includes(term)
            );
        }

        return filtered.sort((a, b) => {
            const priorityDiff = (PRIORITY_ORDER[a.priority || 'medium'] || 1) - (PRIORITY_ORDER[b.priority || 'medium'] || 1);
            if (priorityDiff !== 0) return priorityDiff;

            if (a.deadline && b.deadline) {
                return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
            }
            if (a.deadline) return -1;
            if (b.deadline) return 1;

            return 0;
        });
    }, [goals, activeTab, statusFilter, searchTerm]);

    const stats = useMemo(() => {
        const { Target, Award, Map, Flame } = require('lucide-react-native');
        const active = goals.filter(g => g.status === 'active');
        const completed = goals.filter(g => g.status === 'completed');
        const fromRoadmaps = goals.filter(g => g.source === 'imported');
        const highPriority = goals.filter(g => g.status === 'active' && g.priority === 'high');

        return [
            { label: 'Active', value: active.length, icon: Target, color: '#3b82f6', gradient: ['#3B82F6', '#6366F1'] },
            { label: 'Completed', value: completed.length, icon: Award, color: '#10b981', gradient: ['#10B981', '#059669'] },
            { label: 'From Roadmaps', value: fromRoadmaps.length, icon: Map, color: '#f59e0b', gradient: ['#F59E0B', '#EF4444'] },
            { label: 'High Priority', value: highPriority.length, icon: Flame, color: '#ef4444', gradient: ['#EF4444', '#DC2626'] },
        ];
    }, [goals]);

    const upcomingGoals = useMemo(() => {
        const now = new Date();
        const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

        return goals
            .filter(g => g.status === 'active' && g.deadline)
            .filter(g => new Date(g.deadline!) <= threeDays)
            .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
            .slice(0, 5);
    }, [goals]);

    return { filteredGoals, stats, upcomingGoals };
}

export function useDaysUntil(deadline: string | null | undefined): number {
    return useMemo(() => {
        if (!deadline) return 0;
        return Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }, [deadline]);
}
