import React from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useOpportunities } from '../hooks/useOpportunities';
import type { Opportunity } from '../types/opportunity';

const OpportunityDetail = React.lazy(() => import('./OpportunityDetail'));

interface OpportunityDetailFetcherProps {
  onBack: () => void;
  onSelectOpportunity: (opportunity: Opportunity) => void;
  onAddToGoals: (opportunity: Opportunity) => void;
}

const OpportunityDetailFetcher: React.FC<OpportunityDetailFetcherProps> = ({
  onBack,
  onSelectOpportunity,
  onAddToGoals,
}) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
    return <Navigate to="/app/opportunities" replace />;
  }

  const handleNavigateToRoadmap = () => {
    navigate(`/app/opportunity/${id}/ai-roadmap`);
  };

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
        onAddToGoals={onAddToGoals}
        onNavigateToRoadmap={handleNavigateToRoadmap}
      />
    </React.Suspense>
  );
};

export default OpportunityDetailFetcher;
