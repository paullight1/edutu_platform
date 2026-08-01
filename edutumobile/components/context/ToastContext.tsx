import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { haptics } from '../../lib/haptics';
import { useTheme } from './ThemeContext';

export type ToastVariant = 'default' | 'success' | 'error';

export interface ToastAction {
    label: string;
    onPress: () => void;
}

export interface ToastOptions {
    message: string;
    emoji?: string;
    variant?: ToastVariant;
    /**
     * A way forward, shown as a trailing button — "Undo" after a reversible
     * action, "Try again" after a failure. A failure toast with no action is
     * just the OS alert with a shorter lifespan.
     */
    action?: ToastAction;
    /** Overrides the default lifespan. Failures need longer than successes. */
    durationMs?: number;
}

interface ToastContextValue {
    show: (options: ToastOptions) => void;
}

const DEFAULT_DISMISS_MS = 2500;
/** Long enough to read and reach, short enough not to sit in the way. */
const ACTION_DISMISS_MS = 5000;
const EXIT_MS = 220;

// Default no-op so `useToast()` never throws when used outside the provider.
const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    /**
     * The queue is state, and the visible toast is simply its head.
     *
     * A second toast arriving mid-flight now waits for the first to leave
     * rather than replacing it mid-sentence — previously the newer message
     * clobbered the older one, so a rapid pair meant the first was never read.
     *
     * Modelling it as a queue rather than a "present the next one" callback
     * keeps the drain non-recursive: presentation is an effect keyed on the
     * head, so there is no self-referencing callback and no stale closure.
     */
    const [queue, setQueue] = useState<ToastOptions[]>([]);
    const toast = queue[0] ?? null;

    const opacity = useSharedValue(0);
    const translateY = useSharedValue(-16);

    const show = useCallback((options: ToastOptions) => {
        // Cap the backlog: a burst of failures must not queue a minute of
        // toasts the user has to sit through.
        setQueue((current) => (current.length >= 3 ? current : [...current, options]));
    }, []);

    const dismissNow = useCallback(() => {
        setQueue((current) => current.slice(1));
    }, []);

    // Presentation lifecycle for whichever toast is currently at the head.
    useEffect(() => {
        if (!toast) return;

        opacity.value = withTiming(1, { duration: 220 });
        translateY.value = withTiming(0, { duration: 220 });

        const lifespan =
            toast.durationMs ?? (toast.action ? ACTION_DISMISS_MS : DEFAULT_DISMISS_MS);

        const hideTimer = setTimeout(() => {
            opacity.value = withTiming(0, { duration: EXIT_MS });
            translateY.value = withTiming(-16, { duration: EXIT_MS });
        }, lifespan);

        // Drop the head only after the exit animation has finished, so the
        // next toast does not pop in over the outgoing one.
        const dropTimer = setTimeout(() => {
            setQueue((current) => current.slice(1));
        }, lifespan + EXIT_MS + 20);

        return () => {
            clearTimeout(hideTimer);
            clearTimeout(dropTimer);
        };
    }, [toast, opacity, translateY]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: translateY.value }],
    }));

    const accent =
        toast?.variant === 'error'
            ? colors.error
            : toast?.variant === 'success'
                ? colors.success
                : colors.accent;

    return (
        <ToastContext.Provider value={{ show }}>
            {children}
            {/* box-none, not none: the container must stay transparent to touch
                while letting the action button inside receive taps. Under the
                previous pointerEvents="none" an action could be rendered but
                never pressed. */}
            <View
                pointerEvents="box-none"
                style={[styles.container, { top: insets.top + 8 }]}
            >
                {toast && (
                    <Animated.View
                        style={[
                            styles.toast,
                            {
                                backgroundColor: colors.card,
                                borderColor: isDark
                                    ? 'rgba(255,255,255,0.10)'
                                    : 'rgba(0,0,0,0.06)',
                                shadowColor: isDark ? '#000000' : accent,
                            },
                            animatedStyle,
                        ]}
                        accessibilityLiveRegion="polite"
                        accessibilityRole={toast.variant === 'error' ? 'alert' : 'text'}
                    >
                        <View style={[styles.accentBar, { backgroundColor: accent }]} />
                        {toast.emoji ? (
                            <Text style={styles.emoji}>{toast.emoji}</Text>
                        ) : null}
                        <Text
                            style={[styles.message, { color: colors.foreground }]}
                            numberOfLines={2}
                            maxFontSizeMultiplier={1.4}
                        >
                            {toast.message}
                        </Text>

                        {toast.action ? (
                            <Pressable
                                onPress={() => {
                                    haptics.light();
                                    const run = toast.action?.onPress;
                                    dismissNow();
                                    run?.();
                                }}
                                accessibilityRole="button"
                                accessibilityLabel={toast.action.label}
                                hitSlop={10}
                                style={({ pressed }) => [
                                    styles.action,
                                    {
                                        backgroundColor: `${accent}1F`,
                                        opacity: pressed ? 0.7 : 1,
                                    },
                                ]}
                            >
                                <Text
                                    style={[styles.actionText, { color: accent }]}
                                    maxFontSizeMultiplier={1.2}
                                >
                                    {toast.action.label}
                                </Text>
                            </Pressable>
                        ) : null}
                    </Animated.View>
                )}
            </View>
        </ToastContext.Provider>
    );
}

export function useToast(): ToastContextValue {
    return useContext(ToastContext);
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 9999,
        elevation: 9999,
    },
    toast: {
        maxWidth: '92%',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingLeft: 14,
        paddingRight: 14,
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
        gap: 10,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.22,
        shadowRadius: 16,
    },
    accentBar: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
    },
    emoji: {
        fontSize: 18,
    },
    message: {
        flexShrink: 1,
        fontSize: 14,
        fontWeight: '600',
        letterSpacing: 0.1,
    },
    action: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 9,
        minHeight: 32,
        justifyContent: 'center',
    },
    actionText: {
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.1,
    },
});
