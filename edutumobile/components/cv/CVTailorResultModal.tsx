import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Modal,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
    FadeInDown,
    useAnimatedProps,
    useSharedValue,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import {
    X,
    Check,
    Download,
    Wand2,
    Pencil,
    Plus,
    CheckCircle2,
    AlertCircle,
    MinusCircle,
    ChevronDown,
    Ruler,
    ArrowUp,
    FileText,
} from 'lucide-react-native';
import type { AtsChecklistItem, QuantifyQuestion } from '@edutu/core/src/types/cv';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../components/context/ThemeContext';
import AnimatedCounter from '../ui/AnimatedCounter';
import { haptics } from '../../lib/haptics';
import { CvModalBackdrop } from './CvModalBackdrop';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface TailorResult {
    match_score: number;
    improvements: string[];
    matched_keywords: string[];
    missing_keywords: string[];
    /** New ATS-grade fields — absent on old cached results. */
    atsChecklist?: AtsChecklistItem[];
    proposedTitle?: string | null;
    quantifyQuestions?: QuantifyQuestion[];
}

interface Props {
    visible: boolean;
    onClose: () => void;
    result: TailorResult | null;
    opportunityTitle?: string;
    isExporting?: boolean;
    onExport: () => void;
    onViewCv: () => void;
    /** One-tap insert: append a "Consider adding" keyword to the CV skills. */
    onAddKeyword?: (keyword: string) => void;
    /** Keywords already inserted via onAddKeyword — rendered as covered. */
    addedKeywords?: string[];
    /** One-tap fix for the title_match item: apply the proposed CV title. */
    onUseProposedTitle?: (title: string) => void;
    /**
     * "Make it measurable": append the answer to the target bullet. Returns
     * true when the target was found and updated; false → guidance-only hint.
     */
    onQuantify?: (target: string, answer: string) => boolean;
    /** Generate a cover letter for the tailored opportunity. */
    onCoverLetter?: () => void;
    isCoverLetterLoading?: boolean;
}

const RING_SIZE = 132;
const RING_STROKE = 12;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function scoreColor(score: number): [string, string] {
    if (score >= 70) return ['#22C55E', '#16A34A'];
    if (score >= 45) return ['#6366F1', '#8B5CF6'];
    return ['#F59E0B', '#F97316'];
}

/**
 * Post-tailoring outcome sheet. Replaces the old raw Alert.alert with a
 * designed result — match-score ring, improvement list, keyword coverage, and
 * a direct "Export as PDF" action.
 */
