import React from 'react';
import { View, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { ErrorBoundary } from './ErrorBoundary';
import { EmptyState, EmptyStateVariant } from './EmptyState';
import {
  DashboardSkeleton,
  OpportunityCardSkeleton,
  GoalCardSkeleton,
  ListItemSkeleton,
  Skeleton,
} from './Skeleton';

type SkeletonType = 'dashboard' | 'opportunity-list' | 'goal-list' | 'list-item' | 'generic';

interface ScreenWrapperProps {
  isLoading: boolean;
  error?: Error | string | null;
  isEmpty: boolean;
  onRetry?: () => void;
  onRefresh?: () => Promise<void>;
  refreshing?: boolean;
  skeletonType?: SkeletonType;
  emptyStateVariant?: EmptyStateVariant;
  emptyStateTitle?: string;
  emptyStateMessage?: string;
  emptyStateActionLabel?: string;
  emptyStateAction?: () => void;
  scrollable?: boolean;
  children: React.ReactNode;
}

function getSkeleton(type: SkeletonType): React.ReactNode {
  switch (type) {
    case 'dashboard':
      return <DashboardSkeleton />;
    case 'opportunity-list':
      return (
        <View style={styles.listWrap}>
          {Array.from({ length: 5 }).map((_, i) => (
            <OpportunityCardSkeleton key={i} />
          ))}
        </View>
      );
    case 'goal-list':
      return (
        <View style={styles.listWrap}>
          {Array.from({ length: 4 }).map((_, i) => (
            <GoalCardSkeleton key={i} />
          ))}
        </View>
      );
    case 'list-item':
      return (
        <View style={styles.listWrap}>
          {Array.from({ length: 6 }).map((_, i) => (
            <ListItemSkeleton key={i} />
          ))}
        </View>
      );
    case 'generic':
    default:
      return (
        <View style={styles.genericWrap}>
          <Skeleton width="80%" height={20} />
          <Skeleton width="60%" height={14} style={{ marginTop: 12 }} />
          <Skeleton variant="card" height={120} style={{ marginTop: 20 }} />
          <Skeleton variant="card" height={120} style={{ marginTop: 10 }} />
          <Skeleton variant="card" height={120} style={{ marginTop: 10 }} />
        </View>
      );
  }
}

export function ScreenWrapper({
  isLoading,
  error,
  isEmpty,
  onRetry,
  onRefresh,
  refreshing = false,
  skeletonType = 'generic',
  emptyStateVariant = 'generic',
  emptyStateTitle,
  emptyStateMessage,
  emptyStateActionLabel,
  emptyStateAction,
  scrollable = true,
  children,
}: ScreenWrapperProps) {
  const errorMessage = typeof error === 'string' ? error : error?.message;

  if (error) {
    return (
      <EmptyState
        variant="error"
        title={errorMessage || 'Something went wrong'}
        onAction={onRetry}
        actionLabel="Retry"
      />
    );
  }

  if (isLoading) {
    return <>{getSkeleton(skeletonType)}</>;
  }

  if (isEmpty) {
    return (
      <EmptyState
        variant={emptyStateVariant}
        title={emptyStateTitle}
        description={emptyStateMessage}
        actionLabel={emptyStateActionLabel}
        onAction={emptyStateAction}
      />
    );
  }

  const content = <>{children}</>;

  if (scrollable && onRefresh) {
    return (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />
        }
      >
        {content}
      </ScrollView>
    );
  }

  return <View style={styles.flex}>{content}</View>;
}

export function withScreenWrapper(
  defaultSkeleton: SkeletonType = 'generic',
  defaultEmptyVariant: EmptyStateVariant = 'generic',
) {
  return function WrappedScreen(props: ScreenWrapperProps) {
    return (
      <ErrorBoundary>
        <ScreenWrapper
          {...props}
          skeletonType={props.skeletonType || defaultSkeleton}
          emptyStateVariant={props.emptyStateVariant || defaultEmptyVariant}
        />
      </ErrorBoundary>
    );
  };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  listWrap: { padding: 16 },
  genericWrap: { padding: 16 },
});
