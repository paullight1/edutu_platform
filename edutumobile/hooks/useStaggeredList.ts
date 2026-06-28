import { useState, useEffect, useRef } from 'react';
import { Animated } from 'react-native';

interface UseStaggeredListOptions {
    itemCount: number;
    initialDelay?: number;
    staggerDelay?: number;
    duration?: number;
    enabled?: boolean;
}

export function useStaggeredList({
    itemCount,
    initialDelay = 100,
    staggerDelay = 60,
    duration = 400,
    enabled = true,
}: UseStaggeredListOptions) {
    const [animations, setAnimations] = useState<Animated.Value[]>([]);
    const hasAnimated = useRef(false);

    useEffect(() => {
        if (!enabled || hasAnimated.current) return;

        const newAnimations = Array.from({ length: itemCount }, () => new Animated.Value(0));
        setAnimations(newAnimations);

        const animationsToRun = newAnimations.map((anim, index) => {
            return Animated.timing(anim, {
                toValue: 1,
                duration,
                delay: initialDelay + index * staggerDelay,
                useNativeDriver: true,
            });
        });

        Animated.parallel(animationsToRun).start();
        hasAnimated.current = true;

        return () => {
            animationsToRun.forEach(a => a.stop());
        };
    }, [itemCount, enabled, initialDelay, staggerDelay, duration]);

    const getAnimationStyle = (index: number) => {
        if (!animations[index]) {
            return { opacity: enabled ? 0 : 1, transform: [{ translateY: enabled ? 20 : 0 }] };
        }
        return {
            opacity: animations[index],
            transform: [
                {
                    translateY: animations[index].interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0],
                    }),
                },
            ],
        };
    };

    const reset = () => {
        hasAnimated.current = false;
        setAnimations([]);
    };

    return { getAnimationStyle, reset };
}
