import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import {
  fetchOpportunities,
  fetchOpportunityRecommendations,
  type PersonalizedOpportunity,
} from "../services/opportunities";
import {
  getProductApiToken,
  isInvalidOrExpiredTokenError,
} from "../lib/clerkToken";
import {
  evaluateMatch,
  formatUserProfileForRecommendations,
  type UserProfileForRecommendations,
} from "../services/personalizedRecommendations";
import {
  primeServerMatches,
  toMatchReasons,
} from "../services/serverMatchStore";
import { anchorFeedOrder } from "../services/feedAnchor";
import type { AppUser } from "../types/user";

const RECO_CACHE_KEY = "edutu:recommendations:v1";
const RECO_FRESH_MS = 10 * 60 * 1000;

interface RecommendationCacheEntry {
  userKey: string;
  savedAt: number;
  data: PersonalizedOpportunity[];
}

let recommendationMemoryCache: RecommendationCacheEntry | null = null;

/**
 * Drop the cached recommendation run. Call this after onboarding or any
 * preference change so the next feed load refetches instead of serving the
 * stale (pre-personalization) cached run for up to RECO_FRESH_MS.
 */
export function clearRecommendationCache() {
  recommendationMemoryCache = null;
  try {
    window.sessionStorage.removeItem(RECO_CACHE_KEY);
  } catch {
    // Session storage unavailable — the in-memory copy is already cleared.
  }
}

/**
 * Push server-computed scores into the shared match store so badges and
 * "why this matches" panels across the app read the authoritative numbers.
 */
function primeServerMatchesFromRecommendations(
  userKey: string,
  recommendations: PersonalizedOpportunity[],
) {
  primeServerMatches(
    userKey,
    recommendations.map((item) => ({
      id: item.opportunity.id,
      score: item.matchScore,
      reasons: toMatchReasons(item),
      risks: item.matchRisks,
    })),
  );
}

// The recommendations endpoint is keyed by the authenticated user only (the
// request body carries no preferences), so a short-lived per-user cache makes
// dashboard revisits instant without changing what the user would see.
function readRecommendationCache(
  userKey: string,
): PersonalizedOpportunity[] | null {
  const now = Date.now();

  if (
    recommendationMemoryCache &&
    recommendationMemoryCache.userKey === userKey &&
    now - recommendationMemoryCache.savedAt < RECO_FRESH_MS
  ) {
    return recommendationMemoryCache.data;
  }

  try {
    const raw = window.sessionStorage.getItem(RECO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecommendationCacheEntry;
    if (
      parsed?.userKey === userKey &&
      typeof parsed.savedAt === "number" &&
      now - parsed.savedAt < RECO_FRESH_MS &&
      Array.isArray(parsed.data) &&
      parsed.data.length > 0
    ) {
      recommendationMemoryCache = parsed;
      return parsed.data;
    }
  } catch {
    // Session storage unavailable — memory cache already checked.
  }

  return null;
}

function writeRecommendationCache(
  userKey: string,
  data: PersonalizedOpportunity[],
) {
  const entry: RecommendationCacheEntry = {
    userKey,
    savedAt: Date.now(),
    data,
  };
  recommendationMemoryCache = entry;
  try {
    window.sessionStorage.setItem(RECO_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Best effort — the in-memory copy still serves this session.
  }
}

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

  // Latest rendered feed, readable inside the async fetch without adding
  // `data` to the effect deps (which would retrigger the load).
  const dataRef = useRef(data);
  dataRef.current = data;

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
    const cacheKey = activePreferences.id || "anonymous";

    // Serve a fresh cached run instantly — no token round-trip, no skeleton
    // flash when the dashboard remounts or the profile object is re-derived.
    if (refreshIndex === 0) {
      const cachedRecommendations = readRecommendationCache(cacheKey);
      if (cachedRecommendations) {
        primeServerMatchesFromRecommendations(cacheKey, cachedRecommendations);
        setState({
          data: cachedRecommendations,
          loading: false,
          error: null,
          userPreferences: activePreferences,
        });
        return;
      }
    }

    setState((prev) => ({
      ...prev,
      loading: prev.data.length === 0,
      error: refreshIndex === 0 ? null : prev.error,
    }));

    async function requestRecommendationsWithRetry() {
      // Use the cached Clerk token first; only force a refresh when the API
      // rejects it. Saves a Clerk round-trip on every feed load.
      const token = await getProductApiToken(getToken);
      if (!token) return null;

      try {
        return await fetchOpportunityRecommendations(token, {
          limit: 48,
          minMatchScore: 0,
        });
      } catch (err) {
        if (!isInvalidOrExpiredTokenError(err)) {
          throw err;
        }
        const freshToken = await getProductApiToken(getToken, {
          forceRefresh: true,
        });
        if (!freshToken) throw err;
        return fetchOpportunityRecommendations(freshToken, {
          limit: 48,
          minMatchScore: 0,
        });
      }
    }

    async function loadPersonalizedOpportunities() {
      let backendError: unknown = null;

      if (isSignedIn) {
        try {
          const recommendations = await requestRecommendationsWithRetry();

          if (!isActive) {
            return;
          }

          if (recommendations && recommendations.length > 0) {
            primeServerMatchesFromRecommendations(cacheKey, recommendations);

            // Background revalidate over an already-rendered feed: keep the
            // user's current card order stable (adopting fresh data) instead
            // of reshuffling under them. Explicit refresh uses server order.
            const previousData = dataRef.current;
            const nextData =
              refreshIndex === 0 && previousData.length > 0
                ? anchorFeedOrder(
                    previousData,
                    recommendations,
                    (item) => item.opportunity.id,
                  )
                : recommendations;

            writeRecommendationCache(cacheKey, nextData);
            setState({
              data: nextData,
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

      try {
        const opportunities = await fetchOpportunities({
          userId: activePreferences.id,
          force: refreshIndex > 0,
        });

        if (!isActive) {
          return;
        }

        // Local heuristic fallback: real scores AND real reasons/risks via
        // evaluateMatch, so match badges stay meaningful when the backend
        // recommender is unreachable. Never primes the server match store —
        // these are not server-computed numbers.
        const personalizedOpportunities: PersonalizedOpportunity[] =
          opportunities
            .map((opportunity) => {
              const match = evaluateMatch(activePreferences, opportunity);
              return {
                opportunity: { ...opportunity, match: match.score },
                matchScore: match.score,
                matchReasons: match.reasons.map((reason) => reason.label),
                matchReasonDetails: match.reasons,
                matchRisks: match.risks,
                aiSummary: null,
                aiTags: [],
              };
            })
            .sort((a, b) => b.matchScore - a.matchScore);

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
