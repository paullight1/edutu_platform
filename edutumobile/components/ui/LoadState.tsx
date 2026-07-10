import React, { useEffect, useRef, useState } from 'react';
import {
    Animated,
    StyleProp,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Info, WifiOff, ChevronLeft, RotateCw } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { BrandedLoader } from './BrandedLoader';

type LoadStateProps = {
    /** Label shown under the spinner while loading. */
    label?: string;
    /** True once the underlying request has actually failed (network/error). */
    error?: boolean | unknown;
    /** How long to wait before showing the "taking longer than expected" notice. */
    slowAfterMs?: number;
    /** Called when the user taps "Try again". */
    onRetry?: () => void;
    /** Called when the user taps "Back". If omitted, the Back button is hidden. */
    onBack?: () => void;
    /** Set while a retry is in flight (spins the retry icon, disables the button). */
    retrying?: boolean;
    /** Custom copy for the error card (defaults to a generic connection message). */
    errorTitle?: string;
    errorText?: string;
    style?: StyleProp<ViewStyle>;
};

/**
 * Unified loading / slow-load / error surface used across the app.
 *
 * - Shows a branded spinner immediately.
 * - After `slowAfterMs` of continuous loading, fades in a "taking longer than
 *   expected" notice with Back / Try again actions.
 * - When `error` is truthy it swaps straight to a connection-error card so the
 *   user is never stuck staring at an infinite spinner.
 *
 * All copy lives under the `common:loadState.*` i18n keys and every colour is a
 * theme token, so it looks correct in light/dark and every theme package.
 */
export function LoadState({
    label,
    error,
    slowAfterMs = 8000,
    onRetry,
    onBack,
    retrying = false,
    errorTitle,
    errorText,
    style,
}: LoadStateProps) {
    const { t } = useTranslation('common');
    const { isDark, colors } = useTheme();
    const [showSlow, setShowSlow] = useState(false);
    const opacity = useRef(new Animated.Value(0)).current;
    const spin = useRef(new Animated.Value(0)).current;

    const hasError = Boolean(error);
    const showNotice = hasError || showSlow;

    // Fade the notice in once it becomes relevant.
    useEffect(() => {
        if (!showNotice) {
            opacity.setValue(0);
            return;
        }
        Animated.timing(opacity, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
        }).start();
    }, [showNotice, opacity]);

    // Slow-load timer — only while genuinely loading (not already errored).
    useEffect(() => {
        if (hasError) return;
        setShowSlow(false);
        const id = setTimeout(() => setShowSlow(true), slowAfterMs);
        return () => clearTimeout(id);
    }, [hasError, slowAfterMs]);

    // Spin the retry glyph while a retry is running.
    useEffect(() => {
        if (!retrying) {
            spin.setValue(0);
            return;
        }
        const anim = Animated.loop(
            Animated.timing(spin, { toValue: 1, duration: 800, useNativeDriver: true }),
        );
        anim.start();
        return () => anim.stop();
    }, [retrying, spin]);

    const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

    const textPrimary = colors.foreground;
    const textSecondary = colors.textSecondary;
    const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#ffffff';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
    const subtleBtnBg = isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc';

    const accent = hasError ? colors.error : colors.accent;
    const title = hasError
        ? errorTitle ?? t('loadState.errorTitle')
        : t('loadState.slowTitle');
    const body = hasError
        ? errorText ?? t('loadState.errorText')
        : t('loadState.slowText');

    return (
        <View style={[styles.center, style]}>
            {hasError ? (
                <View style={styles.errorGlyphWrap}>
                    <View style={[styles.errorGlyph, { backgroundColor: `${colors.error}14` }]}>
                        <WifiOff size={30} color={colors.error} />
                    </View>
                    {label ? (
                        <Text style={[styles.errorGlyphLabel, { color: textSecondary }]}>{label}</Text>
                    ) : null}
                </View>
            ) : (
                <BrandedLoader label={label} />
            )}

            {showNotice && (
                <Animated.View
                    style={[styles.notice, { opacity, backgroundColor: cardBg, borderColor }]}
                >
                    <View style={[styles.noticeIcon, { backgroundColor: `${accent}14` }]}>
                        {hasError ? (
                            <WifiOff size={18} color={accent} />
                        ) : (
                            <Info size={18} color={accent} />
                        )}
                    </View>
                    <View style={styles.noticeCopy}>
                        <Text style={[styles.noticeTitle, { color: textPrimary }]}>{title}</Text>
                        <Text style={[styles.noticeText, { color: textSecondary }]}>{body}</Text>
                    </View>
                    <View style={styles.noticeActions}>
                        {onBack && (
                            <TouchableOpacity
                                style={[styles.noticeBtn, { backgroundColor: subtleBtnBg }]}
                                onPress={onBack}
                                activeOpacity={0.8}
                            >
                                <ChevronLeft size={14} color={textSecondary} />
                                <Text style={[styles.noticeBtnText, { color: textSecondary }]}>
                                    {t('actions.back')}
                                </Text>
                            </TouchableOpacity>
                        )}
                        {onRetry && (
                            <TouchableOpacity
                                style={[styles.noticeBtn, { backgroundColor: accent, opacity: retrying ? 0.7 : 1 }]}
                                onPress={onRetry}
                                disabled={retrying}
                                activeOpacity={0.85}
                            >
                                <Animated.View style={{ transform: [{ rotate }] }}>
                                    <RotateCw size={13} color="#FFFFFF" />
                                </Animated.View>
                                <Text style={[styles.noticeBtnText, { color: '#FFFFFF' }]}>
                                    {t('actions.tryAgain')}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    errorGlyphWrap: { alignItems: 'center', minHeight: 160, justifyContent: 'center' },
    errorGlyph: {
        width: 76,
        height: 76,
        borderRadius: 38,
        alignItems: 'center',
        justifyContent: 'center',
    },
    errorGlyphLabel: { marginTop: 20, fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
    notice: {
        width: '100%',
        maxWidth: 420,
        marginTop: 24,
        borderWidth: 1,
        borderRadius: 18,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    noticeIcon: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    noticeCopy: { flex: 1 },
    noticeTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
    noticeText: { fontSize: 12, lineHeight: 17 },
    noticeActions: { marginTop: 2, gap: 8 },
    noticeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
    },
    noticeBtnText: { fontSize: 11, fontWeight: '700' },
});