export function CVTailorResultModal({
    visible,
    onClose,
    result,
    opportunityTitle,
    isExporting,
    onExport,
    onViewCv,
    onAddKeyword,
    addedKeywords = [],
    onUseProposedTitle,
    onQuantify,
    onCoverLetter,
    isCoverLetterLoading,
}: Props) {
    const { t } = useTranslation('cv');
    const { colors, isDark } = useTheme();
    const muted = isDark ? '#94A3B8' : '#64748B';
    const cardBg = isDark ? '#1E293B' : '#FFFFFF';
    const chipBg = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';

    const score = Math.max(0, Math.min(100, Math.round(result?.match_score || 0)));

    // ATS checklist expand/collapse + one-tap-fix state.
    const [expandedIds, setExpandedIds] = useState<string[]>([]);
    const [titleApplied, setTitleApplied] = useState(false);
    // Per-question answer drafts and outcomes for "Make it measurable".
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [outcomes, setOutcomes] = useState<Record<number, 'applied' | 'guidance'>>({});
    // Adjust-during-render reset (not an effect — avoids cascading renders):
    // each fresh open starts with collapsed rows and blank answers.
    const [prevVisible, setPrevVisible] = useState(visible);
    if (visible !== prevVisible) {
        setPrevVisible(visible);
        if (visible) {
            setExpandedIds([]);
            setTitleApplied(false);
            setAnswers({});
            setOutcomes({});
        }
    }

    // Mount animation: the progress arc sweeps from 0 to the score.
    const ringProgress = useSharedValue(0);
    useEffect(() => {
        if (visible) {

            ringProgress.value = 0;

            ringProgress.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
        }
    }, [visible, score, ringProgress]);
    const ringAnimatedProps = useAnimatedProps(() => ({
        strokeDashoffset: RING_CIRCUMFERENCE * (1 - (score / 100) * ringProgress.value),
    }));

    if (!result) return null;

    const [ringFrom, ringTo] = scoreColor(score);
    const caption =
        score >= 70 ? t('tailorResult.scoreHigh') : score >= 45 ? t('tailorResult.scoreMedium') : t('tailorResult.scoreLow');

    const improvements = (result.improvements || []).filter(Boolean).slice(0, 5);
    const matched = (result.matched_keywords || []).filter(Boolean).slice(0, 10);
    const missing = (result.missing_keywords || []).filter(Boolean).slice(0, 10);
    // Graceful when the new fields are absent (old cached results).
    const checklist = (result.atsChecklist || []).filter((item) => item?.id && item?.label);
    const quantifyQuestions = (result.quantifyQuestions || [])
        .filter((q) => q?.question)
        .slice(0, 4);

    const toggleExpanded = (id: string) => {
        haptics.light();
        setExpandedIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
        );
    };

    const statusIcon = (status: AtsChecklistItem['status']) => {
        if (status === 'pass') return <CheckCircle2 size={18} color="#16A34A" />;
        if (status === 'fix') return <AlertCircle size={18} color="#D97706" />;
        return <MinusCircle size={18} color={muted} />;
    };

    const submitAnswer = (index: number, question: QuantifyQuestion) => {
        const answer = (answers[index] || '').trim();
        if (!answer || !onQuantify || outcomes[index] === 'applied') return;
        const applied = onQuantify(question.target, answer);
        haptics.success();
        setOutcomes((prev) => ({ ...prev, [index]: applied ? 'applied' : 'guidance' }));
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <CvModalBackdrop onPress={onClose} />
                <Animated.View entering={FadeInDown.springify().damping(18)} style={[styles.card, { backgroundColor: cardBg }]}>
                    {/* Gradient header */}
                    <LinearGradient
                        colors={[ringFrom, ringTo]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.header}
                    >
                        <TouchableOpacity style={styles.close} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <X size={20} color="#FFFFFF" />
                        </TouchableOpacity>

                        {/* Row 1: title */}
                        <View style={styles.headerTitleRow}>
                            <Wand2 size={18} color="#FFFFFF" />
                            <Text style={styles.headerTitle}>{t('tailorResult.title')}</Text>
                        </View>

                        {/* Row 2: match ring with the score stacked inside it */}
                        <View style={styles.ringWrap}>
                            <Svg width={RING_SIZE} height={RING_SIZE}>
                                <Circle
                                    cx={RING_SIZE / 2}
                                    cy={RING_SIZE / 2}
                                    r={RING_RADIUS}
                                    stroke="rgba(255,255,255,0.28)"
                                    strokeWidth={RING_STROKE}
                                    fill="none"
                                />
                                <AnimatedCircle
                                    cx={RING_SIZE / 2}
                                    cy={RING_SIZE / 2}
                                    r={RING_RADIUS}
                                    stroke="#FFFFFF"
                                    strokeWidth={RING_STROKE}
                                    fill="none"
                                    strokeLinecap="round"
                                    strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
                                    animatedProps={ringAnimatedProps}
                                    transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                                />
                            </Svg>
                            <View style={styles.ringCenter} pointerEvents="none">
                                <AnimatedCounter value={score} duration={900} suffix="%" style={styles.ringScore} />
                                <Text style={styles.ringLabel}>{t('tailorResult.matchLabel')}</Text>
                            </View>
                        </View>

                        {/* Row 3: status line on its own row below the ring */}
                        <Text style={styles.caption}>{caption}</Text>
                    </LinearGradient>

                    <ScrollView
                        style={styles.body}
                        contentContainerStyle={styles.bodyContent}
                        showsVerticalScrollIndicator={false}
                    >
                        <Text style={[styles.applied, { color: muted }]}>
                            {opportunityTitle
                                ? t('tailorResult.appliedNote', { title: opportunityTitle })
                                : t('tailorResult.appliedNoteGeneric')}
                        </Text>

                        {improvements.length > 0 && (
                            <View style={styles.section}>
                                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                                    {t('tailorResult.improvementsTitle')}
                                </Text>
                                {improvements.map((item, i) => (
                                    <View key={`imp-${i}`} style={styles.improveRow}>
                                        <View style={[styles.checkDot, { backgroundColor: `${ringFrom}22` }]}>
                                            <Check size={13} color={ringFrom} strokeWidth={3} />
                                        </View>
                                        <Text style={[styles.improveText, { color: isDark ? '#E2E8F0' : '#334155' }]}>{item}</Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {matched.length > 0 && (
                            <View style={styles.section}>
                                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                                    {t('tailorResult.matchedTitle')}
                                </Text>
                                <View style={styles.chipRow}>
                                    {matched.map((kw, i) => (
                                        <View key={`m-${i}`} style={[styles.chip, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
                                            <Check size={12} color="#16A34A" strokeWidth={3} />
                                            <Text style={[styles.chipText, { color: isDark ? '#86EFAC' : '#15803D' }]}>{kw}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        {missing.length > 0 && (
                            <View style={styles.section}>
                                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                                    {t('tailorResult.missingTitle')}
                                </Text>
                                <View style={styles.chipRow}>
                                    {missing.map((kw, i) => {
                                        const added = addedKeywords.some(
                                            (a) => a.toLowerCase() === kw.toLowerCase(),
                                        );
                                        return (
                                            <TouchableOpacity
                                                key={`x-${i}`}
                                                style={[
                                                    styles.chip,
                                                    { backgroundColor: added ? 'rgba(34,197,94,0.12)' : chipBg },
                                                ]}
                                                disabled={added || !onAddKeyword}
                                                activeOpacity={0.7}
                                                onPress={() => {
                                                    haptics.success();
                                                    onAddKeyword?.(kw);
                                                }}
                                            >
                                                {added ? (
                                                    <Check size={12} color="#16A34A" strokeWidth={3} />
                                                ) : (
                                                    <Plus size={12} color={muted} strokeWidth={3} />
                                                )}
                                                <Text
                                                    style={[
                                                        styles.chipText,
                                                        { color: added ? (isDark ? '#86EFAC' : '#15803D') : muted },
                                                    ]}
                                                >
                                                    {kw}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                <Text style={[styles.missingHint, { color: muted }]}>{t('tailorResult.missingHint')}</Text>
                            </View>
                        )}

                        {checklist.length > 0 && (
                            <View style={styles.section}>
                                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                                    {t('tailorResult.checklistTitle')}
                                </Text>
                                <View
                                    style={[
                                        styles.checklistCard,
                                        {
                                            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
                                            borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
                                        },
                                    ]}
                                >
                                    {checklist.map((item, i) => {
                                        const expanded = expandedIds.includes(item.id);
                                        const isNa = item.status === 'n/a';
                                        const showTitleChip =
                                            item.id === 'title_match' &&
                                            !!result.proposedTitle &&
                                            !!onUseProposedTitle;
                                        return (
                                            <View
                                                key={item.id}
                                                style={[
                                                    styles.checklistRow,
                                                    i > 0 && {
                                                        borderTopWidth: 1,
                                                        borderTopColor: isDark
                                                            ? 'rgba(255,255,255,0.06)'
                                                            : '#E2E8F0',
                                                    },
                                                ]}
                                            >
                                                <TouchableOpacity
                                                    style={styles.checklistHead}
                                                    activeOpacity={0.7}
                                                    onPress={() => toggleExpanded(item.id)}
                                                >
                                                    {statusIcon(item.status)}
                                                    <Text
                                                        style={[
                                                            styles.checklistLabel,
                                                            { color: isNa ? muted : colors.foreground },
                                                        ]}
                                                        numberOfLines={2}
                                                    >
                                                        {item.label}
                                                    </Text>
                                                    <ChevronDown
                                                        size={16}
                                                        color={muted}
                                                        style={expanded ? styles.chevronOpen : undefined}
                                                    />
                                                </TouchableOpacity>
                                                {expanded && (
                                                    <View style={styles.checklistBody}>
                                                        {!!item.detail && (
                                                            <Text
                                                                style={[
                                                                    styles.checklistDetail,
                                                                    { color: isDark ? '#E2E8F0' : '#334155' },
                                                                ]}
                                                            >
                                                                {item.detail}
                                                            </Text>
                                                        )}
                                                        {!!item.why && (
                                                            <Text style={[styles.checklistWhy, { color: muted }]}>
                                                                {item.why}
                                                            </Text>
                                                        )}
                                                        {showTitleChip && (
                                                            <TouchableOpacity
                                                                style={[
                                                                    styles.titleChip,
                                                                    {
                                                                        backgroundColor: titleApplied
                                                                            ? 'rgba(34,197,94,0.12)'
                                                                            : chipBg,
                                                                    },
                                                                ]}
                                                                disabled={titleApplied}
                                                                activeOpacity={0.7}
                                                                onPress={() => {
                                                                    haptics.success();
                                                                    onUseProposedTitle?.(result.proposedTitle!);
                                                                    setTitleApplied(true);
                                                                }}
                                                            >
                                                                {titleApplied ? (
                                                                    <Check size={13} color="#16A34A" strokeWidth={3} />
                                                                ) : (
                                                                    <Plus size={13} color={colors.primary} strokeWidth={3} />
                                                                )}
                                                                <Text
                                                                    style={[
                                                                        styles.titleChipText,
                                                                        {
                                                                            color: titleApplied
                                                                                ? isDark
                                                                                    ? '#86EFAC'
                                                                                    : '#15803D'
                                                                                : colors.primary,
                                                                        },
                                                                    ]}
                                                                    numberOfLines={1}
                                                                >
                                                                    {titleApplied
                                                                        ? t('tailorResult.titleApplied')
                                                                        : t('tailorResult.useTitle', {
                                                                              title: result.proposedTitle,
                                                                          })}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                )}
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {quantifyQuestions.length > 0 && (
                            <View style={styles.section}>
                                <View style={styles.measureHeader}>
                                    <Ruler size={15} color={colors.primary} />
                                    <Text style={[styles.sectionTitle, styles.measureTitle, { color: colors.foreground }]}>
                                        {t('tailorResult.measurableTitle')}
                                    </Text>
                                </View>
                                <Text style={[styles.measureHint, { color: muted }]}>
                                    {t('tailorResult.measurableHint')}
                                </Text>
                                {quantifyQuestions.map((question, i) => {
                                    const outcome = outcomes[i];
                                    return (
                                        <View
                                            key={`q-${i}`}
                                            style={[
                                                styles.measureCard,
                                                {
                                                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
                                                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
                                                },
                                            ]}
                                        >
                                            <Text style={[styles.measureQuestion, { color: colors.foreground }]}>
                                                {question.question}
                                            </Text>
                                            {!!question.target && (
                                                <Text style={[styles.measureTarget, { color: muted }]} numberOfLines={2}>
                                                    “{question.target}”
                                                </Text>
                                            )}
                                            {outcome === 'applied' ? (
                                                <View style={styles.measureDoneRow}>
                                                    <Check size={13} color="#16A34A" strokeWidth={3} />
                                                    <Text style={[styles.measureDoneText, { color: isDark ? '#86EFAC' : '#15803D' }]}>
                                                        {t('tailorResult.measurableApplied')}
                                                    </Text>
                                                </View>
                                            ) : (
                                                <>
                                                    <View style={styles.measureInputRow}>
                                                        <TextInput
                                                            style={[
                                                                styles.measureInput,
                                                                {
                                                                    color: colors.foreground,
                                                                    borderColor: isDark
                                                                        ? 'rgba(255,255,255,0.14)'
                                                                        : '#E2E8F0',
                                                                },
                                                            ]}
                                                            value={answers[i] || ''}
                                                            onChangeText={(text) =>
                                                                setAnswers((prev) => ({ ...prev, [i]: text }))
                                                            }
                                                            placeholder={t('tailorResult.measurablePlaceholder')}
                                                            placeholderTextColor={muted}
                                                            returnKeyType="done"
                                                            onSubmitEditing={() => submitAnswer(i, question)}
                                                        />
                                                        <TouchableOpacity
                                                            style={[
                                                                styles.measureSubmit,
                                                                {
                                                                    backgroundColor: (answers[i] || '').trim()
                                                                        ? colors.primary
                                                                        : chipBg,
                                                                },
                                                            ]}
                                                            disabled={!(answers[i] || '').trim()}
                                                            onPress={() => submitAnswer(i, question)}
                                                            activeOpacity={0.8}
                                                        >
                                                            <ArrowUp
                                                                size={15}
                                                                color={(answers[i] || '').trim() ? '#FFFFFF' : muted}
                                                                strokeWidth={3}
                                                            />
                                                        </TouchableOpacity>
                                                    </View>
                                                    {outcome === 'guidance' && (
                                                        <Text style={[styles.measureGuidance, { color: muted }]}>
                                                            {t('tailorResult.measurableGuidance')}
                                                        </Text>
                                                    )}
                                                </>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                    </ScrollView>

                    {/* Actions */}
                    <View style={[styles.actionsWrap, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]}>
                        {onCoverLetter && (
                            <TouchableOpacity
                                style={[
                                    styles.coverLetterBtn,
                                    {
                                        borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#E2E8F0',
                                        opacity: isCoverLetterLoading ? 0.7 : 1,
                                    },
                                ]}
                                onPress={onCoverLetter}
                                disabled={isCoverLetterLoading}
                                activeOpacity={0.85}
                            >
                                {isCoverLetterLoading ? (
                                    <ActivityIndicator size="small" color={colors.primary} />
                                ) : (
                                    <FileText size={16} color={colors.primary} />
                                )}
                                <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
                                    {isCoverLetterLoading
                                        ? t('tailorResult.coverLetterLoading')
                                        : t('tailorResult.coverLetter')}
                                </Text>
                            </TouchableOpacity>
                        )}
                        <View style={styles.actions}>
                        <TouchableOpacity
                            style={[styles.secondaryBtn, { borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#E2E8F0' }]}
                            onPress={onViewCv}
                            activeOpacity={0.85}
                        >
                            <Pencil size={16} color={colors.foreground} />
                            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>{t('tailorResult.viewCv')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.primaryBtn, { backgroundColor: ringFrom, opacity: isExporting ? 0.7 : 1 }]}
                            onPress={onExport}
                            disabled={isExporting}
                            activeOpacity={0.85}
                        >
                            {isExporting ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <Download size={16} color="#FFFFFF" />
                            )}
                            <Text style={styles.primaryBtnText}>
                                {isExporting ? t('tailorResult.exporting') : t('tailorResult.exportPdf')}
                            </Text>
                        </TouchableOpacity>
                        </View>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 18,
    },
    card: {
        width: '100%',
        maxWidth: 440,
        maxHeight: '88%',
        borderRadius: 28,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.28,
        shadowRadius: 24,
        elevation: 14,
    },
    header: {
        paddingTop: 20,
        paddingBottom: 22,
        paddingHorizontal: 20,
        alignItems: 'center',
    },
    close: {
        position: 'absolute',
        top: 14,
        right: 14,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        marginBottom: 18,
    },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.2,
    },
    ringWrap: {
        width: RING_SIZE,
        height: RING_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Pure-flow centering: pulled up over the Svg by exactly its own height.
    // (An absoluteFill sibling after an <Svg> fails to overlay on the new
    // architecture here — the labels rendered below the ring; see punch list.)
    ringCenter: {
        width: RING_SIZE,
        height: RING_SIZE,
        marginTop: -RING_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ringScore: {
        color: '#FFFFFF',
        fontSize: 28,
        fontWeight: '900',
        lineHeight: 32,
        textAlign: 'center',
    },
    ringLabel: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: 2,
        textAlign: 'center',
    },
    caption: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
        marginTop: 14,
        textAlign: 'center',
    },
    body: {
        flexGrow: 0,
    },
    bodyContent: {
        padding: 20,
        paddingBottom: 8,
    },
    applied: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 18,
    },
    section: {
        marginBottom: 18,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '800',
        marginBottom: 10,
    },
    improveRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 9,
    },
    checkDot: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
    },
    improveText: {
        flex: 1,
        fontSize: 13.5,
        lineHeight: 19,
        fontWeight: '500',
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 11,
        paddingVertical: 7,
        borderRadius: 999,
    },
    chipText: {
        fontSize: 12.5,
        fontWeight: '700',
    },
    missingHint: {
        fontSize: 12.5,
        lineHeight: 18,
        marginTop: 10,
        fontStyle: 'italic',
    },
    checklistCard: {
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
    },
    checklistRow: {
        paddingHorizontal: 14,
    },
    checklistHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
    },
    checklistLabel: {
        flex: 1,
        fontSize: 13.5,
        fontWeight: '700',
    },
    chevronOpen: {
        transform: [{ rotate: '180deg' }],
    },
    checklistBody: {
        paddingBottom: 12,
        paddingLeft: 28,
        gap: 6,
    },
    checklistDetail: {
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '500',
    },
    checklistWhy: {
        fontSize: 12.5,
        lineHeight: 18,
        fontStyle: 'italic',
    },
    titleChip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        marginTop: 4,
        maxWidth: '100%',
    },
    titleChipText: {
        fontSize: 12.5,
        fontWeight: '700',
        flexShrink: 1,
    },
    measureHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        marginBottom: 4,
    },
    measureTitle: {
        marginBottom: 0,
    },
    measureHint: {
        fontSize: 12.5,
        lineHeight: 18,
        marginBottom: 10,
    },
    measureCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 12,
        marginBottom: 10,
        gap: 6,
    },
    measureQuestion: {
        fontSize: 13.5,
        lineHeight: 19,
        fontWeight: '700',
    },
    measureTarget: {
        fontSize: 12,
        lineHeight: 17,
        fontStyle: 'italic',
    },
    measureInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 2,
    },
    measureInput: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 9,
        fontSize: 13.5,
    },
    measureSubmit: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    measureGuidance: {
        fontSize: 12,
        lineHeight: 17,
        fontStyle: 'italic',
    },
    measureDoneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
    },
    measureDoneText: {
        fontSize: 12.5,
        fontWeight: '700',
    },
    actionsWrap: {
        padding: 16,
        gap: 10,
        borderTopWidth: 1,
    },
    coverLetterBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        paddingVertical: 12,
        borderRadius: 16,
        borderWidth: 1.5,
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
    },
    secondaryBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        paddingVertical: 14,
        borderRadius: 16,
        borderWidth: 1.5,
    },
    secondaryBtnText: {
        fontSize: 14,
        fontWeight: '700',
    },
    primaryBtn: {
        flex: 1.3,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 16,
    },
    primaryBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
    },
});
