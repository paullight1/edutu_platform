import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AnimatedPressable } from '../../ui/AnimatedPressable';
import { useFieldColors } from './formKit';

export interface WizardStepMeta {
    key: string;
    titleKey: string;
}

/**
 * Progress header: a bar plus tappable step dots.
 *
 * The dots matter for edit mode — somebody fixing one line in an existing CV
 * should not have to walk five steps to reach it.
 */
export function WizardProgress({
    steps,
    activeIndex,
    completed,
    onJump,
}: {
    steps: WizardStepMeta[];
    activeIndex: number;
    /** Step keys whose required content is present. */
    completed: Set<string>;
    onJump: (index: number) => void;
}) {
    const { t } = useTranslation('cv');
    const { colors, muted, fieldBorder } = useFieldColors();

    const progress = (activeIndex + 1) / steps.length;
    // Animate scaleX rather than a percentage width: Reanimated needs a prior
    // numeric value to interpolate from, and a string width has none on first
    // render.
    const barStyle = useAnimatedStyle(() => ({
        transform: [{ scaleX: withTiming(progress, { duration: 260 }) }],
    }));

    return (
        <View style={styles.progressWrap}>
            {/* Only the counter here — the step's own heading owns the title,
                and printing it twice made the screen read as two headings. */}
            <View style={styles.progressTopRow}>
                <Text style={[styles.stepCounter, { color: muted }]}>
                    {t('wizard.stepCounter', { current: activeIndex + 1, total: steps.length })}
                </Text>
            </View>

            <View style={[styles.track, { backgroundColor: fieldBorder }]}>
                <Animated.View style={[styles.trackFill, { backgroundColor: colors.primary }, barStyle]} />
            </View>

            <View style={styles.dotRow}>
                {steps.map((step, index) => {
                    const isActive = index === activeIndex;
                    const isDone = completed.has(step.key);
                    return (
                        <AnimatedPressable
                            key={step.key}
                            style={styles.dotHit}
                            scaleTo={0.9}
                            hapticFeedback="selection"
                            onPress={() => onJump(index)}
                            accessibilityRole="button"
                            accessibilityLabel={t(step.titleKey)}
                            accessibilityState={{ selected: isActive }}
                        >
                            <View
                                style={[
                                    styles.dot,
                                    {
                                        backgroundColor: isActive || isDone ? colors.primary : 'transparent',
                                        borderColor: isActive || isDone ? colors.primary : fieldBorder,
                                        width: isActive ? 26 : 10,
                                    },
                                ]}
                            >
                                {isDone && !isActive && <Check size={7} color="#FFFFFF" strokeWidth={4} />}
                            </View>
                        </AnimatedPressable>
                    );
                })}
            </View>
        </View>
    );
}

/**
 * Sticky footer: quiet Back, bold Next.
 *
 * Save and Export used to sit at the bottom of a 2,000px scroll — the two most
 * important actions were the hardest to reach. The primary action is now
 * always on screen, and the label says what actually happens next.
 */
export function WizardFooter({
    onBack,
    onNext,
    nextLabel,
    isFirst,
    isLast,
    busy,
}: {
    onBack: () => void;
    onNext: () => void;
    nextLabel: string;
    isFirst: boolean;
    isLast: boolean;
    busy?: boolean;
}) {
    const { t } = useTranslation('cv');
    const { colors, isDark, fieldBorder } = useFieldColors();

    return (
        <View
            style={[
                styles.footer,
                {
                    backgroundColor: isDark ? 'rgba(2,6,23,0.92)' : 'rgba(255,255,255,0.94)',
                    borderTopColor: fieldBorder,
                },
            ]}
        >
            {!isFirst && (
                <AnimatedPressable
                    style={[styles.backBtn, { borderColor: fieldBorder }]}
                    scaleTo={0.96}
                    onPress={onBack}
                    accessibilityRole="button"
                    accessibilityLabel={t('wizard.back')}
                >
                    <View style={styles.backBtnInner}>
                        <ChevronLeft size={20} color={colors.foreground} strokeWidth={2.5} />
                        <Text style={[styles.backText, { color: colors.foreground }]}>{t('wizard.back')}</Text>
                    </View>
                </AnimatedPressable>
            )}

            <AnimatedPressable
                style={[styles.nextBtn, { backgroundColor: colors.primary, opacity: busy ? 0.75 : 1 }]}
                scaleTo={0.97}
                hapticFeedback="medium"
                disabled={busy}
                onPress={onNext}
                accessibilityRole="button"
                accessibilityLabel={nextLabel}
            >
                <View style={styles.nextBtnInner}>
                    {busy ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                        <>
                            <Text style={styles.nextText}>{nextLabel}</Text>
                            {isLast ? (
                                <Check size={20} color="#FFFFFF" strokeWidth={3} />
                            ) : (
                                <ChevronRight size={20} color="#FFFFFF" strokeWidth={3} />
                            )}
                        </>
                    )}
                </View>
            </AnimatedPressable>
        </View>
    );
}

const styles = StyleSheet.create({
    progressWrap: {
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 14,
    },
    progressTopRow: {
        marginBottom: 10,
    },
    stepCounter: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    track: {
        height: 5,
        borderRadius: 3,
        overflow: 'hidden',
    },
    trackFill: {
        height: '100%',
        width: '100%',
        borderRadius: 3,
        transformOrigin: 'left',
    },
    dotRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        marginTop: 10,
    },
    dotHit: {
        paddingHorizontal: 4,
        paddingVertical: 6,
    },
    dot: {
        height: 10,
        borderRadius: 5,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 12,
        borderTopWidth: 1,
    },
    backBtn: {
        borderRadius: 16,
        borderWidth: 1.5,
        minWidth: 106,
    },
    backBtnInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        height: 56,
        paddingHorizontal: 16,
    },
    backText: {
        fontSize: 16,
        fontWeight: '600',
    },
    nextBtn: {
        flex: 1,
        borderRadius: 16,
    },
    nextBtnInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 56,
    },
    nextText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
});
