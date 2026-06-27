import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import {
  fetchOpportunities,
  fetchOpportunityRecommendations,
  type PersonalizedOpportunity,
} from "../services/opportunities";
import { getProductApiToken } from "../lib/clerkToken";
import {
  formatUserProfileForRecommendations,
  getPersonalizedOpportunities,
  type UserProfileForRecommendations,
} from "../services/personalizedRecommendations";
import type { AppUser } from "../types/user";

interface UsePersonalizedOpportunitiesState {
  data: PersonalizedOpportunity[];
  loading: boolean;
  error: string | null;
  userPreferences: UserProfileForRecommendations | null;
}

export interface UsePersonalizedOpportunitiesResult extends UsePersonalizedOpportunitiesState {
  refresh: () => void;
  updateUserPreferences: (
    preferences: Partial<UserProfileForRecommendations>,
  ) => void;
  setUserProfile: (
    user: AppUser,
    additionalData?: Partial<UserProfileForRecommendations>,
    onboardingData?: Partial<UserProfileForRecommendations>,
  ) => void;
}

export function usePersonalizedOpportunities(): UsePersonalizedOpportunitiesResult {
  const [{ data, loading, error, userPreferences }, setState] =
    useState<UsePersonalizedOpportunitiesState>({
      data: [],
      loading: true,
      error: null,
      userPreferences: null,
    });

  const [refreshIndex, setRefreshIndex] = useState(0);
  const { getToken, isSignedIn } = useClerkAuth();

  useEffect(() => {
    let isActive = true;

    if (!userPreferences) {
      // If no user preferences, we can't personalize opportunities
      setState((prev) => ({
        ...prev,
        loading: false,
        data: [],
      }));
      return;
    }
    const activePreferences = userPreferences;

    setState((prev) => ({
      ...prev,
      loading: true,
      error: refreshIndex === 0 ? null : prev.error,
    }));

    async function loadPersonalizedOpportunities() {
      let backendError: unknown = null;

      if (isSignedIn) {
        const token = await getProductApiToken(getToken, {
          forceRefresh: true,
        });

        if (token) {
          try {
            const recommendations = await fetchOpportunityRecommendations(
              token,
              {
                limit: 48,
                minMatchScore: 0,
              },
            );

            if (!isActive) {
              return;
            }

            if (recommendations.length > 0) {
              setState({
                data: recommendations,
                loading: false,
                error: null,
                userPreferences: activePreferences,
              });
              return;
            }
          } catch (err) {
            backendError = err;
            console.warn(
              "AI opportunity recommendations unavailable, using local personalization fallback:",
              err,
            );
          }
        }
      }

      try {
        const opportunities = await fetchOpportunities({
          userId: activePreferences.id,
          force: refreshIndex > 0,
        });

        if (!isActive) {
          return;
        }

        const personalizedOpportunities = getPersonalizedOpportunities(
          activePreferences,
          opportunities,
        ).map((item) => ({
          ...item,
          matchReasons: [],
          matchRisks: [],
          aiSummary: null,
          aiTags: [],
        }));

        setState({
          data: personalizedOpportunities,
          loading: false,
          error: null,
          userPreferences: activePreferences,
        });
      } catch (err) {
        if (!isActive) {
          return;
        }

        const message =
          err instanceof Error
            ? err.message
            : backendError instanceof Error
              ? backendError.message
              : "Unable to load opportunities";

        setState((prev) => ({
          ...prev,
          loading: false,
          error: message,
          userPreferences: prev.userPreferences,
          data: [],
        }));
      }
    }

    void loadPersonalizedOpportunities();

    return () => {
      isActive = false;
    };
  }, [getToken, isSignedIn, refreshIndex, userPreferences]);

  const setUserProfile = useCallback(
    (
      user: AppUser,
      additionalData?: Partial<UserProfileForRecommendations>,
      onboardingData?: Partial<UserProfileForRecommendations>,
    ) => {
      const profile = formatUserProfileForRecommendations(
        user,
        additionalData,
        onboardingData,
      );
      setState((prev) => {
        const previousProfile = prev.userPreferences;
        if (
          previousProfile &&
          JSON.stringify(previousProfile) === JSON.stringify(profile)
        ) {
          return prev;
        }
        return {
          ...prev,
          userPreferences: profile,
          data: [],
          loading: true,
        };
      });
    },
    [],
  );

  const updateUserPreferences = useCallback(
    (preferences: Partial<UserProfileForRecommendations>) => {
      setState((prev) => {
        if (!prev.userPreferences) {
          return prev;
        }

        const updatedPreferences = {
          ...prev.userPreferences,
          ...preferences,
        };

        return {
          ...prev,
          userPreferences: updatedPreferences,
          data: [], // Reset data until opportunities are reloaded with updated preferences
        };
      });
    },
    [],
  );

  const refresh = useCallback(() => {
    setRefreshIndex((value) => value + 1);
  }, []);

  return useMemo(
    () => ({
      data,
      loading,
      error,
      userPreferences,
      refresh,
      updateUserPreferences,
      setUserProfile,
    }),
    [
      data,
      error,
      loading,
      userPreferences,
      refresh,
      updateUserPreferences,
      setUserProfile,
    ],
  );
}
