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
  label = 'Loading...',
  size = 72,
  style,
}: BrandedLoaderProps) {
  const { colors } = useTheme();
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    spin.start();

    return () => {
      spin.stop();
    };
  }, [rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.logoFrame,
          {
            width: size,
            height: size,
          },
        ]}
      >
        <Image
          source={require('../../assets/logo1.png')}
          resizeMode="contain"
          style={{ width: size * 0.66, height: size * 0.66 }}
        />
      </View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.orbit,
          {
            width: size * 1.16,
            height: size * 1.16,
            borderRadius: size * 0.58,
            borderColor: colors.accent,
            borderRightColor: 'transparent',
            borderBottomColor: 'transparent',
            transform: [{ rotate }],
          },
        ]}
      />

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
    minHeight: 150,
  },
  logoFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  orbit: {
    position: 'absolute',
    borderWidth: 2,
  },
  label: {
    marginTop: 18,
    fontSize: 13,
    fontWeight: '600',
  },
});
