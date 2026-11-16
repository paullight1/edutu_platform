import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect } from 'expo-router';
import { listOpportunityJourneys } from '@edutu/core/src/services/opportunityJourney';
import type { OpportunityJourneyReadResult, OpportunityJourneyView, OpportunityPublicStage } from '@edutu/core/src/types/opportunityJourney';

type StageResult = OpportunityJourneyReadResult<OpportunityJourneyView[]>;
type PlanReads = Partial<Record<OpportunityPublicStage, StageResult>>;

export function usePlanJourneys(stages: readonly OpportunityPublicStage[]) {
  const { userId, getToken } = useAuth();
  const token = useRef(getToken);
  useEffect(() => { token.current = getToken; }, [getToken]);
  const stageKey = stages.join(',');
  const key = `${userId}:${stageKey}`;
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [state, setState] = useState<{ key: string; reads: PlanReads; loading: boolean }>({
    key: '', reads: {}, loading: true,
  });

  useFocusEffect(useCallback(() => {
    let active = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    setState(previous => ({ key, reads: previous.key === key ? previous.reads : {}, loading: Boolean(userId) }));
    if (userId) {
      const requestedStages = stageKey.split(',') as OpportunityPublicStage[];
      void Promise.all(requestedStages.map(async stage => {
        try {
          const result = await Promise.race([
            listOpportunityJourneys({ userId, stage, getAuthToken: () => token.current() }),
            new Promise<never>((_, reject) => {
              timers.push(setTimeout(() => reject(new Error('Plan request timed out')), 15000));
            }),
          ]);
          return [stage, result] as const;
        } catch {
          return [stage, { data: null, isStale: false, source: 'none' } as StageResult] as const;
        }
      })).then(entries => {
        timers.forEach(clearTimeout);
        if (active) setState({ key, reads: Object.fromEntries(entries), loading: false });
      });
    }
    return () => {
      active = false;
      timers.forEach(clearTimeout);
    };
  // Explicit refresh restarts this focused read even when the account and stages are unchanged.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, stageKey, userId, refreshIndex]));

  const current = state.key === key;
  return {
    reads: current ? state.reads : {},
    loading: Boolean(userId) && (!current || state.loading),
    signedIn: Boolean(userId),
    refresh: () => setRefreshIndex(value => value + 1),
  };
}
