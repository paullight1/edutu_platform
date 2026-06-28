import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, DimensionValue } from 'react-native';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  variant?: 'text' | 'card' | 'circle' | 'rect';
  style?: View['props']['style'];
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 8,
  variant = 'rect',
  style,
}: SkeletonProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  const resolved: { width: DimensionValue; height: number; borderRadius: number } = {
    width,
    height,
    borderRadius,
  };

  if (variant === 'text') {
    resolved.height = 14;
    resolved.borderRadius = 7;
  } else if (variant === 'circle') {
    resolved.width = height;
    resolved.borderRadius = height / 2;
  } else if (variant === 'card') {
    resolved.height = 180;
    resolved.borderRadius = 16;
  }

  return (
    <Animated.View
      style={[
        {
          width: resolved.width,
          height: resolved.height,
          borderRadius: resolved.borderRadius,
          backgroundColor: '#E2E8F0',
          opacity,
        },
        style,
      ]}
    />
  );
}

// ── Pre-built skeleton compositions ─────────────────────────────────────

export function OpportunityCardSkeleton() {
  return (
    <View style={skeletonStyles.card}>
      <Skeleton variant="rect" height={140} borderRadius={12} />
      <View style={skeletonStyles.cardBody}>
        <Skeleton width="60%" height={18} />
        <Skeleton width="80%" height={14} style={{ marginTop: 8 }} />
        <View style={skeletonStyles.row}>
          <Skeleton width={80} height={12} />
          <Skeleton width={60} height={12} />
        </View>
      </View>
    </View>
  );
}

export function GoalCardSkeleton() {
  return (
    <View style={skeletonStyles.card}>
      <View style={skeletonStyles.row}>
        <Skeleton variant="circle" height={40} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Skeleton width="70%" height={16} />
          <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
        </View>
      </View>
      <Skeleton height={6} style={{ marginTop: 12 }} borderRadius={3} />
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View style={{ alignItems: 'center', padding: 24 }}>
      <Skeleton variant="circle" height={80} />
      <Skeleton width="50%" height={20} style={{ marginTop: 16 }} />
      <Skeleton width="30%" height={14} style={{ marginTop: 8 }} />
      <View style={[skeletonStyles.row, { marginTop: 20, gap: 12 }]}>
        <Skeleton width={80} height={60} borderRadius={12} />
        <Skeleton width={80} height={60} borderRadius={12} />
        <Skeleton width={80} height={60} borderRadius={12} />
        <Skeleton width={80} height={60} borderRadius={12} />
      </View>
    </View>
  );
}

export function DashboardSkeleton() {
  return (
    <View style={{ padding: 16 }}>
      <View style={[skeletonStyles.row, { gap: 8 }]}>
        <Skeleton variant="card" width="48%" height={120} />
        <Skeleton variant="card" width="48%" height={120} />
      </View>
      <View style={[skeletonStyles.row, { gap: 8, marginTop: 8 }]}>
        <Skeleton variant="card" width="48%" height={120} />
        <Skeleton variant="card" width="48%" height={120} />
      </View>
      <Skeleton width="40%" height={18} style={{ marginTop: 20 }} />
      <Skeleton variant="card" height={100} style={{ marginTop: 12 }} />
      <Skeleton variant="card" height={100} style={{ marginTop: 8 }} />
    </View>
  );
}

export function ListItemSkeleton() {
  return (
    <View style={[skeletonStyles.row, { padding: 12 }]}>
      <Skeleton variant="rect" width={56} height={56} borderRadius={12} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="50%" height={12} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={60} height={12} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.02)',
    marginBottom: 10,
  },
  cardBody: {
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
});
