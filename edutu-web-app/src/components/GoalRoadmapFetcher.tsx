import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useGoals } from '../hooks/useGoals';

const PersonalizedRoadmap = React.lazy(() => import('./PersonalizedRoadmap'));

interface GoalRoadmapFetcherProps {
  onBack: () => void;
}

const GoalRoadmapFetcher: React.FC<GoalRoadmapFetcherProps> = ({ onBack }) => {
  const { id } = useParams<{ id: string }>();
  const { goals, isLoading } = useGoals();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const goal = goals.find((g) => g.id === id);

  if (!goal) {
    return <Navigate to="/app/goals" replace />;
  }

  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin h-8 w-8 border-4 border-brand-500 border-t-transparent rounded-full" />
        </div>
      }
    >
      <PersonalizedRoadmap
        onBack={onBack}
        goalId={goal.id}
      />
    </React.Suspense>
  );
};

export default GoalRoadmapFetcher;
