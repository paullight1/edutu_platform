import { useCallback, useEffect, useRef, useState } from "react";
import {
  OpportunityJourneyApiError,
  confirmOpportunityApplication,
  createOpportunityJourney,
  createOpportunityJourneyIdempotencyKey,
  getOpportunityJourney,
  markOpportunityApplicationOpened,
  recordOpportunityJourneyOutcome,
  setOpportunityJourneyPriority,
  transitionOpportunityJourney,
  updateOpportunityJourneyTask,
  type OpportunityJourneyState,
  type OpportunityJourneyView,
} from "../services/opportunityJourney";

export interface UseOpportunityJourneyOptions {
  token?: string | null;
  journeyId?: string | null;
  enabled?: boolean;
  onChanged?: (journey: OpportunityJourneyView) => void;
}

export function useOpportunityJourney({
  token,
  journeyId,
  enabled = true,
  onChanged,
}: UseOpportunityJourneyOptions) {
  const [data, setData] = useState<OpportunityJourneyView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const requestId = useRef(0);

  const applyServerValue = useCallback(
    (value: OpportunityJourneyView) => {
      setData(value);
      setError(null);
      onChanged?.(value);
      return value;
    },
    [onChanged],
  );

  const refresh = useCallback(async () => {
    if (!enabled || !token || !journeyId) return null;
    const activeRequest = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getOpportunityJourney(token, journeyId);
      if (requestId.current === activeRequest) applyServerValue(result);
      return result;
    } catch (nextError) {
      if (requestId.current === activeRequest) setError(nextError);
      throw nextError;
    } finally {
      if (requestId.current === activeRequest) setIsLoading(false);
    }
  }, [applyServerValue, enabled, journeyId, token]);

  useEffect(() => {
    if (!enabled || !token || !journeyId) return;
    void refresh().catch(() => undefined);
    return () => {
      requestId.current += 1;
    };
  }, [enabled, journeyId, refresh, token]);

  const mutate = useCallback(
    async (operation: () => Promise<OpportunityJourneyView>) => {
      setIsMutating(true);
      setError(null);
      try {
        return applyServerValue(await operation());
      } catch (nextError) {
        if (
          nextError instanceof OpportunityJourneyApiError &&
          nextError.status === 409 &&
          nextError.body.code === "JOURNEY_VERSION_CONFLICT" &&
          nextError.body.currentJourney &&
          data
        ) {
          const current: OpportunityJourneyView = {
            ...data,
            journey: {
              ...data.journey,
              ...nextError.body.currentJourney,
            },
          };
          applyServerValue(current);
        }
        setError(nextError);
        throw nextError;
      } finally {
        setIsMutating(false);
      }
    },
    [applyServerValue, data],
  );

  const requireMutationContext = useCallback(() => {
    if (!token || !journeyId || !data) {
      throw new Error("The opportunity journey is not ready for this action.");
    }
    return {
      token,
      journeyId,
      expectedVersion: data.journey.version,
    };
  }, [data, journeyId, token]);

  return {
    data,
    error,
    isLoading,
    isMutating,
    refresh,
    transition: (state: OpportunityJourneyState) => {
      const context = requireMutationContext();
      const idempotencyKey = createOpportunityJourneyIdempotencyKey(
        `transition-${state}`,
      );
      return mutate(() =>
        transitionOpportunityJourney(context.token, context.journeyId, {
          state,
          expectedVersion: context.expectedVersion,
          idempotencyKey,
        }),
      );
    },
    setPriority: (priority: "primary" | "secondary") => {
      const context = requireMutationContext();
      const idempotencyKey = createOpportunityJourneyIdempotencyKey(
        `priority-${priority}`,
      );
      return mutate(() =>
        setOpportunityJourneyPriority(context.token, context.journeyId, {
          priority,
          expectedVersion: context.expectedVersion,
          idempotencyKey,
        }),
      );
    },
    updateTask: (
      taskId: string,
      status: "pending" | "in_progress" | "completed" | "skipped",
    ) => {
      const context = requireMutationContext();
      const idempotencyKey = createOpportunityJourneyIdempotencyKey(
        `task-${taskId}-${status}`,
      );
      return mutate(() =>
        updateOpportunityJourneyTask(
          context.token,
          context.journeyId,
          taskId,
          {
            status,
            expectedVersion: context.expectedVersion,
            idempotencyKey,
          },
        ),
      );
    },
    markApplicationOpened: () => {
      const context = requireMutationContext();
      const idempotencyKey = createOpportunityJourneyIdempotencyKey(
        "application-opened",
      );
      return mutate(() =>
        markOpportunityApplicationOpened(context.token, context.journeyId, {
          expectedVersion: context.expectedVersion,
          idempotencyKey,
        }),
      );
    },
    confirmApplication: () => {
      const context = requireMutationContext();
      const idempotencyKey = createOpportunityJourneyIdempotencyKey(
        "application-confirmed",
      );
      return mutate(() =>
        confirmOpportunityApplication(context.token, context.journeyId, {
          expectedVersion: context.expectedVersion,
          idempotencyKey,
        }),
      );
    },
    recordOutcome: (
      outcome: "offer" | "rejected" | "withdrawn" | "no_response" | "expired",
    ) => {
      const context = requireMutationContext();
      const idempotencyKey = createOpportunityJourneyIdempotencyKey(
        `outcome-${outcome}`,
      );
      return mutate(() =>
        recordOpportunityJourneyOutcome(context.token, context.journeyId, {
          outcome,
          expectedVersion: context.expectedVersion,
          idempotencyKey,
        }),
      );
    },
  };
}

export function createPursuit(
  token: string,
  opportunityId: string,
  action: "shortlist" | "pursue",
  priority?: "primary" | "secondary",
) {
  return createOpportunityJourney(token, {
    opportunityId,
    action,
    priority,
    idempotencyKey: createOpportunityJourneyIdempotencyKey(action),
  });
}
