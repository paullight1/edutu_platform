import React, { forwardRef, useState } from 'react';
import {
    ViewStyle,
    StyleProp,
    View,
    StyleSheet,
    PressableProps,
    Pressable as RNPressable,
    TouchableOpacityProps,
} from 'react-native';
import Animated, {
    BaseAnimationBuilder,
    EntryExitAnimationFunction,
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    ReduceMotion,
    FadeIn,
    FadeInDown,
    FadeInUp,
    ZoomIn,
    Layout,
} from 'react-native-reanimated';
import { controlMotion } from '../../lib/visualTokens';
import { haptics } from '../../lib/haptics';

// ─────────────────────────────────────────────────────────────
// Animated press controls
// ─────────────────────────────────────────────────────────────


interface AnimatedPressableProps extends Omit<PressableProps, 'style'> {
    style?: StyleProp<ViewStyle>;
    hapticFeedback?: 'none' | 'light' | 'medium' | 'heavy' | 'selection';
    scaleTo?: number;
    focusColor?: string;
    disabled?: boolean;
    children: React.ReactNode;
    entering?: BaseAnimationBuilder | EntryExitAnimationFunction;
}

const ReanimatedPressable = Animated.createAnimatedComponent(RNPressable);

export const AnimatedPressable = forwardRef<View, AnimatedPressableProps>(
    function AnimatedPressable({
        style,
        hapticFeedback = 'light',
        scaleTo,
        focusColor,
        disabled,
        onFocus,
        onBlur,
        onHoverIn,
        onHoverOut,
        onPress,
        onPressIn,
        onPressOut,
        children,
        entering,
        ...rest
    }, ref) {
        const scale = useSharedValue(1);
        const hover = useSharedValue(0);
        const [focused, setFocused] = useState(false);

        const animatedStyle = useAnimatedStyle(() => ({
            transform: [{ scale: scale.value }],
        }));
        const hoverStyle = useAnimatedStyle(() => ({
            opacity: hover.value * 0.12,
            transform: [{ translateX: (1 - hover.value) * -4 }],
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
                onFocus={(event) => { setFocused(true); onFocus?.(event); }}
                onBlur={(event) => { setFocused(false); onBlur?.(event); }}
                onHoverIn={(event) => {
                    if (focusColor) hover.value = withTiming(1, { duration: controlMotion.press, reduceMotion: ReduceMotion?.System });
                    onHoverIn?.(event);
                }}
                onHoverOut={(event) => {
                    if (focusColor) hover.value = withTiming(0, { duration: controlMotion.press, reduceMotion: ReduceMotion?.System });
                    onHoverOut?.(event);
                }}
                onPressIn={(event) => {
                    // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write; the library's documented imperative API
                    scale.value = withTiming(scaleTo === 1 ? 1 : controlMotion.pressScale, { duration: controlMotion.press, reduceMotion: ReduceMotion?.System });
                    onPressIn?.(event);
                }}
                onPressOut={(event) => {
                    // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write; the library's documented imperative API
                    scale.value = withTiming(1, { duration: controlMotion.press, reduceMotion: ReduceMotion?.System });
                    onPressOut?.(event);
                }}
                onPress={(event) => {
                    triggerHaptic();
                    onPress?.(event);
                }}
            >
                {focusColor && !focused && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: focusColor }, hoverStyle]} />}
                {children}
                {focusColor && focused && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 2, borderColor: focusColor }]} />}
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
    scaleTo,
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
                    scale.value = withTiming(scaleTo === 1 ? 1 : controlMotion.pressScale, { duration: controlMotion.press, reduceMotion: ReduceMotion?.System });
                    onPressIn?.(e);
                }}
                onPressOut={(e) => {
                    // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write; the library's documented imperative API
                    scale.value = withTiming(1, { duration: controlMotion.press, reduceMotion: ReduceMotion?.System });
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
        return anim.delay(Math.min(delayMs, 99)).duration(controlMotion.menuEnter);
    }
    return anim.duration(controlMotion.menuEnter);
}
