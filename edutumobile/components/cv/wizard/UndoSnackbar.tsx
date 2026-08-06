import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { Undo2 } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { AnimatedPressable } from '../../ui/AnimatedPressable';

const AUTO_DISMISS_MS = 5000;

interface Props {
    /** Snackbar copy; null hides it. */
    message: string | null;
    actionLabel: string;
    onAction: () => void;
    onHide: () => void;
}

/**
 * Destructive-action snackbar with a real Undo.
 *
 * `CvToast` is `pointerEvents="none"` — deliberately, since it only confirms
 * success. Deleting a CV entry needs something tappable, and a five-second
 * window is what makes the single-tap delete safe.
 */
export function UndoSnackbar({ message, actionLabel, onAction, onHide }: Props) {
    const { colors, isDark } = useTheme();

    useEffect(() => {
        if (!message) return;
        const timer = setTimeout(onHide, AUTO_DISMISS_MS);
        return () => clearTimeout(timer);
    }, [message, onHide]);

    if (!message) return null;

    return (
        <Animated.View
            entering={FadeInUp.springify().damping(16)}
            exiting={FadeOutDown.duration(180)}
            style={styles.wrap}
        >
            <View style={[styles.bar, { backgroundColor: isDark ? '#1E293B' : '#0F172A' }]}>
                <Text style={styles.text} numberOfLines={2}>
                    {message}
                </Text>
                <AnimatedPressable
                    style={styles.action}
                    scaleTo={0.93}
                    onPress={onAction}
                    accessibilityRole="button"
                    accessibilityLabel={actionLabel}
                >
                    <View style={styles.actionInner}>
                        <Undo2 size={15} color={colors.accentLight || '#818CF8'} strokeWidth={2.5} />
                        <Text style={[styles.actionText, { color: colors.accentLight || '#818CF8' }]}>
                            {actionLabel}
                        </Text>
                    </View>
                </AnimatedPressable>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 96,
        zIndex: 60,
    },
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingLeft: 16,
        paddingRight: 8,
        borderRadius: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 14,
        elevation: 10,
    },
    text: {
        flex: 1,
        color: '#F8FAFC',
        fontSize: 13.5,
        fontWeight: '600',
        lineHeight: 19,
    },
    action: {
        borderRadius: 10,
    },
    actionInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    actionText: {
        fontSize: 13.5,
        fontWeight: '800',
    },
});
