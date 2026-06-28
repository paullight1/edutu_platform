import React, { forwardRef } from 'react';
import { ViewStyle, StyleProp, View, PressableProps, Pressable as RNPressable } from 'react-native';
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
import * as Haptics from 'expo-haptics';

interface AnimatedPressableProps extends Omit<PressableProps, 'style'> {
    style?: StyleProp<ViewStyle>;
    hapticFeedback?: 'none' | 'light' | 'medium' | 'heavy' | 'selection';
    scaleTo?: number;
    disabled?: boolean;
    children: React.ReactNode;
    entering?: BaseAnimationBuilder | EntryExitAnimationFunction;
}

export const AnimatedPressable = forwardRef<View, AnimatedPressableProps>(
    ({ style, hapticFeedback = 'light', scaleTo = 0.96, disabled, onPress, children, entering, ...rest }, ref) => {
        const scale = useSharedValue(1);

        const animatedStyle = useAnimatedStyle(() => ({
            transform: [{ scale: scale.value }],
        }));

        const triggerHaptic = () => {
            if (hapticFeedback === 'none') return;
            switch (hapticFeedback) {
                case 'light': Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); break;
                case 'medium': Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); break;
                case 'heavy': Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); break;
                case 'selection': Haptics.selectionAsync(); break;
            }
        };

        if (entering) {
            return (
                <Animated.View
                    ref={ref}
                    style={style}
                    entering={entering}
                >
                    <Animated.View style={[animatedStyle, { flex: 1 }]}>
                        <RNPressable
                            style={{ flex: 1 }}
                            disabled={disabled}
                            onPressIn={() => { scale.value = withSpring(scaleTo, { damping: 12, stiffness: 400 }); }}
                            onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 400 }); }}
                            onPress={(e) => {
                                triggerHaptic();
                                onPress?.(e);
                            }}
                            {...rest}
                        >
                            {children}
                        </RNPressable>
                    </Animated.View>
                </Animated.View>
            );
        }

        return (
            <Animated.View
                ref={ref}
                style={[animatedStyle, style]}
            >
                <RNPressable
                    style={{ flex: 1 }}
                    disabled={disabled}
                    onPressIn={() => { scale.value = withSpring(scaleTo, { damping: 12, stiffness: 400 }); }}
                    onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 400 }); }}
                    onPress={(e) => {
                        triggerHaptic();
                        onPress?.(e);
                    }}
                    {...rest}
                >
                    {children}
                </RNPressable>
            </Animated.View>
        );
    }
);

// ─────────────────────────────────────────────────────────────
// Animated TouchableOpacity (legacy API, same spring feedback)
// ─────────────────────────────────────────────────────────────

import { TouchableOpacityProps } from 'react-native';

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
    ...rest
}) => {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const triggerHaptic = () => {
        if (hapticFeedback === 'none') return;
        switch (hapticFeedback) {
            case 'light': Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); break;
            case 'medium': Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); break;
            case 'heavy': Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); break;
            case 'selection': Haptics.selectionAsync(); break;
        }
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
                    scale.value = withSpring(scaleTo, { damping: 12, stiffness: 400 });
                    onPressIn?.(e);
                }}
                onPressOut={(e) => {
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
