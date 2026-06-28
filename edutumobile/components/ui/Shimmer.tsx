import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
    Easing,
} from 'react-native-reanimated';

interface ShimmerProps {
    width?: number | string;
    height?: number;
    style?: StyleProp<ViewStyle>;
    isDark?: boolean;
    borderRadius?: number;
}

export default function Shimmer({
    width = '100%',
    height = 20,
    style,
    isDark = false,
    borderRadius = 8,
}: ShimmerProps) {
    const shimmerValue = useSharedValue(0);

    React.useEffect(() => {
        shimmerValue.value = withRepeat(
            withTiming(1, {
                duration: 1500,
                easing: Easing.inOut(Easing.ease),
            }),
            -1,
            true
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shimmerValue.value * 200 - 100 }],
    }));

    const baseColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const highlightColor = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.1)';

    const containerStyle: ViewStyle = {
        width: typeof width === 'number' ? width : undefined,
        maxWidth: typeof width === 'string' ? width as any : undefined,
        height,
        borderRadius,
        backgroundColor: baseColor,
        overflow: 'hidden',
    };

    return (
        <View style={[containerStyle, style]}>
            <Animated.View
                style={[
                    StyleSheet.absoluteFill,
                    {
                        backgroundColor: highlightColor,
                        transform: [{ skewX: '-20deg' }],
                    },
                    animatedStyle,
                ]}
            />
        </View>
    );
}

export function ShimmerCard({ isDark, style }: { isDark?: boolean; style?: StyleProp<ViewStyle> }) {
    return (
        <View style={[styles.card, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }, style]}>
            <View style={styles.cardHeader}>
                <Shimmer width={48} height={48} borderRadius={24} isDark={isDark} />
                <View style={styles.headerText}>
                    <Shimmer width={140} height={16} borderRadius={8} isDark={isDark} />
                    <Shimmer width={90} height={12} borderRadius={6} isDark={isDark} style={{ marginTop: 8 }} />
                </View>
            </View>
            <Shimmer width="100%" height={12} borderRadius={6} isDark={isDark} style={{ marginTop: 16 }} />
            <Shimmer width="85%" height={12} borderRadius={6} isDark={isDark} style={{ marginTop: 8 }} />
            <Shimmer width="60%" height={12} borderRadius={6} isDark={isDark} style={{ marginTop: 8 }} />
            <View style={styles.cardFooter}>
                <Shimmer width={80} height={32} borderRadius={16} isDark={isDark} />
                <Shimmer width={60} height={24} borderRadius={12} isDark={isDark} />
            </View>
        </View>
    );
}

export function ShimmerList({ count = 3, isDark, style }: { count?: number; isDark?: boolean; style?: StyleProp<ViewStyle> }) {
    return (
        <View style={style}>
            {Array.from({ length: count }).map((_, i) => (
                <ShimmerCard key={i} isDark={isDark} style={{ marginBottom: 12 }} />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerText: {
        flex: 1,
    },
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 16,
    },
});
