import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

type BrandedLoaderProps = {
  label?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function BrandedLoader({
  label = 'Loading…',
  size = 76,
  style,
}: BrandedLoaderProps) {
  const { colors } = useTheme();
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spinAnim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    spinAnim.start();
    pulseAnim.start();

    return () => {
      spinAnim.stop();
      pulseAnim.stop();
    };
  }, [spin, pulse]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const logoScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.05],
  });
  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.42],
  });

  const ring = size * 1.42;

  return (
    <View style={[styles.container, style]}>
      <View
        style={[styles.stage, { width: ring, height: ring }]}
        pointerEvents="none"
      >
        {/* Faint full-circle track */}
        <View
          style={[
            styles.track,
            {
              width: ring,
              height: ring,
              borderRadius: ring / 2,
              borderColor: colors.border,
            },
          ]}
        />

        {/* Spinning accent arc */}
        <Animated.View
          style={[
            styles.arc,
            {
              width: ring,
              height: ring,
              borderRadius: ring / 2,
              borderTopColor: colors.accent,
              borderRightColor: colors.accent,
              transform: [{ rotate }],
            },
          ]}
        />

        {/* Soft glowing halo behind the logo */}
        <Animated.View
          style={[
            styles.halo,
            {
              width: size * 0.92,
              height: size * 0.92,
              borderRadius: size,
              backgroundColor: colors.accent,
              opacity: haloOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        />

        {/* Logo with a gentle breathing pulse */}
        <Animated.Image
          source={require('../../assets/logo1.png')}
          resizeMode="contain"
          style={{
            width: size * 0.58,
            height: size * 0.58,
            transform: [{ scale: logoScale }],
          }}
        />
      </View>

      {label ? (
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    borderWidth: 3,
    opacity: 0.4,
  },
  arc: {
    position: 'absolute',
    borderWidth: 3,
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  halo: {
    position: 'absolute',
  },
  label: {
    marginTop: 22,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
