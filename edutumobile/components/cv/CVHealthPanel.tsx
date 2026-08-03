import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Info, X } from 'lucide-react-native';
import type { CvHealthCheck, CvHealthReport, CvCheckStep } from '@edutu/core/src/services/cvHealth';
import { useTheme } from '../context/ThemeContext';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { AtsScanIllustration } from '../state/illustrations';

const BAND_COLORS = {
    weak: '#EF4444',
    fair: '#F59E0B',
    strong: '#10B981',
} as const;

const SEVERITY_ICON = {
    critical: AlertTriangle,
    warning: AlertTriangle,
    info: Info,
} as const;

const SEVERITY_COLOR = {
    critical: '#EF4444',
    warning: '#F59E0B',
    info: '#64748B',
} as const;

/** Compact score pill for the wizard header. */
export function CvHealthPill({
    report,
    onPress,
}: {
    report: CvHealthReport;
    onPress: () => void;
}) {
    const { t } = useTranslation('cv');
    const color = BAND_COLORS[report.band];
    return (
        <AnimatedPressable
            style={[styles.pill, { borderColor: `${color}66`, backgroundColor: `${color}18` }]}
            scaleTo={0.94}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={t('health.pillAccessibility', { score: report.score })}
        >
            <View style={styles.pillInner}>
                <View style={[styles.pillDot, { backgroundColor: color }]} />
                <Text style={[styles.pillText, { color }]}>{report.score}</Text>
            </View>
        </AnimatedPressable>
    );
}

