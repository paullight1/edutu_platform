import React, { useEffect } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { haptics } from '../../lib/haptics';

interface Props {
    /** Toast copy; null hides the toast. */
    message: string | null;
    /** Called after the auto-dismiss delay — parent clears `message`. */
    onHide: () => void;
}

const AUTO_DISMISS_MS = 2200;

/**
 * Lightweight branded success toast for the CV flow — a rounded pill with a
 * checkmark that slides up from the bottom, fires a success haptic, and
 * auto-dismisses. Replaces system Alert.alert for non-blocking confirmations.
 */
export function CvToast({ message, onHide }: Props) {
    const { colors } = useTheme();

    useEffect(() => {
        if (!message) return;
        haptics.success();
        const timer = setTimeout(onHide, AUTO_DISMISS_MS);
        return () => clearTimeout(timer);
    }, [message, onHide]);

    if (!message) return null;

    return (
        <Animated.View
            entering={FadeInUp.springify().damping(16)}
            exiting={FadeOutDown.duration(200)}
            style={styles.wrap}
            pointerEvents="none"
        >
            <View style={[styles.pill, { backgroundColor: colors.primary }]}>
                <View style={styles.checkCircle}>
                    <Check size={13} color="#FFFFFF" strokeWidth={3.2} />
                </View>
                <Text style={styles.text} numberOfLines={2}>
                    {message}
                </Text>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 36,
        alignItems: 'center',
        zIndex: 50,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        maxWidth: '86%',
        paddingVertical: 11,
        paddingHorizontal: 18,
        borderRadius: 999,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
        elevation: 8,
    },
    checkCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.24)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        color: '#FFFFFF',
        fontSize: 13.5,
        fontWeight: '700',
    },
});
