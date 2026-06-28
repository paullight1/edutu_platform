import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ErrorBoundary } from './ErrorBoundary';
import { EmptyState, EmptyStateVariant } from './EmptyState';
import {
  Skeleton,
  DashboardSkeleton,
  OpportunityCardSkeleton,
  GoalCardSkeleton,
  ListItemSkeleton,
  ProfileSkeleton,
} from './Skeleton';

type SkeletonVariant =
  | 'dashboard'
  | 'opportunity-list'
  | 'goal-list'
  | 'list-item'
  | 'profile'
  | 'generic';

interface WithLoadingStatesProps {
  isLoading: boolean;
  error?: Error | string | null;
  isEmpty: boolean;
  onRetry?: () => void;
  skeletonVariant?: SkeletonVariant;
  emptyStateVariant?: EmptyStateVariant;
  emptyStateTitle?: string;
  emptyStateMessage?: string;
  emptyStateActionLabel?: string;
  emptyStateAction?: () => void;
  children: React.ReactNode;
}

function getSkeleton(variant: SkeletonVariant): React.ReactNode {
  switch (variant) {
    case 'dashboard':
      return <DashboardSkeleton />;
    case 'opportunity-list':
      return (
        <View style={styles.listContainer}>
          {Array.from({ length: 5 }).map((_, i) => (
            <OpportunityCardSkeleton key={i} />
          ))}
        </View>
      );
    case 'goal-list':
      return (
        <View style={styles.listContainer}>
          {Array.from({ length: 4 }).map((_, i) => (
            <GoalCardSkeleton key={i} />
          ))}
        </View>
      );
    case 'profile':
      return <ProfileSkeleton />;
    case 'list-item':
      return (
        <View style={styles.listContainer}>
          {Array.from({ length: 6 }).map((_, i) => (
            <ListItemSkeleton key={i} />
          ))}
        </View>
      );
    case 'generic':
    default:
      return (
        <View style={styles.genericContainer}>
          <Skeleton width="90%" height={20} />
          <Skeleton width="70%" height={14} style={{ marginTop: 12 }} />
          <Skeleton variant="card" height={120} style={{ marginTop: 16 }} />
          <Skeleton variant="card" height={120} style={{ marginTop: 8 }} />
          <Skeleton variant="card" height={120} style={{ marginTop: 8 }} />
        </View>
      );
  }
}

export function withLoadingStates<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  defaultSkeleton: SkeletonVariant = 'generic',
  defaultEmptyVariant: EmptyStateVariant = 'generic',
) {
  return function LoadingStatesWrapper(props: P & Partial<WithLoadingStatesProps>) {
    const {
      isLoading,
      error,
      isEmpty,
      onRetry,
      skeletonVariant = defaultSkeleton,
      emptyStateVariant = defaultEmptyVariant,
      emptyStateTitle,
      emptyStateMessage,
      emptyStateActionLabel,
      emptyStateAction,
      ...rest
    } = props as P & WithLoadingStatesProps;

    if (error) {
      return (
        <ErrorBoundary message={typeof error === 'string' ? error : error?.message}>
          <WrappedComponent {...(rest as unknown as P)} />
        </ErrorBoundary>
      );
    }

    if (isLoading) {
      return <>{getSkeleton(skeletonVariant)}</>;
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

    return <WrappedComponent {...(rest as unknown as P)} />;
  };
}

const styles = StyleSheet.create({
  listContainer: {
    padding: 16,
  },
  genericContainer: {
    padding: 16,
  },
});
