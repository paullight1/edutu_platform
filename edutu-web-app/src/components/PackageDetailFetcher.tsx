import React from 'react';
import { useParams, Navigate } from 'react-router-dom';

const PackageDetail = React.lazy(() => import('./PackageDetail'));

interface PackageDetailFetcherProps {
  onBack: () => void;
  onNavigate?: (screen: string) => void;
}

const PackageDetailFetcher: React.FC<PackageDetailFetcherProps> = ({ onBack, onNavigate }) => {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <Navigate to="/app/community" replace />;
  }

  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin h-8 w-8 border-4 border-brand-500 border-t-transparent rounded-full" />
        </div>
      }
    >
      <PackageDetail
        packageId={id}
        onBack={onBack}
        onNavigate={onNavigate}
      />
    </React.Suspense>
  );
};

export default PackageDetailFetcher;
