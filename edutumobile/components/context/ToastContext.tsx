import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { useTheme } from './ThemeContext';

export type ToastVariant = 'default' | 'success' | 'error';

export interface ToastOptions {
    message: string;
    emoji?: string;
    variant?: ToastVariant;
}

interface ToastContextValue {
    show: (options: ToastOptions) => void;
}

const DISMISS_MS = 2500;

// Default no-op so `useToast()` never throws when used outside the provider.
const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const [toast, setToast] = useState<ToastOptions | null>(null);

    const opacity = useSharedValue(0);
    const translateY = useSharedValue(-16);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimer = useCallback(() => {
        if (hideTimer.current) {
            clearTimeout(hideTimer.current);
            hideTimer.current = null;
        }
    }, []);

    const show = useCallback(
        (options: ToastOptions) => {
            clearTimer();
            setToast(options);
            opacity.value = withTiming(1, { duration: 220 });
            translateY.value = withTiming(0, { duration: 220 });

            hideTimer.current = setTimeout(() => {
                opacity.value = withTiming(0, { duration: 220 });
                translateY.value = withTiming(-16, { duration: 220 });
                // Unmount after the exit animation completes.
                hideTimer.current = setTimeout(() => setToast(null), 240);
            }, DISMISS_MS);
        },
        [clearTimer, opacity, translateY],
    );

    useEffect(() => clearTimer, [clearTimer]);

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
            <View
                pointerEvents="none"
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
                    >
                        <View style={[styles.accentBar, { backgroundColor: accent }]} />
                        {toast.emoji ? (
                            <Text style={styles.emoji}>{toast.emoji}</Text>
                        ) : null}
                        <Text
                            style={[styles.message, { color: colors.foreground }]}
                            numberOfLines={2}
                        >
                            {toast.message}
                        </Text>
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
        maxWidth: '90%',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingLeft: 14,
        paddingRight: 18,
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
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
        marginRight: 10,
    },
    message: {
        flexShrink: 1,
        fontSize: 14,
        fontWeight: '600',
        letterSpacing: 0.1,
    },
});
