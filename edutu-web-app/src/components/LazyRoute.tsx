import { lazy, Suspense, ComponentType } from 'react';
import ErrorBoundary from './ErrorBoundary';
import LoadingFallback from './ui/LoadingFallback';

interface LazyRouteProps {
  // Route loaders need to support components with heterogeneous props.
  loader: () => Promise<{ default: ComponentType<any> }>;
  componentProps?: Record<string, unknown>;
}

export function LazyRoute({ loader, componentProps }: LazyRouteProps) {
  const Component = lazy(loader);
  const props = componentProps ?? {};
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingFallback message="Loading..." />}>
        <Component {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
