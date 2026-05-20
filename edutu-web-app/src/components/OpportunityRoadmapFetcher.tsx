import React from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useOpportunities } from '../hooks/useOpportunities';
import type { Opportunity } from '../types/opportunity';
import type { GeneratedRoadmap } from '../services/aiRoadmapGenerator';

const OpportunityRoadmap = React.lazy(() => import('./OpportunityRoadmap'));
const AIRoadmapWizard = React.lazy(() => import('./AIRoadmapWizard'));

interface OpportunityRoadmapFetcherProps {
  onBack: () => void;
  mode?: 'standard' | 'ai';
}

const Loading = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
  </div>
);

const OpportunityRoadmapFetcher: React.FC<OpportunityRoadmapFetcherProps> = ({ onBack, mode = 'standard' }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: opportunities, loading } = useOpportunities();

  if (loading) {
    return <Loading />;
  }

  const opportunity = opportunities.find((item: Opportunity) => item.id === id);

  if (!opportunity) {
    return <Navigate to="/app/opportunities" replace />;
  }

  const handleComplete = (goalId: string, _roadmap: GeneratedRoadmap) => {
    navigate(`/app/goal/${goalId}/roadmap`);
  };

  return (
    <React.Suspense fallback={<Loading />}>
      {mode === 'ai' ? (
        <AIRoadmapWizard
          opportunity={opportunity}
          onBack={onBack}
          onComplete={handleComplete}
        />
      ) : (
        <OpportunityRoadmap
          opportunity={opportunity}
          onBack={onBack}
        />
      )}
    </React.Suspense>
  );
};

export default OpportunityRoadmapFetcher;
