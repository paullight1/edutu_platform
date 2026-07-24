import React, { useEffect } from 'react';
import {
    View,
    Text,
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
import { X, Check, Download, Wand2, Pencil, Plus } from 'lucide-react-native';
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
}: Props) {
    const { t } = useTranslation('cv');
    const { colors, isDark } = useTheme();
    const muted = isDark ? '#94A3B8' : '#64748B';
    const cardBg = isDark ? '#1E293B' : '#FFFFFF';
    const chipBg = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';

    const score = Math.max(0, Math.min(100, Math.round(result?.match_score || 0)));

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
                    </ScrollView>

                    {/* Actions */}
                    <View style={[styles.actions, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]}>
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
    actions: {
        flexDirection: 'row',
        gap: 12,
        padding: 16,
        borderTopWidth: 1,
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
