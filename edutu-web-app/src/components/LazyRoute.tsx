import { lazy, Suspense, ComponentType } from 'react';
import ErrorBoundary from './ErrorBoundary';
import LoadingFallback from './ui/LoadingFallback';

interface LazyRouteProps {
  loader: () => Promise<{ default: ComponentType<any> }>;
}

export function LazyRoute({ loader }: LazyRouteProps) {
  const Component = lazy(loader);
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingFallback message="Loading..." />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}
