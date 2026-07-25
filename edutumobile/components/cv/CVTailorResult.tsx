import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import {
    Check,
    ChevronLeft,
    ChevronDown,
    Download,
    Pencil,
    Plus,
    AlertCircle,
    CheckCircle2,
    MinusCircle,
    ArrowUp,
    FileText,
} from 'lucide-react-native';
import type { AtsChecklistItem, QuantifyQuestion } from '@edutu/core/src/types/cv';
import { useTheme } from '../../components/context/ThemeContext';
import { haptics } from '../../lib/haptics';
import { decodeHtmlEntities } from '../../lib/utils';

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
    result: TailorResult | null;
    /** Leaves the report and returns to the CV editor. */
    onClose: () => void;
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

/**
 * Fit is a tier, never raw odds (DESIGN.md §1) — a percentage on a CV reads as
 * "your chance of winning" and erodes trust. The thin bar is the only
 * quantitative trace left of the score.
 */
type FitTier = 'excellent' | 'strong' | 'good' | 'fair';

function fitTier(score: number): FitTier {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'strong';
    if (score >= 40) return 'good';
    return 'fair';
}

/** Checklist ids that carry a one-tap fix, and which one. */
const ACTION_IDS = {
    title: 'title_match',
    keywords: 'verbatim_keywords',
    quantify: 'quantified_bullets',
} as const;

/**
 * Post-tailoring report. A **screen**, not a modal: the ten ATS checks are a
 * worklist the user grinds through — tapping fixes that rewrite the CV
 * underneath — not an interruption to acknowledge and dismiss. It leads with
 * what to DO; the fit score is a quiet supporting signal above the fold.
 */
