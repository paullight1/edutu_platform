import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import {
    Target,
    Calendar,
    Sparkles,
    Flag,
    Clock,
    Layout,
    Check,
    AlertCircle,
    Info,
} from 'lucide-react-native';
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { useTheme } from '../../../components/context/ThemeContext';
import { supabase } from '../../../lib/supabase';
import { useGoals } from '@edutu/core/src/hooks/useGoals';
import { PRIORITY_OPTIONS_WITH_DESC } from '../../../components/goals';

export default function AddGoalScreen() {
    const { colors, isDark } = useTheme();
    const router = useRouter();
    const { user } = useUser();
    const { createGoal } = useGoals(supabase, user?.id || null);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
    const [deadline, setDeadline] = useState('');
    const [loading, setLoading] = useState(false);

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94a3b8' : '#64748b';
    const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#ffffff';
    const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';

    const isTitleValid = title.trim().length >= 3;
    const isTitleTooLong = title.length > 100;
    const deadlineDate = deadline ? new Date(deadline) : null;
    const isDeadlineValid = deadlineDate && deadlineDate > new Date();
    const isDeadlinePast = deadline && deadlineDate && deadlineDate <= new Date();

    const canSubmit = isTitleValid && !isTitleTooLong && !isDeadlinePast;

    const handleCreate = async () => {
        if (!isTitleValid) {
            Alert.alert('Invalid Title', 'Goal title must be at least 3 characters');
            return;
        }
        if (isTitleTooLong) {
            Alert.alert('Title Too Long', 'Goal title must be less than 100 characters');
            return;
        }
        if (isDeadlinePast) {
            Alert.alert('Invalid Deadline', 'Deadline cannot be in the past');
            return;
        }

        setLoading(true);
        try {
            await createGoal({
                title: title.trim(),
                description: description.trim() || undefined,
                priority,
                deadline: deadline ? new Date(deadline).toISOString() : undefined,
                progress: 0,
                source: 'custom',
            });
            Alert.alert('Success', 'Goal created successfully!', [
                {
                    text: 'Create Another', onPress: () => {
                        setTitle('');
                        setDescription('');
                        setDeadline('');
                        setPriority('medium');
                    }
                },
                { text: 'Done', onPress: () => router.push('/goals') }
            ]);
        } catch {
            Alert.alert('Error', 'Failed to create goal. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const priorityConfig = PRIORITY_OPTIONS_WITH_DESC.find(p => p.id === priority)!;

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title="Create New Goal" showBack />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header Intro */}
                    <View style={styles.introBox}>
                        <View style={[styles.iconContainer, { backgroundColor: `${colors.accent}12` }]}>
                            <Target size={26} color={colors.accent} />
                        </View>
                        <View style={styles.introText}>
                            <Text style={[styles.title, { color: textPrimary }]}>Set Your Target</Text>
                            <Text style={[styles.subtitle, { color: textSecondary }]}>Define your goal and track progress towards achievement.</Text>
                        </View>
                    </View>

                    {/* Main Form Card */}
                    <View style={[styles.formCard, { backgroundColor: cardBg, borderColor }]}>
                        {/* Title Field */}
                        <View style={styles.inputGroup}>
                            <View style={styles.labelRow}>
                                <Text style={[styles.label, { color: textPrimary }]}>Goal Title</Text>
                                <Text style={[styles.charCount, { color: isTitleTooLong ? '#ef4444' : textSecondary }]}>
                                    {title.length}/100
                                </Text>
                            </View>
                            <TextInput
                                style={[
                                    styles.input,
                                    { backgroundColor: inputBg, color: textPrimary, borderColor },
                                    title.length > 0 && !isTitleValid && { borderColor: '#ef4444' },
                                    isTitleValid && { borderColor: '#10b981' },
                                ]}
                                value={title}
                                onChangeText={setTitle}
                                placeholder="What do you want to achieve?"
                                placeholderTextColor={textSecondary}
                                autoFocus
                                maxLength={100}
                            />
                            {title.length > 0 && !isTitleValid && (
                                <View style={styles.validationRow}>
                                    <AlertCircle size={12} color="#ef4444" />
                                    <Text style={styles.validationText}>Title must be at least 3 characters</Text>
                                </View>
                            )}
                            {isTitleValid && (
                                <View style={styles.validationRow}>
                                    <Check size={12} color="#10b981" />
                                    <Text style={[styles.validationText, { color: '#10b981' }]}>Looks good!</Text>
                                </View>
                            )}
                        </View>

                        {/* Description Field */}
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: textPrimary }]}>Description</Text>
                            <TextInput
                                style={[styles.input, styles.textArea, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
                                value={description}
                                onChangeText={setDescription}
                                placeholder="Add more details about this goal..."
                                placeholderTextColor={textSecondary}
                                multiline
                                numberOfLines={3}
                                textAlignVertical="top"
                            />
                        </View>

                        {/* Priority Selector */}
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: textPrimary }]}>Priority</Text>
                            <View style={styles.priorityOptions}>
                                {PRIORITY_OPTIONS_WITH_DESC.map(option => {
                                    const isSelected = priority === option.id;
                                    return (
                                        <TouchableOpacity
                                            key={option.id}
                                            onPress={() => setPriority(option.id as any)}
                                            style={[
                                                styles.priorityOption,
                                                {
                                                    backgroundColor: isSelected ? `${option.color}10` : inputBg,
                                                    borderColor: isSelected ? option.color : borderColor,
                                                }
                                            ]}
                                        >
                                            <View style={styles.priorityOptionHeader}>
                                                <View style={[styles.priorityDot, { backgroundColor: option.color }]} />
                                                <Text style={[
                                                    styles.priorityOptionLabel,
                                                    { color: isSelected ? option.color : textPrimary }
                                                ]}>
                                                    {option.label}
                                                </Text>
                                            </View>
                                            {isSelected && (
                                                <Text style={[styles.priorityDesc, { color: textSecondary }]}>
                                                    {option.description}
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Deadline Field */}
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: textPrimary }]}>Deadline</Text>
                            <View style={[styles.dateInputWrapper, {
                                backgroundColor: inputBg,
                                borderColor: isDeadlinePast ? '#ef4444' : borderColor,
                            }]}>
                                <Calendar size={18} color={isDeadlinePast ? '#ef4444' : textSecondary} />
                                <TextInput
                                    style={[styles.dateInput, { color: textPrimary }]}
                                    value={deadline}
                                    onChangeText={setDeadline}
                                    placeholder="YYYY-MM-DD"
                                    placeholderTextColor={textSecondary}
                                    keyboardType="numbers-and-punctuation"
                                />
                            </View>
                            {isDeadlinePast && (
                                <View style={styles.validationRow}>
                                    <AlertCircle size={12} color="#ef4444" />
                                    <Text style={styles.validationText}>Deadline cannot be in the past</Text>
                                </View>
                            )}
                            {isDeadlineValid && (
                                <View style={styles.validationRow}>
                                    <Info size={12} color={colors.accent} />
                                    <Text style={[styles.validationText, { color: colors.accent }]}>
                                        {Math.ceil((deadlineDate!.getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days from now
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Live Preview */}
                    {title.length > 0 && (
                        <View style={[styles.previewCard, { backgroundColor: `${colors.accent}06`, borderColor: `${colors.accent}18` }]}>
                            <View style={styles.previewHeader}>
                                <Layout size={14} color={colors.accent} />
                                <Text style={[styles.previewTag, { color: colors.accent }]}>PREVIEW</Text>
                            </View>
                            <Text style={[styles.previewTitle, { color: textPrimary }]}>{title}</Text>
                            {description.length > 0 && (
                                <Text style={[styles.previewDesc, { color: textSecondary }]} numberOfLines={2}>{description}</Text>
                            )}
                            <View style={styles.previewMeta}>
                                <View style={[styles.previewMetaItem, { backgroundColor: `${priorityConfig.color}12` }]}>
                                    <Flag size={12} color={priorityConfig.color} />
                                    <Text style={[styles.previewMetaText, { color: priorityConfig.color }]}>{priorityConfig.label}</Text>
                                </View>
                                {deadline && (
                                    <View style={[styles.previewMetaItem, { backgroundColor: `${isDeadlinePast ? '#ef4444' : colors.accent}12` }]}>
                                        <Clock size={12} color={isDeadlinePast ? '#ef4444' : colors.accent} />
                                        <Text style={[styles.previewMetaText, { color: isDeadlinePast ? '#ef4444' : colors.accent }]}>
                                            {isDeadlinePast ? 'Past date' : deadlineDate!.toLocaleDateString()}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}

                    {/* Submit Button */}
                    <TouchableOpacity
                        onPress={handleCreate}
                        disabled={loading || !canSubmit}
                        style={[
                            styles.createBtn,
                            { backgroundColor: colors.accent },
                            (!canSubmit || loading) && { opacity: 0.5 }
                        ]}
                    >
                        {loading ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <>
                                <Check size={20} color="white" strokeWidth={3} />
                                <Text style={styles.createBtnText}>Create Goal</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    scrollContent: { padding: 20 },
    introBox: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
    iconContainer: {
        width: 52,
        height: 52,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
        flexShrink: 0,
    },
    introText: { flex: 1 },
    title: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
    subtitle: { fontSize: 13, lineHeight: 18 },

    formCard: {
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        marginBottom: 20,
    },
    inputGroup: { marginBottom: 20 },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        marginLeft: 4,
    },
    label: { fontSize: 14, fontWeight: '700' },
    charCount: { fontSize: 12, fontWeight: '500' },
    input: {
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
        borderWidth: 1,
    },
    textArea: { minHeight: 90 },
    validationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 8,
        marginLeft: 4,
    },
    validationText: { fontSize: 12, color: '#ef4444' },

    // Priority Options
    priorityOptions: {
        gap: 10,
    },
    priorityOption: {
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
    },
    priorityOptionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    priorityDot: { width: 8, height: 8, borderRadius: 4 },
    priorityOptionLabel: { fontSize: 14, fontWeight: '600' },
    priorityDesc: {
        fontSize: 12,
        marginTop: 8,
        marginLeft: 18,
    },

    // Date Input
    dateInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
    },
    dateInput: { flex: 1, paddingVertical: 14, marginLeft: 12, fontSize: 15 },

    // Preview
    previewCard: {
        borderRadius: 16,
        padding: 18,
        borderWidth: 1,
        marginBottom: 20,
    },
    previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    previewTag: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    previewTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
    previewDesc: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
    previewMeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    previewMetaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        gap: 6,
    },
    previewMetaText: { fontSize: 12, fontWeight: '600' },

    // Button
    createBtn: {
        height: 56,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    createBtnText: { color: 'white', fontSize: 16, fontWeight: '800' },
});
