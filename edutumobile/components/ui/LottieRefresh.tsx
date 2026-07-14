import React, { useEffect, useRef, useState } from 'react';
import { RefreshControl, RefreshControlProps, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const REFRESH_LOTTIE = require('../../assets/lottie/pull-refresh.json');

// Keep the native pull gesture + rubber-band bounce, but hide the stock spinner
// on both platforms so our branded Lottie is the only visible indicator.
const HIDDEN_NATIVE: Partial<RefreshControlProps> = {
  tintColor: 'transparent',
  colors: ['transparent'],
  progressBackgroundColor: 'transparent',
};

type LottieRefreshOptions = {
  refreshing: boolean;
  onRefresh: () => void;
  /** Distance from the top of the scroll area where the indicator settles. */
  top?: number;
};

/**
 * A drop-in, reusable Lottie pull-to-refresh.
 *
 * Returns two things:
 *  - `refreshControl`: spread onto any ScrollView / FlatList `refreshControl` prop.
 *    It uses the platform RefreshControl (so the pull + native bounce still work),
 *    but its stock spinner is transparent.
 *  - `overlay`: render as a sibling of the scroll container (inside a relatively/
 *    absolutely-positioned parent). It springs in with a bounce and loops the
 *    branded Lottie while refreshing, then springs back out.
 *
 * Usage:
 *   const { refreshControl, overlay } = useLottieRefresh({ refreshing, onRefresh });
 *   return (
 *     <View style={{ flex: 1 }}>
 *       {overlay}
 *       <ScrollView refreshControl={refreshControl}>…</ScrollView>
 *     </View>
 *   );
 */
export function useLottieRefresh({ refreshing, onRefresh, top = 6 }: LottieRefreshOptions) {
  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} {...HIDDEN_NATIVE} />
  );
  const overlay = <LottieRefreshOverlay refreshing={refreshing} top={top} />;
  return { refreshControl, overlay };
}

function LottieRefreshOverlay({ refreshing, top = 6 }: { refreshing: boolean; top?: number }) {
  // `progress` drives the reveal (0 = hidden above, 1 = settled). Spring on the way
  // in gives the bounce; a quick fade handles the way out.
  const progress = useSharedValue(0);
  // Keep the Lottie mounted through the exit animation so it doesn't pop.
  const [mounted, setMounted] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (exitTimer.current) {
      clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
    if (refreshing) {
      setMounted(true);
      progress.value = withSpring(1, { damping: 8, stiffness: 150, mass: 0.7 });
    } else {
      progress.value = withTiming(0, { duration: 240 });
      exitTimer.current = setTimeout(() => setMounted(false), 260);
    }
    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, [refreshing, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [-34, top]) },
      { scale: interpolate(progress.value, [0, 1], [0.55, 1]) },
    ],
  }));

  if (!mounted) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.overlay, style]}>
      <LottieView source={REFRESH_LOTTIE} autoPlay loop style={styles.lottie} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
    elevation: 20,
  },
  lottie: { width: 64, height: 64 },
});
