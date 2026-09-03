import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOpportunityHome,
  type OpportunityHomeResponse,
} from "../services/opportunityJourney";

export interface UseOpportunityHomeOptions {
  token?: string | null;
  enabled?: boolean;
  recommendationLimit?: number;
}

export function useOpportunityHome({
  token,
  enabled = true,
  recommendationLimit = 3,
}: UseOpportunityHomeOptions) {
  const [data, setData] = useState<OpportunityHomeResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || !token) {
      setIsLoading(false);
      return null;
    }

    const activeRequest = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getOpportunityHome(token, recommendationLimit);
      if (requestId.current === activeRequest) setData(result);
      return result;
    } catch (nextError) {
      if (requestId.current === activeRequest) setError(nextError);
      throw nextError;
    } finally {
      if (requestId.current === activeRequest) setIsLoading(false);
    }
  }, [enabled, recommendationLimit, token]);

  useEffect(() => {
    if (!enabled || !token) return;
    void refresh().catch(() => undefined);
    return () => {
      requestId.current += 1;
    };
  }, [enabled, refresh, token]);

  return {
    data,
    error,
    isLoading,
    isDegraded: data?.degraded ?? false,
    refresh,
  };
}
