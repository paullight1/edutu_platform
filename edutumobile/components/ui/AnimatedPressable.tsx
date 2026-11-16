import React, { forwardRef } from 'react';
import {
    ViewStyle,
    StyleProp,
    View,
    PressableProps,
    Pressable as RNPressable,
    TouchableOpacityProps,
} from 'react-native';
import Animated, {
    BaseAnimationBuilder,
    EntryExitAnimationFunction,
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    FadeIn,
    FadeInDown,
    FadeInUp,
    ZoomIn,
    Layout,
} from 'react-native-reanimated';
import { haptics } from '../../lib/haptics';

// ─────────────────────────────────────────────────────────────
// Animated TouchableOpacity (legacy API, same spring feedback)
// ─────────────────────────────────────────────────────────────


interface AnimatedPressableProps extends Omit<PressableProps, 'style'> {
    style?: StyleProp<ViewStyle>;
    hapticFeedback?: 'none' | 'light' | 'medium' | 'heavy' | 'selection';
    scaleTo?: number;
    disabled?: boolean;
    children: React.ReactNode;
    entering?: BaseAnimationBuilder | EntryExitAnimationFunction;
}

const ReanimatedPressable = Animated.createAnimatedComponent(RNPressable);

export const AnimatedPressable = forwardRef<View, AnimatedPressableProps>(
    function AnimatedPressable({
        style,
        hapticFeedback = 'light',
        scaleTo = 0.96,
        disabled,
        onPress,
        onPressIn,
        onPressOut,
        children,
        entering,
        ...rest
    }, ref) {
        const scale = useSharedValue(1);

        const animatedStyle = useAnimatedStyle(() => ({
            transform: [{ scale: scale.value }],
        }));

        const triggerHaptic = () => {
            if (hapticFeedback === 'none') return;
            // Routed through the façade so the global Settings toggle silences it.
            haptics[hapticFeedback]();
        };

        return (
            <ReanimatedPressable
                ref={ref}
                style={[animatedStyle, style]}
                entering={entering}
                disabled={disabled}
                {...rest}
                onPressIn={(event) => {
                    // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write; the library's documented imperative API
                    scale.value = withSpring(scaleTo, { damping: 12, stiffness: 400 });
                    onPressIn?.(event);
                }}
                onPressOut={(event) => {
                    // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write; the library's documented imperative API
                    scale.value = withSpring(1, { damping: 12, stiffness: 400 });
                    onPressOut?.(event);
                }}
                onPress={(event) => {
                    triggerHaptic();
                    onPress?.(event);
                }}
            >
                {children}
            </ReanimatedPressable>
        );
    }
);

interface AnimatedTouchableOpacityProps extends TouchableOpacityProps {
    hapticFeedback?: 'none' | 'light' | 'medium' | 'heavy' | 'selection';
    scaleTo?: number;
}

export const AnimatedTouchableOpacity: React.FC<AnimatedTouchableOpacityProps> = ({
    style,
    hapticFeedback = 'light',
    scaleTo = 0.96,
    onPressIn,
    onPressOut,
    onPress,
    children,
    disabled,
}) => {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const triggerHaptic = () => {
        if (hapticFeedback === 'none') return;
        // Routed through the façade so the global Settings toggle silences it.
        haptics[hapticFeedback]();
    };

    return (
        <Animated.View
            style={[
                animatedStyle,
                style as StyleProp<ViewStyle>,
                disabled && { opacity: 0.5 },
            ]}
        >
            <RNPressable
                style={{ flex: 1 }}
                disabled={disabled}
                onPressIn={(e) => {
                    // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write; the library's documented imperative API
                    scale.value = withSpring(scaleTo, { damping: 12, stiffness: 400 });
                    onPressIn?.(e);
                }}
                onPressOut={(e) => {
                    // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write; the library's documented imperative API
                    scale.value = withSpring(1, { damping: 12, stiffness: 400 });
                    onPressOut?.(e);
                }}
                onPress={(e) => {
                    triggerHaptic();
                    onPress?.(e);
                }}
            >
                {children}
            </RNPressable>
        </Animated.View>
    );
};

// ─────────────────────────────────────────────────────────────
// Re-export Reanimated entering/exiting/transition presets
// ─────────────────────────────────────────────────────────────

export const Animations = {
    fadeIn: FadeIn,
    fadeInDown: FadeInDown,
    fadeInUp: FadeInUp,
    zoomIn: ZoomIn,
    layout: Layout,
};

export type AnimationPreset = 'fade' | 'fadeDown' | 'fadeUp' | 'zoom';

export function getAnimation(preset: AnimationPreset, delayMs = 0) {
    const anim = Animations[preset === 'fade' ? 'fadeIn' : preset === 'fadeDown' ? 'fadeInDown' : preset === 'fadeUp' ? 'fadeInUp' : 'zoomIn'];
    if (delayMs > 0) {
        return anim.delay(delayMs).duration(400).springify();
    }
    return anim.duration(400).springify();
}
