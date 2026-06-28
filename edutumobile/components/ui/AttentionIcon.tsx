import React, { useEffect } from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';

interface AttentionIconProps {
    children: React.ReactNode;
    type?: 'bounce' | 'pulse' | 'wiggle' | 'glow' | 'none';
    delay?: number;
    duration?: number;
    style?: StyleProp<ViewStyle>;
}

export default function AttentionIcon({ children, type = 'none', delay = 0, duration = 1500, style }: AttentionIconProps) {
    const translateY = useSharedValue<number>(0);
    const scale = useSharedValue<number>(1);
    const rotate = useSharedValue<number>(0);
    const opacity = useSharedValue<number>(1);

    useEffect(() => {
        if (type === 'none') return;

        switch (type) {
            case 'bounce':
                translateY.value = withDelay(
                    delay,
                    withRepeat(
                        withSequence(
                            withTiming(-6, { duration: 300, easing: Easing.out(Easing.cubic) }),
                            withTiming(0, { duration: 300, easing: Easing.in(Easing.cubic) }),
                            withTiming(-3, { duration: 200, easing: Easing.out(Easing.cubic) }),
                            withTiming(0, { duration: 200 })
                        ),
                        -1,
                        false
                    )
                );
                break;
            case 'pulse':
                scale.value = withDelay(
                    delay,
                    withRepeat(
                        withSequence(
                            withTiming(1.15, { duration: 500 }),
                            withTiming(1, { duration: 500 })
                        ),
                        -1,
                        true
                    )
                );
                break;
            case 'wiggle':
                rotate.value = withDelay(
                    delay,
                    withRepeat(
                        withSequence(
                            withTiming(6, { duration: 100 }),
                            withTiming(-6, { duration: 200 }),
                            withTiming(4, { duration: 150 }),
                            withTiming(-4, { duration: 150 }),
                            withTiming(0, { duration: 100 })
                        ),
                        -1,
                        false
                    )
                );
                break;
            case 'glow':
                opacity.value = withDelay(
                    delay,
                    withRepeat(
                        withSequence(
                            withTiming(0.6, { duration: 800 }),
                            withTiming(1, { duration: 800 })
                        ),
                        -1,
                        true
                    )
                );
                break;
        }
    }, [type, delay, duration]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: translateY.value },
            { scale: scale.value },
            { rotate: `${rotate.value}deg` },
        ],
        opacity: opacity.value,
    }));

    return (
        <Animated.View style={[style, animatedStyle]}>
            {children}
        </Animated.View>
    );
}