export function CVTailorResult({
    result,
    onClose,
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
    const { colors, isDark, reducedMotion } = useTheme();

    const muted = isDark ? '#94A3B8' : '#64748B';
    const hairline = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
    const wellBg = isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC';
    const chipBg = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';
    const bodyInk = isDark ? '#E2E8F0' : '#334155';
    const passInk = isDark ? '#86EFAC' : '#15803D';
    const success = '#16A34A';
    const attention = isDark ? '#FBBF24' : '#D97706';

    const [expandedIds, setExpandedIds] = useState<string[]>([]);
    const [settledOpen, setSettledOpen] = useState(false);
    const [titleApplied, setTitleApplied] = useState(false);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [outcomes, setOutcomes] = useState<Record<number, 'applied' | 'guidance'>>({});

    if (!result) return null;

    const score = Math.max(0, Math.min(100, Math.round(result.match_score || 0)));
    const tier = fitTier(score);
    const tierColor =
        tier === 'excellent' || tier === 'strong' ? success : tier === 'good' ? colors.primary : attention;

    // Every opportunity-derived string in this report is decoded exactly once,
    // here — scraped copy carries raw entities ("Sygnite Power &#038; Energy").
    const decodedOpportunity = decodeHtmlEntities(opportunityTitle || '');
    const improvements = (result.improvements || []).filter(Boolean).slice(0, 5).map(decodeHtmlEntities);
    const matched = (result.matched_keywords || []).filter(Boolean).slice(0, 10).map(decodeHtmlEntities);
    const missing = (result.missing_keywords || []).filter(Boolean).slice(0, 10).map(decodeHtmlEntities);
    const proposedTitle = result.proposedTitle ? decodeHtmlEntities(result.proposedTitle) : null;

    const checklist = (result.atsChecklist || [])
        .filter((item) => item?.id && item?.label)
        .map((item) => ({
            ...item,
            label: decodeHtmlEntities(item.label),
            detail: item.detail ? decodeHtmlEntities(item.detail) : '',
            why: item.why ? decodeHtmlEntities(item.why) : '',
        }));
    const quantifyQuestions = (result.quantifyQuestions || [])
        .filter((q) => q?.question)
        .slice(0, 4)
        .map((q) => ({
            target: decodeHtmlEntities(q.target || ''),
            question: decodeHtmlEntities(q.question),
        }));

    // Fix-first: the actionable checks are the hero; everything already settled
    // collapses into one quiet summary row.
    const toFix = checklist.filter((item) => item.status === 'fix');
    const settled = checklist.filter((item) => item.status !== 'fix');
    const passedCount = settled.filter((item) => item.status === 'pass').length;
    const naCount = settled.length - passedCount;
    const hasKeywordRow = toFix.some((item) => item.id === ACTION_IDS.keywords);
    const hasQuantifyRow = toFix.some((item) => item.id === ACTION_IDS.quantify);

    const layout = reducedMotion ? undefined : LinearTransition.springify().damping(22).stiffness(220);
    const enter = (index: number) =>
        reducedMotion ? undefined : FadeInDown.delay(index * 60).duration(350).springify();

    const toggleExpanded = (id: string) => {
        haptics.light();
        setExpandedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const submitAnswer = (index: number, question: QuantifyQuestion) => {
        const answer = (answers[index] || '').trim();
        if (!answer || !onQuantify || outcomes[index] === 'applied') return;
        const applied = onQuantify(question.target, answer);
        haptics.success();
        setOutcomes((prev) => ({ ...prev, [index]: applied ? 'applied' : 'guidance' }));
    };

    const renderKeywordChips = () => (
        <View style={styles.chipRow}>
            {missing.map((kw, i) => {
                const added = addedKeywords.some((a) => a.toLowerCase() === kw.toLowerCase());
                return (
                    <TouchableOpacity
                        key={`kw-${i}`}
                        style={[styles.chip, { backgroundColor: added ? 'rgba(34,197,94,0.12)' : chipBg }]}
                        disabled={added || !onAddKeyword}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={t('tailorResult.addKeywordA11y', { keyword: kw })}
                        onPress={() => {
                            haptics.success();
                            onAddKeyword?.(kw);
                        }}
                    >
                        {added ? (
                            <Check size={12} color={success} strokeWidth={3} />
                        ) : (
                            <Plus size={12} color={colors.primary} strokeWidth={3} />
                        )}
                        <Text style={[styles.chipText, { color: added ? passInk : colors.primary }]}>{kw}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );

    const renderTitleAction = () => {
        if (!proposedTitle || !onUseProposedTitle) return null;
        return (
            <TouchableOpacity
                style={[
                    styles.actionChip,
                    {
                        backgroundColor: titleApplied ? 'rgba(34,197,94,0.12)' : chipBg,
                        borderColor: titleApplied ? 'transparent' : colors.primary,
                    },
                ]}
                disabled={titleApplied}
                activeOpacity={0.7}
                accessibilityRole="button"
                onPress={() => {
                    haptics.success();
                    onUseProposedTitle(proposedTitle);
                    setTitleApplied(true);
                }}
            >
                {titleApplied ? (
                    <Check size={13} color={success} strokeWidth={3} />
                ) : (
                    <Plus size={13} color={colors.primary} strokeWidth={3} />
                )}
                <Text
                    style={[styles.actionChipText, { color: titleApplied ? passInk : colors.primary }]}
                    numberOfLines={1}
                >
                    {titleApplied
                        ? t('tailorResult.titleApplied')
                        : t('tailorResult.useTitle', { title: proposedTitle })}
                </Text>
            </TouchableOpacity>
        );
    };

    const renderQuantifyAction = () => {
        if (!quantifyQuestions.length) return null;
        return (
            <View style={styles.quantifyWrap}>
                {quantifyQuestions.map((question, i) => {
                    const outcome = outcomes[i];
                    const draft = (answers[i] || '').trim();
                    return (
                        <View key={`q-${i}`} style={styles.quantifyItem}>
                            <Text style={[styles.quantifyQuestion, { color: colors.foreground }]}>
                                {question.question}
                            </Text>
                            {!!question.target && (
                                <Text style={[styles.quantifyTarget, { color: muted }]} numberOfLines={2}>
                                    “{question.target}”
                                </Text>
                            )}
                            {outcome === 'applied' ? (
                                <View style={styles.inlineDone}>
                                    <Check size={13} color={success} strokeWidth={3} />
                                    <Text style={[styles.inlineDoneText, { color: passInk }]}>
                                        {t('tailorResult.measurableApplied')}
                                    </Text>
                                </View>
                            ) : (
                                <>
                                    <View style={styles.quantifyInputRow}>
                                        <TextInput
                                            style={[
                                                styles.quantifyInput,
                                                { color: colors.foreground, borderColor: hairline },
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
                                                styles.quantifySubmit,
                                                { backgroundColor: draft ? colors.primary : chipBg },
                                            ]}
                                            disabled={!draft}
                                            onPress={() => submitAnswer(i, question)}
                                            activeOpacity={0.8}
                                            accessibilityRole="button"
                                            accessibilityLabel={t('tailorResult.measurableSubmitA11y')}
                                        >
                                            <ArrowUp size={15} color={draft ? '#FFFFFF' : muted} strokeWidth={3} />
                                        </TouchableOpacity>
                                    </View>
                                    {outcome === 'guidance' && (
                                        <Text style={[styles.quantifyGuidance, { color: muted }]}>
                                            {t('tailorResult.measurableGuidance')}
                                        </Text>
                                    )}
                                </>
                            )}
                        </View>
                    );
                })}
            </View>
        );
    };

    /** The one-tap action promoted onto a fix row, by check id. */
    const renderRowAction = (id: string) => {
        if (id === ACTION_IDS.title) return renderTitleAction();
        if (id === ACTION_IDS.keywords) return missing.length ? renderKeywordChips() : null;
        if (id === ACTION_IDS.quantify) return renderQuantifyAction();
        return null;
    };

    return (
        <View style={[styles.screen, { backgroundColor: colors.background }]}>
            {/* Header — one row, no gradient field, no ring. */}
            <View style={[styles.header, { borderBottomColor: hairline }]}>
                <TouchableOpacity
                    style={[styles.backBtn, { backgroundColor: chipBg }]}
                    onPress={onClose}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('tailorResult.backA11y')}
                >
                    <ChevronLeft size={22} color={colors.foreground} strokeWidth={2.5} />
                </TouchableOpacity>
                <View style={styles.headerText}>
                    <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {t('tailorResult.title')}
                    </Text>
                    <Text style={[styles.headerSub, { color: muted }]} numberOfLines={1}>
                        {decodedOpportunity || t('tailorResult.appliedNoteGeneric')}
                    </Text>
                </View>
            </View>

            <ScrollView
                style={styles.body}
                contentContainerStyle={styles.bodyContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Quiet fit signal: tier word + a 4pt bar. No ring, no odds. */}
                <View style={styles.fitRow}>
                    <Text style={[styles.fitLabel, { color: muted }]}>{t('tailorResult.fitLabel')}</Text>
                    <Text style={[styles.fitTier, { color: tierColor }]}>{t(`tailorResult.tier.${tier}`)}</Text>
                </View>
                <View style={[styles.fitTrack, { backgroundColor: chipBg }]}>
                    <View style={[styles.fitFill, { width: `${score}%`, backgroundColor: tierColor }]} />
                </View>

                {/* HERO: what to fix, fix-first, with the one-tap action inline. */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                        {toFix.length
                            ? t('tailorResult.fixTitle', { count: toFix.length })
                            : t('tailorResult.allClearTitle')}
                    </Text>
                    <Text style={[styles.sectionHint, { color: muted }]}>
                        {toFix.length ? t('tailorResult.fixHint') : t('tailorResult.allClearHint')}
                    </Text>

                    {toFix.map((item, i) => {
                        const expanded = expandedIds.includes(item.id);
                        return (
                            <Animated.View
                                key={item.id}
                                entering={enter(i)}
                                layout={layout}
                                style={[styles.fixCard, { backgroundColor: wellBg, borderColor: hairline }]}
                            >
                                <View style={styles.fixHead}>
                                    <AlertCircle size={18} color={attention} />
                                    <Text style={[styles.fixLabel, { color: colors.foreground }]} numberOfLines={2}>
                                        {item.label}
                                    </Text>
                                </View>
                                {!!item.detail && (
                                    <Text style={[styles.fixDetail, { color: bodyInk }]}>{item.detail}</Text>
                                )}
                                {renderRowAction(item.id)}
                                {!!item.why && (
                                    <>
                                        <TouchableOpacity
                                            style={styles.whyToggle}
                                            activeOpacity={0.7}
                                            onPress={() => toggleExpanded(item.id)}
                                            accessibilityRole="button"
                                        >
                                            <Text style={[styles.whyToggleText, { color: muted }]}>
                                                {t('tailorResult.whyLabel')}
                                            </Text>
                                            <ChevronDown
                                                size={14}
                                                color={muted}
                                                style={expanded ? styles.chevronOpen : undefined}
                                            />
                                        </TouchableOpacity>
                                        {expanded && (
                                            <Animated.Text
                                                entering={reducedMotion ? undefined : FadeInDown.duration(180)}
                                                style={[styles.whyText, { color: muted }]}
                                            >
                                                {item.why}
                                            </Animated.Text>
                                        )}
                                    </>
                                )}
                            </Animated.View>
                        );
                    })}

                    {/* Everything already settled collapses into one quiet row. */}
                    {settled.length > 0 && (
                        <Animated.View layout={layout} style={[styles.settledCard, { borderColor: hairline }]}>
                            <TouchableOpacity
                                style={styles.settledHead}
                                activeOpacity={0.7}
                                onPress={() => {
                                    haptics.light();
                                    setSettledOpen((prev) => !prev);
                                }}
                                accessibilityRole="button"
                            >
                                <CheckCircle2 size={16} color={success} />
                                <Text style={[styles.settledText, { color: muted }]}>
                                    {naCount > 0
                                        ? t('tailorResult.settledSummaryWithNa', {
                                              passed: passedCount,
                                              na: naCount,
                                          })
                                        : t('tailorResult.settledSummary', { count: passedCount })}
                                </Text>
                                <ChevronDown
                                    size={16}
                                    color={muted}
                                    style={settledOpen ? styles.chevronOpen : undefined}
                                />
                            </TouchableOpacity>
                            {settledOpen && (
                                <View style={styles.settledList}>
                                    {settled.map((item) => (
                                        <View key={item.id} style={styles.settledRow}>
                                            {item.status === 'pass' ? (
                                                <CheckCircle2 size={14} color={success} />
                                            ) : (
                                                <MinusCircle size={14} color={muted} />
                                            )}
                                            <Text
                                                style={[styles.settledRowText, { color: muted }]}
                                                numberOfLines={2}
                                            >
                                                {item.label}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </Animated.View>
                    )}
                </View>

                {/* Old cached results carry no checklist — the keyword inserts
                    and quantify prompts still need a home of their own. */}
                {!hasKeywordRow && missing.length > 0 && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                            {t('tailorResult.missingTitle')}
                        </Text>
                        <Text style={[styles.sectionHint, { color: muted }]}>{t('tailorResult.missingHint')}</Text>
                        {renderKeywordChips()}
                    </View>
                )}
                {!hasQuantifyRow && quantifyQuestions.length > 0 && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                            {t('tailorResult.measurableTitle')}
                        </Text>
                        <Text style={[styles.sectionHint, { color: muted }]}>
                            {t('tailorResult.measurableHint')}
                        </Text>
                        {renderQuantifyAction()}
                    </View>
                )}

                {/* Supporting evidence, deliberately below the work. */}
                {matched.length > 0 && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                            {t('tailorResult.matchedTitle')}
                        </Text>
                        <View style={styles.chipRow}>
                            {matched.map((kw, i) => (
                                <View
                                    key={`m-${i}`}
                                    style={[styles.chip, { backgroundColor: 'rgba(34,197,94,0.12)' }]}
                                >
                                    <Check size={12} color={success} strokeWidth={3} />
                                    <Text style={[styles.chipText, { color: passInk }]}>{kw}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {improvements.length > 0 && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                            {t('tailorResult.improvementsTitle')}
                        </Text>
                        {improvements.map((item, i) => (
                            <View key={`imp-${i}`} style={styles.improveRow}>
                                <Check size={13} color={muted} strokeWidth={3} style={styles.improveIcon} />
                                <Text style={[styles.improveText, { color: bodyInk }]}>{item}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>

            {/* Actions */}
            <View style={[styles.actionsWrap, { borderTopColor: hairline, backgroundColor: colors.background }]}>
                {onCoverLetter && (
                    <TouchableOpacity
                        style={[
                            styles.secondaryBtn,
                            { borderColor: hairline, opacity: isCoverLetterLoading ? 0.7 : 1 },
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
                        style={[styles.secondaryBtn, styles.actionFlex, { borderColor: hairline }]}
                        onPress={onViewCv}
                        activeOpacity={0.85}
                    >
                        <Pencil size={16} color={colors.foreground} />
                        <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
                            {t('tailorResult.viewCv')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.primaryBtn,
                            { backgroundColor: colors.primary, opacity: isExporting ? 0.7 : 1 },
                        ]}
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
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderCurve: 'continuous',
    },
    headerText: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '800',
    },
    headerSub: {
        fontSize: 13,
        fontWeight: '600',
        marginTop: 1,
    },
    body: {
        flex: 1,
    },
    bodyContent: {
        padding: 20,
        paddingBottom: 12,
    },
    fitRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
        marginBottom: 7,
    },
    fitLabel: {
        fontSize: 11,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    fitTier: {
        fontSize: 15,
        fontWeight: '800',
    },
    fitTrack: {
        height: 4,
        borderRadius: 999,
        overflow: 'hidden',
        marginBottom: 22,
    },
    fitFill: {
        height: '100%',
        borderRadius: 999,
    },
    section: {
        marginBottom: 22,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.2,
    },
    sectionHint: {
        fontSize: 13,
        lineHeight: 18,
        marginTop: 4,
        marginBottom: 12,
    },
    fixCard: {
        borderRadius: 16,
        borderWidth: 1,
        borderCurve: 'continuous',
        padding: 14,
        marginBottom: 10,
        gap: 8,
    },
    fixHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
    },
    fixLabel: {
        flex: 1,
        fontSize: 15,
        fontWeight: '800',
    },
    fixDetail: {
        fontSize: 13.5,
        lineHeight: 19,
        fontWeight: '500',
    },
    whyToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
    },
    whyToggleText: {
        fontSize: 12,
        fontWeight: '700',
    },
    whyText: {
        fontSize: 12.5,
        lineHeight: 18,
        fontStyle: 'italic',
    },
    chevronOpen: {
        transform: [{ rotate: '180deg' }],
    },
    settledCard: {
        borderRadius: 16,
        borderWidth: 1,
        borderCurve: 'continuous',
        paddingHorizontal: 14,
    },
    settledHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        paddingVertical: 13,
    },
    settledText: {
        flex: 1,
        fontSize: 13.5,
        fontWeight: '700',
    },
    settledList: {
        paddingBottom: 13,
        paddingLeft: 25,
        gap: 8,
    },
    settledRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    settledRowText: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
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
    actionChip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 999,
        borderWidth: 1.5,
        maxWidth: '100%',
    },
    actionChipText: {
        fontSize: 12.5,
        fontWeight: '800',
        flexShrink: 1,
    },
    quantifyWrap: {
        gap: 14,
    },
    quantifyItem: {
        gap: 5,
    },
    quantifyQuestion: {
        fontSize: 13.5,
        lineHeight: 19,
        fontWeight: '700',
    },
    quantifyTarget: {
        fontSize: 12,
        lineHeight: 17,
        fontStyle: 'italic',
    },
    quantifyInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 2,
    },
    quantifyInput: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 12,
        borderCurve: 'continuous',
        paddingHorizontal: 12,
        paddingVertical: 9,
        fontSize: 13.5,
    },
    quantifySubmit: {
        width: 36,
        height: 36,
        borderRadius: 12,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
    },
    quantifyGuidance: {
        fontSize: 12,
        lineHeight: 17,
        fontStyle: 'italic',
    },
    inlineDone: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
    },
    inlineDoneText: {
        fontSize: 12.5,
        fontWeight: '700',
    },
    improveRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 9,
        marginBottom: 8,
    },
    improveIcon: {
        marginTop: 3,
    },
    improveText: {
        flex: 1,
        fontSize: 13.5,
        lineHeight: 19,
        fontWeight: '500',
    },
    actionsWrap: {
        padding: 16,
        gap: 10,
        borderTopWidth: 1,
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
    },
    actionFlex: {
        flex: 1,
    },
    secondaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        paddingVertical: 13,
        borderRadius: 16,
        borderCurve: 'continuous',
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
        borderCurve: 'continuous',
    },
    primaryBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
    },
});
