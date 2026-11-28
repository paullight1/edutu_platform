import { useCallback, useMemo, type ReactElement } from 'react';
import { ActivityIndicator, Platform, RefreshControl, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

const REFRESH_DISTANCE = 88;

export function isPlanRefreshPull(x: number, y: number) {
  'worklet';
  return y >= REFRESH_DISTANCE && y >= Math.abs(x) * 1.6;
}

type ScrollProps = Pick<ScrollViewProps, 'refreshControl' | 'onScroll' | 'scrollEventThrottle' |
  'overScrollMode' | 'alwaysBounceVertical' | 'accessibilityActions' | 'onAccessibilityAction'>;

type Props = {
  workspace: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  color: string;
  children: (props: ScrollProps) => ReactElement;
};

/** Keep the regular native refresh interaction on standalone screens. */
export function PlanRefresh({ workspace, ...props }: Props) {
  if (workspace && Platform.OS !== 'web') return <WorkspaceRefresh {...props} />;
  return props.children({
    refreshControl: <RefreshControl refreshing={props.refreshing} onRefresh={props.onRefresh} tintColor={props.color} />,
  });
}

function WorkspaceRefresh({ refreshing, onRefresh, color, children }: Omit<Props, 'workspace'>) {
  const { colors } = useTheme();
  const { t } = useTranslation('opps');
  const scrollY = useSharedValue(0);
  const pullDistance = useSharedValue(0);
  const refresh = useCallback(() => {
    if (!refreshing) onRefresh();
  }, [onRefresh, refreshing]);

  const gesture = useMemo(() => Gesture.Simultaneous(
    Gesture.Native(),
    Gesture.Pan()
      .maxPointers(1)
      .activeOffsetY(22)
      .failOffsetY([-12, 10_000])
      .failOffsetX([-16, 16])
      .onTouchesDown((_event, manager) => {
        if (refreshing || scrollY.value > 1) manager.fail();
      })
      .onUpdate(({ translationY }) => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated updates the indicator on the UI thread.
        pullDistance.value = translationY;
      })
      .onEnd(({ translationX, translationY }, completed) => {
        if (completed && isPlanRefreshPull(translationX, translationY)) scheduleOnRN(refresh);
      })
      .onFinalize(() => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated resets the indicator on the UI thread.
        pullDistance.value = 0;
      }),
  ), [pullDistance, refresh, refreshing, scrollY]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: refreshing ? 1 : Math.min(Math.max(pullDistance.value, 0) / REFRESH_DISTANCE, 1),
  }));

  return (
    <View style={styles.fill}>
      <GestureDetector gesture={gesture}>
        {children({
          onScroll: ({ nativeEvent }) => {
            // eslint-disable-next-line react-hooks/immutability -- Reanimated passes scroll position to the gesture worklet.
            scrollY.value = nativeEvent.contentOffset.y;
          },
          scrollEventThrottle: 16,
          alwaysBounceVertical: false,
          overScrollMode: 'never',
          accessibilityActions: [{ name: 'refresh', label: t('list.refresh') }],
          onAccessibilityAction: ({ nativeEvent }) => {
            if (nativeEvent.actionName === 'refresh') refresh();
          },
        })}
      </GestureDetector>
      <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[styles.indicator, { backgroundColor: colors.card, borderColor: colors.border }, indicatorStyle]}>
        <ActivityIndicator size="small" color={color} animating={refreshing} hidesWhenStopped={false} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  indicator: {
    position: 'absolute', top: 8, alignSelf: 'center', width: 34, height: 34,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
  },
});
