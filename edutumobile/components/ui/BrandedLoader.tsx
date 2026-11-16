import React, { useEffect } from 'react';
import {
  Animated, useAnimatedValue,
  Easing,
  Image,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

type BrandedLoaderProps = {
  label?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function BrandedLoader({
  label,
  size = 76,
  style,
}: BrandedLoaderProps) {
  const { t } = useTranslation('common');
  const displayLabel = label ?? t('brandedLoader.loading');
  const { colors } = useTheme();
  const spin = useAnimatedValue(0);
  const pulse = useAnimatedValue(0);

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
    outputRange: [0.94, 1.04],
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

        {/* Logo on a clean light disc so the colored mark stays legible in
            every theme — the accent lives in the spinning arc, not a blob. */}
        <Animated.View
          style={[
            styles.logoDisc,
            {
              width: size * 0.74,
              height: size * 0.74,
              borderRadius: size,
              borderColor: colors.border,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image
            source={require('../../assets/logo1.png')}
            resizeMode="contain"
            style={{ width: size * 0.52, height: size * 0.52 }}
          />
        </Animated.View>
      </View>

      {displayLabel ? (
        <Text style={[styles.label, { color: colors.textSecondary }]}>{displayLabel}</Text>
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
  logoDisc: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  label: {
    marginTop: 22,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
