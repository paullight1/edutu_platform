import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchOpportunities } from '../services/opportunities';
import { 
  formatUserProfileForRecommendations, 
  getPersonalizedOpportunities,
  type UserProfileForRecommendations 
} from '../services/personalizedRecommendations';
import type { AppUser } from '../types/user';
import type { Opportunity } from '../types/opportunity';

interface UsePersonalizedOpportunitiesState {
  data: { opportunity: Opportunity, matchScore: number }[];
  loading: boolean;
  error: string | null;
  userPreferences: UserProfileForRecommendations | null;
}

export interface UsePersonalizedOpportunitiesResult extends UsePersonalizedOpportunitiesState {
  refresh: () => void;
  updateUserPreferences: (preferences: Partial<UserProfileForRecommendations>) => void;
  setUserProfile: (user: AppUser, additionalData?: Partial<UserProfileForRecommendations>, onboardingData?: Partial<UserProfileForRecommendations>) => void;
}

export function usePersonalizedOpportunities(): UsePersonalizedOpportunitiesResult {
  const [{ data, loading, error, userPreferences }, setState] = useState<UsePersonalizedOpportunitiesState>({
    data: [],
    loading: true,
    error: null,
    userPreferences: null
  });
  
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    let isActive = true;

    if (!userPreferences) {
      // If no user preferences, we can't personalize opportunities
      setState(prev => ({
        ...prev,
        loading: false,
        data: []
      }));
      return;
    }

    setState(prev => ({
      ...prev,
      loading: true,
      error: refreshIndex === 0 ? null : prev.error
    }));

    fetchOpportunities({ userId: userPreferences.id, force: refreshIndex > 0 })
      .then(opportunities => {
        if (!isActive) {
          return;
        }

        // Apply personalized filtering
        const personalizedOpportunities = getPersonalizedOpportunities(userPreferences, opportunities);

        setState({
          data: personalizedOpportunities,
          loading: false,
          error: null,
          userPreferences
        });
      })
      .catch(err => {
        if (!isActive) {
          return;
        }

        const message = err instanceof Error ? err.message : 'Unable to load opportunities';

        setState(prev => ({
          ...prev,
          loading: false,
          error: message,
          userPreferences: prev.userPreferences,
          data: []
        }));
      });

    return () => {
      isActive = false;
    };
  }, [refreshIndex, userPreferences]);

  const setUserProfile = useCallback((user: AppUser, additionalData?: Partial<UserProfileForRecommendations>, onboardingData?: Partial<UserProfileForRecommendations>) => {
    const profile = formatUserProfileForRecommendations(user, additionalData, onboardingData);
    setState(prev => ({
      ...prev,
      userPreferences: profile,
      data: [], // Reset data until opportunities are loaded with new preferences
      loading: true
    }));
  }, []);

  const updateUserPreferences = useCallback((preferences: Partial<UserProfileForRecommendations>) => {
    setState(prev => {
      if (!prev.userPreferences) {
        return prev;
      }

      const updatedPreferences = {
        ...prev.userPreferences,
        ...preferences
      };

      return {
        ...prev,
        userPreferences: updatedPreferences,
        data: [] // Reset data until opportunities are reloaded with updated preferences
      };
    });
  }, []);

  const refresh = useCallback(() => {
    setRefreshIndex(value => value + 1);
  }, []);

  return useMemo(
    () => ({
      data,
      loading,
      error,
      userPreferences,
      refresh,
      updateUserPreferences,
      setUserProfile
    }),
    [data, error, loading, userPreferences, refresh, updateUserPreferences, setUserProfile]
  );
}