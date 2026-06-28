import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
    StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    Target,
    Calendar,
    CheckCircle2,
    Trash2,
    AlertCircle,
    Bookmark,
    Save,
    Zap,
    Clock,
    X,
    Edit3,
    ChevronRight,
    ArrowLeft,
} from 'lucide-react-native';
import { useUser } from '@clerk/clerk-expo';
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { useTheme } from '../../../components/context/ThemeContext';
import { supabase } from '../../../lib/supabase';
import { useGoals } from '@edutu/core/src/hooks/useGoals';
import { PRIORITY_OPTIONS, PRIORITY_CONFIG } from '../../../components/goals';
import { ProgressBar } from '../../../components/ui/ProgressBar';

export default function GoalDetailScreen() {
    const { colors, isDark } = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { user } = useUser();
    const { goals, updateGoal, deleteGoal, toggleReminder } = useGoals(supabase, user?.id || null);

    const goal = goals.find(g => g.id === id);

    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState(goal?.title || '');
    const [description, setDescription] = useState(goal?.description || '');
    const [priority, setPriority] = useState(goal?.priority || 'medium');
    const [progress, setProgress] = useState(goal?.progress || 0);
    const [deadline, setDeadline] = useState(goal?.deadline?.split('T')[0] || '');
    const [loading, setLoading] = useState(false);

    if (!goal) {
        return (
            <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
                <ScreenHeader title="Goal Not Found" showBack />
                <View style={styles.notFoundContainer}>
                    <AlertCircle size={48} color={isDark ? '#64748B' : '#94a3b8'} />
                    <Text style={[styles.notFoundTitle, { color: colors.foreground }]}>Goal Not Found</Text>
                    <Text style={[styles.notFoundDesc, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                        This goal may have been deleted or you don't have access to it.
                    </Text>
                    <TouchableOpacity
                        onPress={() => router.push('/goals')}
                        style={[styles.notFoundBtn, { backgroundColor: colors.accent }]}
                    >
                        <Text style={styles.notFoundBtnText}>Back to Goals</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    const isFromRoadmap = goal.source === 'imported';
    const daysUntil = goal.deadline ? Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
    const isOverdue = daysUntil !== null && daysUntil < 0 && goal.status === 'active';
    const isCompleted = goal.status === 'completed';
    const priorityConfig = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;

    const handleSave = async () => {
        if (!title.trim()) {
            Alert.alert('Error', 'Please enter a goal title');
            return;
        }

        setLoading(true);
        try {
            await updateGoal(goal.id, {
                title: title.trim(),
                description: description.trim(),
                priority,
                progress,
                deadline: deadline ? new Date(deadline).toISOString() : undefined,
            });
            setIsEditing(false);
            Alert.alert('Success', 'Goal updated successfully');
        } catch {
            Alert.alert('Error', 'Failed to update goal');
        } finally {
            setLoading(false);
        }
    };

    const handleComplete = async () => {
        try {
            await updateGoal(goal.id, { status: 'completed', progress: 100 });
            Alert.alert('🎉 Congratulations!', 'You\'ve completed this goal!');
        } catch {
            Alert.alert('Error', 'Failed to complete goal');
        }
    };

    const handleDelete = () => {
        Alert.alert(
            'Delete Goal',
            `Are you sure you want to delete "${goal.title}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteGoal(goal.id);
                            router.push('/goals');
                        } catch {
                            Alert.alert('Error', 'Failed to delete goal');
                        }
                    }
                }
            ]
        );
    };

    const handleToggleReminder = async () => {
        if (!goal.deadline) {
            Alert.alert('No Deadline', 'Set a deadline first to enable reminders.');
            return;
        }

        try {
            await toggleReminder(goal.id, !goal.reminder_enabled, goal.deadline);
            Alert.alert(
                goal.reminder_enabled ? 'Reminder Disabled' : 'Reminder Enabled',
                goal.reminder_enabled ? 'You won\'t receive reminders for this goal.' : `You'll be reminded on ${new Date(goal.deadline).toLocaleDateString()}`
            );
        } catch {
            Alert.alert('Error', 'Failed to toggle reminder');
        }
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setTitle(goal.title);
        setDescription(goal.description || '');
        setPriority(goal.priority || 'medium');
        setProgress(goal.progress);
        setDeadline(goal.deadline?.split('T')[0] || '');
    };

    const deadlineLabel = goal.deadline
        ? isOverdue
            ? `${Math.abs(daysUntil!)} days overdue`
            : daysUntil === 0
                ? 'Today'
                : daysUntil === 1
                    ? 'Tomorrow'
                    : `${daysUntil} days left`
        : null;

    const deadlineColor = goal.deadline
        ? isOverdue
            ? '#ef4444'
            : daysUntil! <= 2
                ? '#f59e0b'
                : colors.foreground
        : null;

    const textSecondary = isDark ? '#94a3b8' : '#64748b';
    const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#ffffff';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
    const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc';

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={isEditing ? 'Edit Goal' : 'Goal Details'}
                showBack
                right={
                    <TouchableOpacity
                        onPress={() => isEditing ? handleSave() : setIsEditing(true)}
                        disabled={loading}
                        style={[styles.headerActionBtn, { backgroundColor: colors.accent }]}
                    >
                        {loading ? (
                            <ActivityIndicator color="white" size="small" />
                        ) : isEditing ? (
                            <Save size={18} color="white" />
                        ) : (
                            <Edit3 size={18} color="white" />
                        )}
                    </TouchableOpacity>
                }
            />

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Main Info Card */}
                <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                    {/* Header with icon and priority */}
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconBox, isFromRoadmap ? styles.iconBoxRoadmap : styles.iconBoxCustom]}>
                            {isFromRoadmap ? (
                                <Bookmark size={22} color="#f59e0b" />
                            ) : (
                                <Target size={22} color={colors.accent} />
                            )}
                        </View>
                        <View style={styles.headerInfo}>
                            <Text style={[styles.sourceLabel, { color: textSecondary }]}>
                                {isFromRoadmap ? 'From Roadmap' : 'Personal Goal'}
                            </Text>
                            {goal.opportunity_title && (
                                <Text style={[styles.oppTitle, { color: colors.accent }]}>{goal.opportunity_title}</Text>
                            )}
                        </View>
                        <View style={[styles.priorityBadge, { backgroundColor: `${priorityConfig.color}15` }]}>
                            <View style={[styles.priorityDot, { backgroundColor: priorityConfig.color }]} />
                            <Text style={[styles.priorityText, { color: priorityConfig.color }]}>
                                {priorityConfig.label}
                            </Text>
                        </View>
                    </View>

                    {/* Title */}
                    {isEditing ? (
                        <TextInput
                            style={[styles.titleInput, { backgroundColor: inputBg, color: colors.foreground, borderColor }]}
                            value={title}
                            onChangeText={setTitle}
                            placeholder="Goal title"
                            placeholderTextColor={textSecondary}
                        />
                    ) : (
                        <Text style={[styles.title, { color: colors.foreground }]}>{goal.title}</Text>
                    )}

                    {/* Description */}
                    {isEditing ? (
                        <TextInput
                            style={[styles.descInput, { backgroundColor: inputBg, color: colors.foreground, borderColor }]}
                            value={description}
                            onChangeText={setDescription}
                            placeholder="Add a description..."
                            placeholderTextColor={textSecondary}
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                        />
                    ) : goal.description ? (
                        <Text style={[styles.description, { color: textSecondary }]}>{goal.description}</Text>
                    ) : null}

                    {/* Progress Section */}
                    <View style={styles.progressSection}>
                        <View style={styles.progressHeader}>
                            <Text style={[styles.progressLabel, { color: textSecondary }]}>Progress</Text>
                            <Text style={[styles.progressValue, { color: colors.foreground }]}>{Math.round(isEditing ? progress : goal.progress)}%</Text>
                        </View>
                        <ProgressBar progress={isEditing ? progress : goal.progress} />
                        {isEditing && (
                            <View style={styles.progressButtons}>
                                {[0, 25, 50, 75, 100].map(p => (
                                    <TouchableOpacity
                                        key={p}
                                        onPress={() => setProgress(p)}
                                        style={[
                                            styles.progressBtn,
                                            {
                                                backgroundColor: progress === p ? colors.accent : inputBg,
                                                borderColor: progress === p ? colors.accent : borderColor,
                                            }
                                        ]}
                                    >
                                        <Text style={[
                                            styles.progressBtnText,
                                            { color: progress === p ? 'white' : textSecondary }
                                        ]}>
                                            {p}%
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
                </View>

                {/* Details Card */}
                <View style={[styles.detailsCard, { backgroundColor: cardBg, borderColor }]}>
                    <Text style={[styles.detailsTitle, { color: colors.foreground }]}>Details</Text>

                    {/* Priority (Edit Mode) */}
                    {isEditing && (
                        <View style={styles.detailRow}>
                            <View style={styles.detailLabelRow}>
                                <Target size={18} color={textSecondary} />
                                <Text style={[styles.detailLabel, { color: textSecondary }]}>Priority</Text>
                            </View>
                            <View style={styles.priorityEditRow}>
                                {PRIORITY_OPTIONS.map(p => (
                                    <TouchableOpacity
                                        key={p.id}
                                        onPress={() => setPriority(p.id as 'low' | 'medium' | 'high')}
                                        style={[
                                            styles.priorityEditBtn,
                                            {
                                                backgroundColor: priority === p.id ? `${p.color}15` : inputBg,
                                                borderColor: priority === p.id ? p.color : borderColor,
                                            }
                                        ]}
                                    >
                                        <View style={[styles.priorityEditDot, { backgroundColor: p.color }]} />
                                        <Text style={[
                                            styles.priorityEditLabel,
                                            { color: priority === p.id ? p.color : textSecondary }
                                        ]}>
                                            {p.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* Deadline */}
                    <View style={[styles.detailRow, styles.detailRowBorder, { borderTopColor: borderColor }]}>
                        <View style={styles.detailLabelRow}>
                            <Calendar size={18} color={textSecondary} />
                            <Text style={[styles.detailLabel, { color: textSecondary }]}>Deadline</Text>
                        </View>
                        {isEditing ? (
                            <TextInput
                                style={[styles.deadlineInput, { backgroundColor: inputBg, color: colors.foreground, borderColor }]}
                                value={deadline}
                                onChangeText={setDeadline}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor={textSecondary}
                            />
                        ) : goal.deadline ? (
                            <View style={styles.deadlineInfo}>
                                <Text style={[styles.deadlineMain, { color: deadlineColor || colors.foreground }]}>
                                    {deadlineLabel}
                                </Text>
                                <Text style={[styles.deadlineSub, { color: textSecondary }]}>
                                    {new Date(goal.deadline).toLocaleDateString()}
                                </Text>
                            </View>
                        ) : (
                            <Text style={[styles.noDeadline, { color: textSecondary }]}>No deadline</Text>
                        )}
                    </View>

                    {/* Reminder */}
                    {goal.deadline && !isEditing && (
                        <View style={[styles.detailRow, styles.detailRowBorder, { borderTopColor: borderColor }]}>
                            <View style={styles.detailLabelRow}>
                                <Zap size={18} color={goal.reminder_enabled ? colors.accent : textSecondary} />
                                <Text style={[styles.detailLabel, { color: textSecondary }]}>Reminder</Text>
                            </View>
                            <TouchableOpacity
                                onPress={handleToggleReminder}
                                style={[styles.reminderToggle, { backgroundColor: goal.reminder_enabled ? `${colors.accent}15` : inputBg }]}
                            >
                                <Text style={[
                                    styles.reminderToggleText,
                                    { color: goal.reminder_enabled ? colors.accent : textSecondary }
                                ]}>
                                    {goal.reminder_enabled ? 'Enabled' : 'Disabled'}
                                </Text>
                                <ChevronRight size={16} color={goal.reminder_enabled ? colors.accent : textSecondary} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Status */}
                    {!isEditing && (
                        <View style={[styles.detailRow, styles.detailRowBorder, { borderTopColor: borderColor }]}>
                            <View style={styles.detailLabelRow}>
                                {isCompleted ? (
                                    <CheckCircle2 size={18} color="#10b981" />
                                ) : (
                                    <Clock size={18} color={isOverdue ? '#ef4444' : textSecondary} />
                                )}
                                <Text style={[styles.detailLabel, { color: textSecondary }]}>Status</Text>
                            </View>
                            <View style={[styles.statusBadge, {
                                backgroundColor: isCompleted ? 'rgba(16, 185, 129, 0.15)' : isOverdue ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)'
                            }]}>
                                <Text style={[
                                    styles.statusText,
                                    { color: isCompleted ? '#10b981' : isOverdue ? '#ef4444' : '#3b82f6' }
                                ]}>
                                    {isCompleted ? 'Completed' : isOverdue ? 'Overdue' : 'In Progress'}
                                </Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* Action Buttons */}
                {!isEditing && (
                    <View style={styles.actionsContainer}>
                        {!isCompleted ? (
                            <TouchableOpacity
                                onPress={handleComplete}
                                style={[styles.primaryActionBtn, { backgroundColor: colors.accent }]}
                            >
                                <CheckCircle2 size={20} color="white" />
                                <Text style={styles.primaryActionText}>Mark as Complete</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                onPress={() => updateGoal(goal.id, { status: 'active', progress: 0 })}
                                style={[styles.secondaryActionBtn, { backgroundColor: inputBg, borderColor }]}
                            >
                                <Clock size={20} color={textSecondary} />
                                <Text style={[styles.secondaryActionText, { color: textSecondary }]}>Reopen Goal</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            onPress={handleDelete}
                            style={[styles.dangerActionBtn, { borderColor }]}
                        >
                            <Trash2 size={18} color="#ef4444" />
                            <Text style={styles.dangerActionText}>Delete Goal</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {isEditing && (
                    <TouchableOpacity
                        onPress={handleCancelEdit}
                        style={[styles.secondaryActionBtn, { backgroundColor: inputBg, borderColor }]}
                    >
                        <X size={20} color={textSecondary} />
                        <Text style={[styles.secondaryActionText, { color: textSecondary }]}>Cancel Editing</Text>
                    </TouchableOpacity>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    notFoundContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    notFoundTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 16,
        marginBottom: 8,
    },
    notFoundDesc: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    notFoundBtn: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
    },
    notFoundBtnText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 15,
    },
    headerActionBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    card: {
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        marginBottom: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
        flexShrink: 0,
    },
    iconBoxRoadmap: {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
    },
    iconBoxCustom: {
        backgroundColor: 'rgba(99, 102, 241, 0.15)',
    },
    headerInfo: {
        flex: 1,
    },
    sourceLabel: {
        fontSize: 12,
        marginBottom: 2,
    },
    oppTitle: {
        fontSize: 12,
        fontWeight: '600',
    },
    priorityBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        gap: 6,
    },
    priorityDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    priorityText: {
        fontSize: 11,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 12,
        lineHeight: 28,
    },
    titleInput: {
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 18,
        fontWeight: '600',
        borderWidth: 1,
        marginBottom: 12,
    },
    description: {
        fontSize: 15,
        lineHeight: 22,
        marginBottom: 20,
    },
    descInput: {
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 14,
        borderWidth: 1,
        minHeight: 80,
        marginBottom: 20,
    },
    progressSection: {
        marginTop: 8,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    progressLabel: {
        fontSize: 13,
    },
    progressValue: {
        fontWeight: 'bold',
        fontSize: 14,
    },
    progressButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
        gap: 8,
    },
    progressBtn: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
    },
    progressBtnText: {
        fontSize: 12,
        fontWeight: '600',
    },
    detailsCard: {
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        marginBottom: 16,
    },
    detailsTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 16,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
    },
    detailRowBorder: {
        borderTopWidth: 1,
        marginTop: 4,
        paddingTop: 12,
    },
    detailLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    detailLabel: {
        fontSize: 14,
    },
    deadlineInput: {
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        borderWidth: 1,
    },
    deadlineInfo: {
        alignItems: 'flex-end',
    },
    deadlineMain: {
        fontSize: 14,
        fontWeight: '600',
    },
    deadlineSub: {
        fontSize: 12,
        marginTop: 2,
    },
    noDeadline: {
        fontSize: 14,
    },
    reminderToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 4,
    },
    reminderToggleText: {
        fontSize: 13,
        fontWeight: '600',
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    statusText: {
        fontSize: 13,
        fontWeight: '600',
    },
    priorityEditRow: {
        flexDirection: 'row',
        gap: 8,
    },
    priorityEditBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
        gap: 4,
    },
    priorityEditDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    priorityEditLabel: {
        fontSize: 12,
        fontWeight: '600',
    },
    actionsContainer: {
        marginBottom: 16,
    },
    primaryActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 14,
        gap: 10,
        marginBottom: 10,
    },
    primaryActionText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 15,
    },
    secondaryActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: 1,
        gap: 10,
        marginBottom: 10,
    },
    secondaryActionText: {
        fontWeight: '600',
        fontSize: 15,
    },
    dangerActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: 1,
        gap: 10,
    },
    dangerActionText: {
        color: '#ef4444',
        fontWeight: '600',
        fontSize: 15,
    },
});
