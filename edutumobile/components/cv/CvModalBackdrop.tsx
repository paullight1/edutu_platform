import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';

/**
 * Shared backdrop for every CV-flow modal: a full-screen blur (theme-tinted)
 * plus a dim layer, fading in briefly. Pass `onPress` to let a tap outside the
 * sheet dismiss non-destructive modals; omit it to make the backdrop inert.
 */
export function CvModalBackdrop({ onPress }: { onPress?: () => void }) {
    const { isDark } = useTheme();
    return (
        <Animated.View entering={FadeIn.duration(180)} style={StyleSheet.absoluteFill}>
            <BlurView
                intensity={isDark ? 50 : 45}
                tint={isDark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
            />
            <Pressable
                style={[StyleSheet.absoluteFill, styles.dim]}
                onPress={onPress}
                disabled={!onPress}
                accessible={false}
            />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    dim: {
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
});
