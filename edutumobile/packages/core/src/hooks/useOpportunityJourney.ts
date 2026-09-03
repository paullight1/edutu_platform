import { useCallback, useEffect, useRef, useState } from 'react';
import {
  confirmOpportunityApplication,
  createOpportunityJourneyIdempotencyKey,
  getOpportunityJourney,
  markOpportunityApplicationOpened,
  recordOpportunityJourneyOutcome,
  updateOpportunityJourneyTask,
} from '../services/opportunityJourney';
import type { GetAuthToken } from '../services/productApi';
import type { OpportunityJourneyView } from '../types/opportunityJourney';

export interface UseOpportunityJourneyOptions {
  userId?: string | null;
  journeyId?: string | null;
  getAuthToken?: GetAuthToken;
  enabled?: boolean;
}

export function useOpportunityJourney({
  userId,
  journeyId,
  getAuthToken,
  enabled = true,
}: UseOpportunityJourneyOptions) {
  const [data, setData] = useState<OpportunityJourneyView | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [pendingSync, setPendingSync] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || !userId || !journeyId || !getAuthToken) return null;
    const active = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getOpportunityJourney({
        userId,
        journeyId,
        getAuthToken,
      });
      if (requestId.current === active) {
        setData(result.data);
        if (!result.data) setError('Unable to load this opportunity path.');
      }
      return result;
    } catch (nextError) {
      if (requestId.current === active) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Unable to load this opportunity path.',
        );
      }
      throw nextError;
    } finally {
      if (requestId.current === active) setLoading(false);
    }
  }, [enabled, getAuthToken, journeyId, userId]);

  useEffect(() => {
    if (!enabled || !userId || !journeyId || !getAuthToken) return;
    void refresh().catch(() => undefined);
    return () => {
      requestId.current += 1;
    };
  }, [enabled, getAuthToken, journeyId, refresh, userId]);

  const requireContext = useCallback(() => {
    if (!userId || !journeyId || !getAuthToken || !data) {
      throw new Error('The opportunity path is not ready for this action.');
    }
    return {
      userId,
      journeyId,
      getAuthToken,
      expectedVersion: data.journey.version,
    };
  }, [data, getAuthToken, journeyId, userId]);

  const mutate = useCallback(
    async (
      operation: () => Promise<{
        data: OpportunityJourneyView | null;
        queued: boolean;
      }>,
    ) => {
      setMutating(true);
      setError(null);
      try {
        const result = await operation();
        setPendingSync(result.queued);
        if (result.data) setData(result.data);
        return result;
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Unable to update this opportunity path.',
        );
        throw nextError;
      } finally {
        setMutating(false);
      }
    },
    [],
  );

  return {
    data,
    loading,
    mutating,
    pendingSync,
    error,
    refresh,
    updateTask: (
      taskId: string,
      status: 'pending' | 'in_progress' | 'completed' | 'skipped',
    ) => {
      const context = requireContext();
      return mutate(() =>
        updateOpportunityJourneyTask({
          ...context,
          taskId,
          status,
          idempotencyKey: createOpportunityJourneyIdempotencyKey(
            `task-${taskId}-${status}`,
          ),
        }),
      );
    },
    markApplicationOpened: () => {
      const context = requireContext();
      return mutate(() =>
        markOpportunityApplicationOpened({
          ...context,
          idempotencyKey: createOpportunityJourneyIdempotencyKey(
            'application-opened',
          ),
        }),
      );
    },
    confirmApplication: () => {
      const context = requireContext();
      return mutate(() =>
        confirmOpportunityApplication({
          ...context,
          idempotencyKey: createOpportunityJourneyIdempotencyKey(
            'application-confirmed',
          ),
        }),
      );
    },
    recordOutcome: (
      outcome: 'offer' | 'rejected' | 'withdrawn' | 'no_response' | 'expired',
    ) => {
      const context = requireContext();
      return mutate(() =>
        recordOpportunityJourneyOutcome({
          ...context,
          outcome,
          idempotencyKey: createOpportunityJourneyIdempotencyKey(
            `outcome-${outcome}`,
          ),
        }),
      );
    },
  };
}
