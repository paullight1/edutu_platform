import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useOpportunities } from '../hooks/useOpportunities';

const OpportunityDetail = React.lazy(() => import('./OpportunityDetail'));

interface OpportunityDetailFetcherProps {
  onBack: () => void;
}

const OpportunityDetailFetcher: React.FC<OpportunityDetailFetcherProps> = ({
  onBack,
}) => {
  const { id } = useParams<{ id: string }>();
  const { data: opportunities, loading } = useOpportunities();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const opportunity = opportunities.find((o) => o.id === id);

  if (!opportunity) {
    return <Navigate to="/opportunities" replace />;
  }

  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin h-8 w-8 border-4 border-brand-500 border-t-transparent rounded-full" />
        </div>
      }
    >
      <OpportunityDetail
        opportunity={opportunity}
        onBack={onBack}
      />
    </React.Suspense>
  );
};

export default OpportunityDetailFetcher;
