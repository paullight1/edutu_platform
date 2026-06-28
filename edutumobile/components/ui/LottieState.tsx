import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';
import { useTheme } from '../context/ThemeContext';

export type LottieStatePreset = 'emptySearch' | 'savedEmpty' | 'deadlineEmpty';

const LOTTIE_SOURCES: Record<LottieStatePreset, any> = {
  emptySearch: require('../../assets/lottie/empty-search.json'),
  savedEmpty: require('../../assets/lottie/saved-empty.json'),
  deadlineEmpty: require('../../assets/lottie/deadline-empty.json'),
};

type LottieStateProps = {
  preset: LottieStatePreset;
  title: string;
  description?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  size?: number;
  loop?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function LottieState({
  preset,
  title,
  description,
  actionLabel,
  onActionPress,
  size = 156,
  loop = true,
  style,
}: LottieStateProps) {
  const { colors } = useTheme();
  const showAction = Boolean(actionLabel && onActionPress);

  return (
    <View style={[styles.container, style]}>
      <LottieView
        source={LOTTIE_SOURCES[preset]}
        autoPlay
        loop={loop}
        style={{ width: size, height: size }}
      />
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
      ) : null}
      {showAction ? (
        <Pressable onPress={onActionPress} style={[styles.actionButton, { backgroundColor: colors.accent }]}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 34,
  },
  title: {
    marginTop: 6,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  description: {
    marginTop: 8,
    maxWidth: 300,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  actionButton: {
    marginTop: 20,
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
