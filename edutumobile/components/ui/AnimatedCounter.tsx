import React, { useEffect, useRef, useState } from 'react';
import { Text, TextProps } from 'react-native';



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

    // Post-commit mirror of displayValue: the animation effect must start
    // from the currently shown number without depending on displayValue
    // itself (that would re-fire it every animation frame).
    const displayValueRef = useRef(0);
    useEffect(() => {
        displayValueRef.current = displayValue;
    });

    useEffect(() => {
        const startTime = Date.now();
        const startValue = displayValueRef.current;

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
