import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    ScrollView,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import Animated, {
    FadeIn,
    SlideInLeft,
    SlideInRight,
    SlideOutLeft,
    SlideOutRight,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Eye, Layers, Wand2 } from 'lucide-react-native';
import type { CVTemplate, UserCV } from '@edutu/core/src/types/cv';
import { analyzeCv, type CvCheckStep } from '@edutu/core/src/services/cvHealth';
import { resolveTemplateDesign } from '@edutu/core/src/services/templateDesigns';
import { useTheme } from '../../context/ThemeContext';
import { AnimatedPressable } from '../../ui/AnimatedPressable';
import { CVHealthPanel, CvHealthPill } from '../CVHealthPanel';
import { UndoSnackbar } from './UndoSnackbar';
import { SPACE, useFieldColors } from './formKit';
import { WizardFooter, WizardProgress, type WizardStepMeta } from './WizardChrome';
import {
    BasicsStep,
    EducationStep,
    ExperienceStep,
    ExtrasStep,
    SummaryStep,
    validateBasics,
} from './steps';
import { removeItem, restoreItem, type RepeatableSection } from './cvDraft';

const STEPS: WizardStepMeta[] = [
    { key: 'basics', titleKey: 'wizard.steps.basics.title' },
    { key: 'summary', titleKey: 'wizard.steps.summary.title' },
    { key: 'experience', titleKey: 'wizard.steps.experience.title' },
    { key: 'education', titleKey: 'wizard.steps.education.title' },
    { key: 'extras', titleKey: 'wizard.steps.extras.title' },
];

const AUTOSAVE_DELAY_MS = 1500;

interface Props {
    currentCV: Partial<UserCV>;
    setCurrentCV: React.Dispatch<React.SetStateAction<Partial<UserCV>>>;
    /** The template this CV is being written into. Drives the health check's fit test. */
    template?: CVTemplate | null;
    isPro: boolean;
    isSaving: boolean;
    isImprovingSummary?: boolean;
    onSave: () => void;
    onPreview: () => void;
    onBack: () => void;
    onAITailor: () => void;
    onImproveSummary?: () => void;
    onUpgradeFeature: (feature: string) => void;
    onChangeTemplate: () => void;
    onReportSummary?: () => void;
    canUndoSummary?: boolean;
    onUndoSummary?: () => void;
    /** Present when a tailor report exists and can be reopened. */
    onOpenTailorReport?: () => void;
}

interface PendingUndo {
    section: RepeatableSection;
    item: any;
    index: number;
    title: string;
}

/**
 * The CV wizard.
 *
 * Replaces a single 2,000px scroll that stacked every section with five spaced
 * steps, a progress bar, and a sticky bold Next button. Save and Export used to
 * live at the very bottom of that scroll; the primary action is now always on
 * screen and the work autosaves, so leaving no longer discards it.
 */
