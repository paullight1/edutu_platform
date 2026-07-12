import React, { useCallback, useEffect, useRef } from 'react';
import { Dimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  markImpression,
  registerImpressionCheck,
  runImpressionChecks,
} from '../../lib/impressions';

/**
 * Wraps a card and fires one impression signal the first time its midpoint is
 * actually inside the window (both axes — works inside vertical ScrollViews
 * and horizontal rails alike). Screens pump visibility via
 * runImpressionChecks() from their scroll handlers; this component also
 * self-checks shortly after mount to catch above-the-fold content.
 */
export function ImpressionView({
  opportunityId,
  surface,
  position,
  getAuthToken,
  style,
  children,
}: {
  opportunityId: string;
  surface: string;
  position: number;
  getAuthToken?: () => Promise<string | null | undefined>;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const ref = useRef<View>(null);
  const firedRef = useRef(false);

  const check = useCallback(() => {
    if (firedRef.current || !ref.current) return;
    ref.current.measureInWindow((x, y, w, h) => {
      if (firedRef.current || !Number.isFinite(y) || h <= 0 || w <= 0) return;
      const { width: windowW, height: windowH } = Dimensions.get('window');
      const midX = x + w / 2;
      const midY = y + h / 2;
      const visible = midY >= 0 && midY <= windowH && midX >= 0 && midX <= windowW;
      if (visible) {
        firedRef.current = true;
        markImpression(opportunityId, surface, position, getAuthToken);
      }
    });
  }, [opportunityId, surface, position, getAuthToken]);

  useEffect(() => {
    const unregister = registerImpressionCheck(check);
    // Above-the-fold cards never scroll — check once after layout settles.
    const timer = setTimeout(() => runImpressionChecks(true), 700);
    return () => {
      unregister();
      clearTimeout(timer);
    };
  }, [check]);

  return (
    <View ref={ref} style={style} collapsable={false}>
      {children}
    </View>
  );
}
