import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

interface AnimatedBadgeProps {
    count?: number | '!';
    variant?: 'default' | 'pulse' | 'dot';
    color?: string;
    style?: StyleProp<ViewStyle>;
}

export default function AnimatedBadge({ count, variant = 'default', color, style }: AnimatedBadgeProps) {
    const ringScale = useSharedValue(1);
    const ringOpacity = useSharedValue(0);

    useEffect(() => {
        if (variant === 'pulse') {
            ringScale.value = withRepeat(
                withSequence(
                    withTiming(1.6, { duration: 800 }),
                    withTiming(1, { duration: 800 })
                ),
                -1,
                true
            );
            ringOpacity.value = withRepeat(
                withSequence(
                    withTiming(0.4, { duration: 800 }),
                    withTiming(0, { duration: 800 })
                ),
                -1,
                true
            );
        }
    }, [variant]);

    const ringStyle = useAnimatedStyle(() => ({
        transform: [{ scale: ringScale.value }],
        opacity: ringOpacity.value,
    }));

    if (count === undefined || count === null) return null;

    const label = typeof count === 'number' ? (count > 99 ? '99+' : String(count)) : count;
    const badgeColor = color || '#EF4444';
    const isDot = variant === 'dot';

    return (
        <View style={[styles.container, style]}>
            {variant === 'pulse' && (
                <Animated.View
                    style={[
                        styles.ring,
                        { backgroundColor: badgeColor },
                        ringStyle,
                    ]}
                />
            )}
            {isDot ? (
                <View style={[styles.dot, { backgroundColor: badgeColor }]} />
            ) : (
                <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                    <Text style={styles.badgeText}>{label}</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    badge: {
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 5,
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '800',
        lineHeight: 12,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    ring: {
        position: 'absolute',
        width: 18,
        height: 18,
        borderRadius: 9,
    },
});
