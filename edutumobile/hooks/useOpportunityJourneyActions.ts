import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import {
  createOpportunityJourney,
  createOpportunityJourneyIdempotencyKey,
  listOpportunityJourneys,
  transitionOpportunityJourney,
  useOpportunityJourney,
  type GetAuthToken,
  type OpportunityJourneyView,
  type OpportunityPublicStage,
} from '@edutu/core';

const STAGES: OpportunityPublicStage[] = [
  'discover',
  'pursuing',
  'applied',
  'outcome',
];

export function useOpportunityJourneyActions(input: {
  userId: string;
  opportunityId: string;
  applicationUrl?: string | null;
  getAuthToken: GetAuthToken;
}) {
  const [seed, setSeed] = useState<OpportunityJourneyView | null>(null);
  const [loadingSeed, setLoadingSeed] = useState(true);
  const [creating, setCreating] = useState<'shortlist' | 'pursue' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSeed = useCallback(async () => {
    setLoadingSeed(true);
    setError(null);
    try {
      const results = await Promise.all(
        STAGES.map((stage) =>
          listOpportunityJourneys({
            userId: input.userId,
            stage,
            getAuthToken: input.getAuthToken,
          }),
        ),
      );
      setSeed(
        results
          .flatMap((result) => result.data ?? [])
          .find(
            (item) => item.journey.opportunityId === input.opportunityId,
          ) ?? null,
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to load your opportunity status.',
      );
    } finally {
      setLoadingSeed(false);
    }
  }, [input.getAuthToken, input.opportunityId, input.userId]);

  useEffect(() => {
    void loadSeed();
  }, [loadSeed]);

  const journey = useOpportunityJourney({
    userId: input.userId,
    journeyId: seed?.journey.id,
    getAuthToken: input.getAuthToken,
    enabled: Boolean(seed?.journey.id),
  });
  const current = journey.data ?? seed;
  const actionKey = useMemo(
    () => current?.nextAction.key ?? 'activate',
    [current?.nextAction.key],
  );

  const create = async (action: 'shortlist' | 'pursue') => {
    setCreating(action);
    setError(null);
    try {
      const result = await createOpportunityJourney({
        userId: input.userId,
        opportunityId: input.opportunityId,
        action,
        idempotencyKey: createOpportunityJourneyIdempotencyKey(action),
        getAuthToken: input.getAuthToken,
      });
      if (result.data) setSeed(result.data);
      return result;
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to update this opportunity.',
      );
      throw nextError;
    } finally {
      setCreating(null);
    }
  };

  const openApplication = async () => {
    if (!input.applicationUrl) {
      throw new Error('The official application URL is unavailable.');
    }
    const result = await journey.markApplicationOpened();
    await Linking.openURL(input.applicationUrl);
    return result;
  };

  const notYet = async () => {
    if (!current) return null;
    const result = await transitionOpportunityJourney({
      userId: input.userId,
      journeyId: current.journey.id,
      state: 'ready_to_apply',
      expectedVersion: current.journey.version,
      idempotencyKey: createOpportunityJourneyIdempotencyKey(
        'application-not-yet',
      ),
      getAuthToken: input.getAuthToken,
    });
    if (result.data) setSeed(result.data);
    return result;
  };

  return {
    current,
    actionKey,
    loading: loadingSeed || journey.loading,
    mutating: Boolean(creating) || journey.mutating,
    pendingSync: journey.pendingSync,
    error: error ?? journey.error,
    creating,
    refresh: loadSeed,
    pursue: () => create('pursue'),
    shortlist: () => create('shortlist'),
    openApplication,
    confirmApplication: journey.confirmApplication,
    notYet,
    withdraw: () => journey.recordOutcome('withdrawn'),
    updateOutcome: journey.recordOutcome,
  };
}
