import React, { useEffect, useState } from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
} from 'react-native-reanimated';

interface AnimatedCounterProps extends Omit<TextProps, 'children'> {
    value: number;
    duration?: number;
    prefix?: string;
    suffix?: string;
}

export default function AnimatedCounter({
    value,
    duration = 1000,
    prefix = '',
    suffix = '',
    style,
    ...rest
}: AnimatedCounterProps) {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        const startTime = Date.now();
        const startValue = displayValue;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);

            const current = Math.round(startValue + (value - startValue) * eased);
            setDisplayValue(current);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [value, duration]);

    return (
        <Text style={style} {...rest}>
            {prefix}{displayValue.toLocaleString()}{suffix}
        </Text>
    );
}