export function CVWizard({
    currentCV,
    setCurrentCV,
    template,
    isPro,
    isSaving,
    isImprovingSummary,
    onSave,
    onPreview,
    onBack,
    onAITailor,
    onImproveSummary,
    onUpgradeFeature,
    onChangeTemplate,
    onReportSummary,
    canUndoSummary,
    onUndoSummary,
    onOpenTailorReport,
}: Props) {
    const { t } = useTranslation('cv');
    const { colors } = useTheme();
    const { muted, fieldBorder } = useFieldColors();

    const [stepIndex, setStepIndex] = useState(0);
    // Which way the last navigation went, so a step slides in from the side it
    // came from rather than always from the right.
    const [goingForward, setGoingForward] = useState(true);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [showHealth, setShowHealth] = useState(false);
    const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
    const scrollRef = useRef<ScrollView>(null);

    const design = useMemo(() => resolveTemplateDesign(template), [template]);
    const report = useMemo(
        () => analyzeCv(currentCV.data_json, design),
        [currentCV.data_json, design],
    );

    // ── Autosave ─────────────────────────────────────────────────────────────
    // The back arrow used to discard everything typed since the last manual
    // save. Persisting on a debounce means leaving is never destructive.
    const savedSnapshot = useRef(JSON.stringify(currentCV.data_json ?? {}));
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        const snapshot = JSON.stringify(currentCV.data_json ?? {});
        if (snapshot === savedSnapshot.current) return;

        setDirty(true);
        const timer = setTimeout(() => {
            savedSnapshot.current = snapshot;
            setDirty(false);
            onSave();
        }, AUTOSAVE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [currentCV.data_json, onSave]);

    const goToStep = useCallback((index: number) => {
        const next = Math.max(0, Math.min(STEPS.length - 1, index));
        setStepIndex((previous) => {
            if (next !== previous) setGoingForward(next > previous);
            return next;
        });
        scrollRef.current?.scrollTo({ y: 0, animated: true });
    }, []);

    const handleNext = () => {
        if (STEPS[stepIndex].key === 'basics') {
            const found = validateBasics(currentCV, t);
            setErrors(found);
            // Only a missing name blocks — everything else is a soft warning the
            // health panel will keep raising.
            if (found.full_name) return;
        }
        if (stepIndex === STEPS.length - 1) {
            onSave();
            onPreview();
            return;
        }
        goToStep(stepIndex + 1);
    };

    const handleRequestDelete = (section: RepeatableSection, id: string, title: string) => {
        const list = ((currentCV.data_json as any)?.[section] || []) as any[];
        const index = list.findIndex((entry) => entry.id === id);
        const item = list[index];
        if (!item) return;

        Alert.alert(
            t('wizard.delete.title'),
            t('wizard.delete.message', { title }),
            [
                { text: t('wizard.delete.cancel'), style: 'cancel' },
                {
                    text: t('wizard.delete.confirm'),
                    style: 'destructive',
                    onPress: () => {
                        removeItem(setCurrentCV, section, id);
                        setPendingUndo({ section, item, index, title });
                    },
                },
            ],
        );
    };

    const handleUndoDelete = () => {
        if (!pendingUndo) return;
        restoreItem(setCurrentCV, pendingUndo.section, pendingUndo.item, pendingUndo.index);
        setPendingUndo(null);
    };

    const handleFixFromHealth = (step: CvCheckStep) => {
        setShowHealth(false);
        const index = STEPS.findIndex((entry) => entry.key === step);
        if (index >= 0) goToStep(index);
    };

    /** Steps whose required content is present — drives the progress ticks. */
    const completed = useMemo(() => {
        const data = currentCV.data_json;
        const done = new Set<string>();
        if ((data?.header?.full_name || '').trim() && (data?.header?.email || '').trim()) done.add('basics');
        if ((data?.summary || '').trim() && (data?.skills || []).length) done.add('summary');
        if ((data?.experience || []).some((item) => item.role || item.company)) done.add('experience');
        if ((data?.education || []).some((item) => item.institution || item.degree)) done.add('education');
        if ((data?.projects || []).length || (data?.achievements || []).length) done.add('extras');
        return done;
    }, [currentCV.data_json]);

    const stepProps = {
        currentCV,
        setCurrentCV,
        onRequestDelete: handleRequestDelete,
        errors,
    };

    const isLast = stepIndex === STEPS.length - 1;

    return (
        <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* Header: navigation, name, template, health */}
            <View style={[styles.header, { borderBottomColor: fieldBorder }]}>
                <AnimatedPressable
                    style={[styles.iconBtn, { backgroundColor: `${colors.primary}14` }]}
                    scaleTo={0.9}
                    onPress={onBack}
                    accessibilityRole="button"
                    accessibilityLabel={t('wizard.back')}
                >
                    <ChevronLeft size={22} color={colors.foreground} strokeWidth={2.5} />
                </AnimatedPressable>

                <View style={styles.headerCenter}>
                    <TextInput
                        style={[styles.nameInput, { color: colors.foreground }]}
                        value={currentCV.name}
                        onChangeText={(text) => setCurrentCV((prev) => ({ ...prev, name: text }))}
                        placeholder={t('wizard.namePlaceholder')}
                        placeholderTextColor={muted}
                        accessibilityLabel={t('wizard.nameAccessibility')}
                    />
                    <Text style={[styles.saveState, { color: muted }]} numberOfLines={1}>
                        {isSaving
                            ? t('wizard.saving')
                            : dirty
                                ? t('wizard.unsaved')
                                : t('wizard.saved')}
                    </Text>
                </View>

                <CvHealthPill report={report} onPress={() => setShowHealth(true)} />

                <AnimatedPressable
                    style={[styles.iconBtn, { backgroundColor: `${colors.primary}14` }]}
                    scaleTo={0.9}
                    onPress={onPreview}
                    accessibilityRole="button"
                    accessibilityLabel={t('wizard.preview')}
                >
                    <Eye size={19} color={colors.primary} />
                </AnimatedPressable>
            </View>

            {/* Template chip — the editor never used to show which template you
                were writing into, let alone let you change it. */}
            <View style={styles.chipRow}>
                <AnimatedPressable
                    style={[styles.templateChip, { borderColor: fieldBorder }]}
                    scaleTo={0.97}
                    onPress={onChangeTemplate}
                    accessibilityRole="button"
                >
                    <View style={styles.templateChipInner}>
                        <View style={[styles.templateSwatch, { backgroundColor: design.accent }]} />
                        <Layers size={13} color={muted} />
                        <Text style={[styles.templateChipText, { color: colors.foreground }]} numberOfLines={1}>
                            {template?.name || t('wizard.template.none')}
                        </Text>
                        <Text style={[styles.templateChange, { color: colors.primary }]}>
                            {t('wizard.template.change')}
                        </Text>
                    </View>
                </AnimatedPressable>

                {!!onOpenTailorReport && (
                    <AnimatedPressable
                        style={[styles.reportChip, { borderColor: colors.primary }]}
                        scaleTo={0.95}
                        onPress={onOpenTailorReport}
                        accessibilityRole="button"
                    >
                        <View style={styles.reportChipInner}>
                            <Wand2 size={13} color={colors.primary} />
                            <Text style={[styles.reportChipText, { color: colors.primary }]}>
                                {t('tailorResult.reopen')}
                            </Text>
                        </View>
                    </AnimatedPressable>
                )}
            </View>

            <WizardProgress
                steps={STEPS}
                activeIndex={stepIndex}
                completed={completed}
                onJump={goToStep}
            />

            <ScrollView
                ref={scrollRef}
                style={styles.flex}
                contentContainerStyle={styles.body}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Keyed so each step animates in as its own screen. */}
                <Animated.View
                    key={STEPS[stepIndex].key}
                    entering={(goingForward ? SlideInRight : SlideInLeft).duration(220)}
                    exiting={(goingForward ? SlideOutLeft : SlideOutRight).duration(160)}
                >
                    {stepIndex === 0 && <BasicsStep {...stepProps} />}
                    {stepIndex === 1 && (
                        <SummaryStep
                            {...stepProps}
                            isPro={isPro}
                            isImprovingSummary={isImprovingSummary}
                            onImproveSummary={onImproveSummary ?? onAITailor}
                            onUpgradeFeature={onUpgradeFeature}
                            canUndoSummary={canUndoSummary}
                            onUndoSummary={onUndoSummary}
                            onReportSummary={onReportSummary}
                        />
                    )}
                    {stepIndex === 2 && <ExperienceStep {...stepProps} />}
                    {stepIndex === 3 && <EducationStep {...stepProps} />}
                    {stepIndex === 4 && <ExtrasStep {...stepProps} />}
                </Animated.View>

                {isLast && (
                    <Animated.View entering={FadeIn.delay(120)}>
                        <AnimatedPressable
                            style={[styles.tailorBtn, { backgroundColor: colors.card, borderColor: fieldBorder }]}
                            scaleTo={0.98}
                            onPress={isPro ? onAITailor : () => onUpgradeFeature(t('editor.tailor.title'))}
                            accessibilityRole="button"
                        >
                            <View style={styles.tailorInner}>
                                <View style={[styles.tailorIcon, { backgroundColor: `${colors.primary}18` }]}>
                                    <Wand2 size={19} color={isPro ? colors.primary : '#F59E0B'} />
                                </View>
                                <View style={styles.flex}>
                                    <Text style={[styles.tailorTitle, { color: colors.foreground }]}>
                                        {t('editor.tailor.title')}
                                    </Text>
                                    <Text style={[styles.tailorSubtitle, { color: muted }]}>
                                        {t('editor.tailor.subtitle')}
                                    </Text>
                                </View>
                            </View>
                        </AnimatedPressable>
                    </Animated.View>
                )}
            </ScrollView>

            <WizardFooter
                onBack={() => goToStep(stepIndex - 1)}
                onNext={handleNext}
                nextLabel={isLast ? t('wizard.finish') : t('wizard.next')}
                isFirst={stepIndex === 0}
                isLast={isLast}
                busy={isSaving && isLast}
            />

            <CVHealthPanel
                visible={showHealth}
                report={report}
                onClose={() => setShowHealth(false)}
                onFix={handleFixFromHealth}
            />

            <UndoSnackbar
                message={pendingUndo ? t('wizard.delete.removed', { title: pendingUndo.title }) : null}
                actionLabel={t('wizard.delete.undo')}
                onAction={handleUndoDelete}
                onHide={() => setPendingUndo(null)}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    flex: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    iconBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        flex: 1,
    },
    nameInput: {
        fontSize: 16,
        fontWeight: '700',
        padding: 0,
    },
    saveState: {
        fontSize: 11,
        fontWeight: '600',
        marginTop: 2,
    },
    chipRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 4,
    },
    templateChip: {
        flex: 1,
        borderRadius: 999,
        borderWidth: 1,
    },
    templateChipInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    templateSwatch: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    templateChipText: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
    },
    templateChange: {
        fontSize: 12.5,
        fontWeight: '700',
    },
    reportChip: {
        borderRadius: 999,
        borderWidth: 1,
    },
    reportChipInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 11,
        paddingVertical: 8,
    },
    reportChipText: {
        fontSize: 12.5,
        fontWeight: '700',
    },
    body: {
        paddingHorizontal: SPACE.gutter,
        paddingTop: 8,
        paddingBottom: SPACE.section,
    },
    tailorBtn: {
        borderRadius: 16,
        borderWidth: 1,
        marginTop: 8,
    },
    tailorInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 16,
    },
    tailorIcon: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tailorTitle: {
        fontSize: 15,
        fontWeight: '700',
    },
    tailorSubtitle: {
        fontSize: 12.5,
        marginTop: 2,
        lineHeight: 18,
    },
});
