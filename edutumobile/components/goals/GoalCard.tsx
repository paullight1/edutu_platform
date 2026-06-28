import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Alert } from 'react-native';
import { Calendar, Zap, CheckCircle2, RefreshCcw, Trash2, Map, Target, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import type { Goal } from '@edutu/core/src/hooks/useGoals';
import { useTheme } from '../context/ThemeContext';
import { ProgressBar } from '../ui/ProgressBar';
import { PRIORITY_CONFIG } from './constants';

interface GoalCardProps {
    goal: Goal;
    onComplete?: (goalId: string) => void;
    onReopen?: (goalId: string) => void;
    onDelete?: (goal: Goal) => void;
    onToggleReminder?: (goal: Goal) => void;
    getDaysUntil?: (deadline: string | null | undefined) => number;
    compact?: boolean;
}

export function GoalCard({
    goal,
    onComplete,
    onReopen,
    onDelete,
    onToggleReminder,
    getDaysUntil,
    compact = false
}: GoalCardProps) {
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const isFromRoadmap = goal.source === 'imported';
    const hasDeadline = !!goal.deadline;
    const daysUntil = (hasDeadline && getDaysUntil) ? getDaysUntil(goal.deadline) : null;
    const isOverdue = daysUntil !== null && daysUntil < 0 && goal.status === 'active';
    const isCompleted = goal.status === 'completed';
    const priorityConfig = PRIORITY_CONFIG[goal.priority || 'medium'];

    const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#ffffff';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
    const textSecondary = isDark ? '#94a3b8' : '#64748b';

    const handleDelete = () => {
        Alert.alert(
            'Delete Goal',
            `Are you sure you want to delete "${goal.title}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => onDelete?.(goal)
                }
            ]
        );
    };

    if (compact) {
        return (
            <TouchableOpacity
                onPress={() => router.push(`/goals/${goal.id}`)}
                activeOpacity={0.85}
                style={[styles.compactCard, { backgroundColor: cardBg, borderColor }]}
            >
                <View style={styles.compactHeader}>
                    <View style={[styles.compactIcon, { backgroundColor: isFromRoadmap ? 'rgba(245, 158, 11, 0.15)' : `${colors.accent}15` }]}>
                        {isFromRoadmap ? <Map size={16} color="#f59e0b" /> : <Target size={16} color={colors.accent} />}
                    </View>
                    <Text style={[styles.compactTitle, { color: colors.foreground }]} numberOfLines={2}>{goal.title}</Text>
                </View>
                <View style={styles.compactProgress}>
                    <ProgressBar progress={goal.progress} size="sm" />
                    <Text style={[styles.compactProgressText, { color: textSecondary }]}>{Math.round(goal.progress)}%</Text>
                </View>
                {hasDeadline && (
                    <View style={[styles.compactDeadline, { backgroundColor: isOverdue ? 'rgba(239, 68, 68, 0.1)' : `${isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc'}` }]}>
                        <Calendar size={12} color={isOverdue ? '#ef4444' : daysUntil! <= 2 ? '#f59e0b' : textSecondary} />
                        <Text style={[
                            styles.compactDeadlineText,
                            { color: isOverdue ? '#f87171' : daysUntil! <= 2 ? '#fbbf24' : textSecondary }
                        ]}>
                            {isOverdue ? `${Math.abs(daysUntil)}d overdue` : daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d left`}
                        </Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity
            onPress={() => router.push(`/goals/${goal.id}`)}
            activeOpacity={0.85}
        >
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: isOverdue ? 'rgba(239, 68, 68, 0.3)' : borderColor }]}>
                <View style={styles.headerRow}>
                    <View style={[styles.iconBox, isFromRoadmap ? styles.iconBoxRoadmap : styles.iconBoxCustom]}>
                        {isFromRoadmap ? (
                            <Map size={20} color="#f59e0b" />
                        ) : (
                            <Target size={20} color={colors.accent} />
                        )}
                    </View>

                    <View style={styles.titleContainer}>
                        <Text style={[styles.titleText, { color: colors.foreground }]} numberOfLines={2}>
                            {goal.title}
                        </Text>
                        {goal.opportunity_title && (
                            <Text style={[styles.subtitleText, { color: textSecondary }]} numberOfLines={1}>
                                {goal.opportunity_title}
                            </Text>
                        )}
                    </View>

                    <View style={[styles.priorityBadge, { backgroundColor: priorityConfig.bg }]}>
                        <Text style={[styles.priorityText, { color: priorityConfig.color }]}>
                            {priorityConfig.label}
                        </Text>
                    </View>
                </View>

                <View style={styles.progressContainer}>
                    <View style={styles.progressHeader}>
                        <Text style={[styles.progressLabel, { color: textSecondary }]}>Progress</Text>
                        <Text style={[styles.progressValue, { color: colors.foreground }]}>{Math.round(goal.progress)}%</Text>
                    </View>
                    <ProgressBar progress={goal.progress} />
                </View>

                <View style={styles.footerRow}>
                    <View style={styles.footerLeft}>
                        {hasDeadline && (
                            <View style={[
                                styles.deadlineBadge,
                                { backgroundColor: isOverdue ? 'rgba(239, 68, 68, 0.1)' : `${isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc'}` },
                            ]}>
                                <Calendar size={12} color={isOverdue ? '#ef4444' : daysUntil! <= 2 ? '#f59e0b' : textSecondary} />
                                <Text style={[
                                    styles.deadlineText,
                                    { color: isOverdue ? '#f87171' : daysUntil! <= 2 ? '#fbbf24' : textSecondary }
                                ]}>
                                    {isOverdue ? `${Math.abs(daysUntil!)}d overdue` : daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d left`}
                                </Text>
                            </View>
                        )}

                        {hasDeadline && onToggleReminder && (
                            <TouchableOpacity
                                onPress={(e) => {
                                    e.stopPropagation();
                                    onToggleReminder(goal);
                                }}
                                style={[styles.reminderBtn, { backgroundColor: goal.reminder_enabled ? `${colors.accent}15` : 'transparent' }]}
                            >
                                <Zap size={14} color={goal.reminder_enabled ? colors.accent : textSecondary} />
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.footerRight}>
                        {onComplete && onReopen && (
                            <TouchableOpacity
                                onPress={(e) => {
                                    e.stopPropagation();
                                    if (isCompleted) {
                                        onReopen(goal.id);
                                    } else {
                                        onComplete(goal.id);
                                    }
                                }}
                                style={[styles.actionBtn, { backgroundColor: isCompleted ? `${isDark ? '#334155' : '#e2e8f0'}` : colors.accent }]}
                            >
                                {isCompleted ? (
                                    <RefreshCcw size={16} color={isDark ? 'white' : '#475569'} />
                                ) : (
                                    <CheckCircle2 size={16} color="white" />
                                )}
                            </TouchableOpacity>
                        )}
                        {onDelete && (
                            <TouchableOpacity
                                onPress={(e) => {
                                    e.stopPropagation();
                                    handleDelete();
                                }}
                                style={[styles.actionBtn, { marginLeft: 8, backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#fee2e2' }]}
                            >
                                <Trash2 size={16} color="#ef4444" />
                            </TouchableOpacity>
                        )}
                        <View style={[styles.chevronBox, { backgroundColor: `${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}` }]}>
                            <ChevronRight size={16} color={textSecondary} />
                        </View>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        marginBottom: 12,
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
    },
    compactCard: {
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        height: 110,
        justifyContent: 'space-between',
    },
    compactHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    compactIcon: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    compactTitle: {
        fontSize: 13,
        fontWeight: '600',
        lineHeight: 17,
        flex: 1,
    },
    compactProgress: {
        marginTop: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    compactProgressText: {
        fontSize: 11,
        fontWeight: '600',
        minWidth: 32,
    },
    compactDeadline: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        alignSelf: 'flex-start',
        gap: 4,
    },
    compactDeadlineText: {
        fontSize: 10,
        fontWeight: '600',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        flexShrink: 0,
    },
    iconBoxRoadmap: {
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
    },
    iconBoxCustom: {
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
    },
    titleContainer: {
        flex: 1,
        marginRight: 8,
    },
    titleText: {
        fontWeight: 'bold',
        fontSize: 16,
        lineHeight: 20,
        marginBottom: 4,
    },
    subtitleText: {
        fontSize: 12,
    },
    priorityBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        flexShrink: 0,
    },
    priorityText: {
        fontSize: 11,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    progressContainer: {
        marginBottom: 12,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    progressLabel: {
        fontSize: 12,
    },
    progressValue: {
        fontWeight: '600',
        fontSize: 13,
    },
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    footerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
    },
    footerRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    deadlineBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        gap: 4,
    },
    deadlineText: {
        fontSize: 11,
        fontWeight: '600',
    },
    reminderBtn: {
        padding: 8,
        borderRadius: 8,
    },
    actionBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chevronBox: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 6,
    },
});
