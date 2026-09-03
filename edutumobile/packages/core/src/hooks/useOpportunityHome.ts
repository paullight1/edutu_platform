import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOpportunityHome,
  replayOpportunityJourneyWrites,
} from "../services/opportunityJourney";
import type { GetAuthToken } from "../services/productApi";
import type { OpportunityHomeResponse } from "../types/opportunityJourney";

export interface UseOpportunityHomeOptions {
  userId?: string | null;
  getAuthToken?: GetAuthToken;
  enabled?: boolean;
  recommendationLimit?: number;
}

export function useOpportunityHome({
  userId,
  getAuthToken,
  enabled = true,
  recommendationLimit = 3,
}: UseOpportunityHomeOptions) {
  const [data, setData] = useState<OpportunityHomeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || !userId || !getAuthToken) return null;
    const active = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      await replayOpportunityJourneyWrites(userId, getAuthToken);
      const result = await getOpportunityHome({
        userId,
        getAuthToken,
        recommendationLimit,
      });
      if (requestId.current === active) {
        setData(result.data);
        setIsStale(result.isStale);
        if (!result.data) setError("Unable to load your opportunity path.");
      }
      return result;
    } catch (nextError) {
      if (requestId.current === active) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load your opportunity path.",
        );
      }
      throw nextError;
    } finally {
      if (requestId.current === active) setLoading(false);
    }
  }, [enabled, getAuthToken, recommendationLimit, userId]);

  useEffect(() => {
    if (!enabled || !userId || !getAuthToken) return;
    void refresh().catch(() => undefined);
    return () => {
      requestId.current += 1;
    };
  }, [enabled, getAuthToken, refresh, userId]);

  return {
    data,
    loading,
    error,
    isStale,
    refresh,
  };
}