/** Ring showing the score, coloured by band. */
function ScoreRing({ score, color }: { score: number; color: string }) {
    const size = 108;
    const stroke = 10;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const dash = (Math.max(0, Math.min(100, score)) / 100) * circumference;

    return (
        <View style={{ width: size, height: size }}>
            <Svg width={size} height={size}>
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={`${color}28`}
                    strokeWidth={stroke}
                    fill="none"
                />
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={color}
                    strokeWidth={stroke}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${circumference}`}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </Svg>
            <View style={styles.ringCenter}>
                <Text style={[styles.ringScore, { color }]}>{score}</Text>
                <Text style={[styles.ringOutOf, { color }]}>/100</Text>
            </View>
        </View>
    );
}

function CheckRow({
    check,
    onFix,
}: {
    check: CvHealthCheck;
    onFix: (step: CvCheckStep) => void;
}) {
    const { t } = useTranslation('cv');
    const { colors, isDark } = useTheme();
    const muted = isDark ? '#94A3B8' : '#64748B';
    const passed = check.status === 'pass';
    const color = passed ? '#10B981' : SEVERITY_COLOR[check.severity];
    const Icon = passed ? Check : SEVERITY_ICON[check.severity];

    return (
        <View style={[styles.checkRow, { borderColor: colors.border }]}>
            <View style={[styles.checkIcon, { backgroundColor: `${color}1F` }]}>
                <Icon size={14} color={color} strokeWidth={2.6} />
            </View>
            <Text style={[styles.checkLabel, { color: passed ? muted : colors.foreground }]}>
                {t(check.labelKey, check.values as Record<string, unknown>)}
            </Text>
            {!passed && (
                <AnimatedPressable
                    style={styles.fixBtn}
                    scaleTo={0.93}
                    onPress={() => onFix(check.step)}
                    accessibilityRole="button"
                >
                    <Text style={[styles.fixText, { color: colors.primary }]}>{t('health.fix')}</Text>
                </AnimatedPressable>
            )}
        </View>
    );
}

/**
 * The CV Health sheet: a weighted score plus every check, failures first, each
 * with a Fix action that jumps to the wizard step that owns it.
 */
export function CVHealthPanel({
    visible,
    report,
    onClose,
    onFix,
}: {
    visible: boolean;
    report: CvHealthReport;
    onClose: () => void;
    onFix: (step: CvCheckStep) => void;
}) {
    const { t } = useTranslation('cv');
    const { colors, isDark } = useTheme();
    const muted = isDark ? '#94A3B8' : '#64748B';
    const color = BAND_COLORS[report.band];

    const passing = report.checks.filter((check) => check.status === 'pass');

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Pressable
                    style={[styles.sheet, { backgroundColor: colors.background }]}
                    onPress={(event) => event.stopPropagation()}
                >
                    <View style={styles.grabber} />

                    <View style={styles.sheetHeader}>
                        <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                            {t('health.title')}
                        </Text>
                        <AnimatedPressable
                            style={styles.closeBtn}
                            scaleTo={0.9}
                            onPress={onClose}
                            accessibilityRole="button"
                            accessibilityLabel={t('health.close')}
                        >
                            <X size={20} color={muted} />
                        </AnimatedPressable>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
                        <View style={styles.scoreRow}>
                            {report.issues.length === 0 ? (
                                <AtsScanIllustration size={116} />
                            ) : (
                                <ScoreRing score={report.score} color={color} />
                            )}
                            <View style={styles.scoreCopy}>
                                <Text style={[styles.bandTitle, { color: colors.foreground }]}>
                                    {t(`health.band.${report.band}.title`)}
                                </Text>
                                <Text style={[styles.bandText, { color: muted }]}>
                                    {t(`health.band.${report.band}.description`, {
                                        count: report.issues.length,
                                    })}
                                </Text>
                            </View>
                        </View>

                        {report.issues.length > 0 && (
                            <>
                                <Text style={[styles.groupLabel, { color: muted }]}>
                                    {t('health.toFix', { count: report.issues.length })}
                                </Text>
                                {report.issues.map((check) => (
                                    <CheckRow key={check.id} check={check} onFix={onFix} />
                                ))}
                            </>
                        )}

                        {passing.length > 0 && (
                            <>
                                <Text style={[styles.groupLabel, { color: muted, marginTop: 22 }]}>
                                    {t('health.passing', { count: passing.length })}
                                </Text>
                                {passing.map((check) => (
                                    <CheckRow key={check.id} check={check} onFix={onFix} />
                                ))}
                            </>
                        )}
                    </ScrollView>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    pill: {
        borderRadius: 999,
        borderWidth: 1,
    },
    pillInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 11,
        paddingVertical: 6,
    },
    pillDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    pillText: {
        fontSize: 13,
        fontWeight: '800',
    },
    ringCenter: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ringScore: {
        fontSize: 30,
        fontWeight: '800',
    },
    ringOutOf: {
        fontSize: 11,
        fontWeight: '700',
        opacity: 0.7,
        marginTop: -2,
    },
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(2,6,23,0.55)',
        justifyContent: 'flex-end',
    },
    sheet: {
        maxHeight: '88%',
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        paddingHorizontal: 20,
        paddingBottom: 32,
    },
    grabber: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(148,163,184,0.4)',
        marginTop: 10,
        marginBottom: 12,
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sheetTitle: {
        fontSize: 21,
        fontWeight: '800',
    },
    closeBtn: {
        padding: 6,
    },
    sheetBody: {
        paddingTop: 18,
        paddingBottom: 16,
    },
    scoreRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 18,
        marginBottom: 24,
    },
    scoreCopy: {
        flex: 1,
    },
    bandTitle: {
        fontSize: 17,
        fontWeight: '800',
        marginBottom: 5,
    },
    bandText: {
        fontSize: 13.5,
        lineHeight: 20,
    },
    groupLabel: {
        fontSize: 11.5,
        fontWeight: '800',
        letterSpacing: 0.9,
        textTransform: 'uppercase',
        marginBottom: 10,
    },
    checkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    checkIcon: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkLabel: {
        flex: 1,
        fontSize: 14,
        lineHeight: 20,
    },
    fixBtn: {
        paddingHorizontal: 4,
        paddingVertical: 4,
    },
    fixText: {
        fontSize: 13.5,
        fontWeight: '700',
    },
});
