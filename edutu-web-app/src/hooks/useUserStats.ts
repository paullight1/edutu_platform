/**
 * useUserStats Hook
 * Provides real-time statistics for the dashboard cards:
 * - Active Goals count
 * - Consistency percentage (based on task completion)
 * - Average Progress across goals
 * - Next Deadline
 */

import { useState, useEffect, useMemo } from 'react';
import { useGoals } from './useGoals';
import { taskTrackingService, type CompletedTask } from '../services/taskTrackingService';

interface UserStats {
    activeGoals: number;
    completedGoals: number;
    consistency: number;
    avgProgress: number;
    nextDeadline: {
        date: string | null;
        daysUntil: number | null;
        goalTitle: string | null;
    };
    isLoading: boolean;
}

export function useUserStats(userId?: string): UserStats {
    const { goals, isLoading: goalsLoading } = useGoals();
    const [consistencyData, setConsistencyData] = useState<{ rate: number; isLoading: boolean }>({
        rate: 0,
        isLoading: true,
    });

    // Calculate active and completed goals
    const activeGoals = useMemo(
        () => goals.filter((g) => g.status === 'active'),
        [goals]
    );

    const completedGoals = useMemo(
        () => goals.filter((g) => g.status === 'completed'),
        [goals]
    );

    // Calculate average progress across active goals
    const avgProgress = useMemo(() => {
        if (activeGoals.length === 0) return 0;
        const totalProgress = activeGoals.reduce((sum, goal) => sum + (goal.progress || 0), 0);
        return Math.round(totalProgress / activeGoals.length);
    }, [activeGoals]);

    // Find the next deadline
    const nextDeadline = useMemo(() => {
        const goalsWithDeadlines = activeGoals
            .filter((g) => g.deadline)
            .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

        if (goalsWithDeadlines.length === 0) {
            return { date: null, daysUntil: null, goalTitle: null };
        }

        const nextGoal = goalsWithDeadlines[0];
        const deadlineDate = new Date(nextGoal.deadline!);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        deadlineDate.setHours(0, 0, 0, 0);

        const daysUntil = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        return {
            date: nextGoal.deadline!,
            daysUntil,
            goalTitle: nextGoal.title,
        };
    }, [activeGoals]);

    // Calculate consistency (based on recent completed tasks and active goals with progress)
    useEffect(() => {
        const calculateConsistency = () => {
            try {
                // Get tasks completed in the last 7 days
                const recentTasks = taskTrackingService.getRecentCompletedTasks(50);

                // Filter to last 7 days
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

                const recentActivity = recentTasks.filter(
                    (task: CompletedTask) => new Date(task.completedAt) >= sevenDaysAgo
                );

                if (recentActivity.length === 0) {
                    // If no activity data, base on goals progress
                    if (activeGoals.length > 0) {
                        // Estimate based on goals that have some progress
                        const goalsWithProgress = activeGoals.filter((g) => (g.progress || 0) > 0);
                        const rate = Math.round((goalsWithProgress.length / activeGoals.length) * 100);
                        setConsistencyData({ rate, isLoading: false });
                    } else {
                        setConsistencyData({ rate: 0, isLoading: false });
                    }
                    return;
                }

                // Calculate consistency based on days with activity
                const daysWithActivity = new Set(
                    recentActivity.map((a: CompletedTask) => new Date(a.completedAt).toDateString())
                ).size;
                const rate = Math.round((daysWithActivity / 7) * 100);
                setConsistencyData({ rate, isLoading: false });
            } catch (error) {
                console.error('Failed to calculate consistency:', error);
                // Fallback: use progress-based estimation
                if (activeGoals.length > 0) {
                    const avgProg = activeGoals.reduce((sum, g) => sum + (g.progress || 0), 0) / activeGoals.length;
                    setConsistencyData({ rate: Math.round(avgProg), isLoading: false });
                } else {
                    setConsistencyData({ rate: 0, isLoading: false });
                }
            }
        };

        calculateConsistency();
    }, [activeGoals]);

    return {
        activeGoals: activeGoals.length,
        completedGoals: completedGoals.length,
        consistency: consistencyData.rate,
        avgProgress,
        nextDeadline,
        isLoading: goalsLoading || consistencyData.isLoading,
    };
}

export default useUserStats;
