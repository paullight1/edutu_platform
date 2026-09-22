import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { StateView } from '../../../components/state';
import { Skeleton } from '../../../components/ui/Skeleton';
import { PlanWorkspaceHeader } from '../../../components/opportunity-path/PlanWorkspaceHeader';
import { useTheme } from '../../../components/context/ThemeContext';
import JourneyCard from '../../../components/opportunity-path/JourneyCard';
import JourneyStageTabs from '../../../components/opportunity-path/JourneyStageTabs';
import { listOpportunityJourneys } from '@edutu/core/src/services/opportunityJourney';
import type { OpportunityJourneyView, OpportunityPublicStage } from '@edutu/core/src/types/opportunityJourney';

interface PlanState {
  key: string;
  journeys: OpportunityJourneyView[];
  loading: boolean;
  error: string | null;
}

export default function MyPlanScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation('home');
  const { userId, getToken } = useAuth();
  const router = useRouter();
  // Clerk may replace getToken during a render. This must not restart a load.
  const dependencies = useRef({ getToken, t });
  useEffect(() => { dependencies.current = { getToken, t }; }, [getToken, t]);
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<OpportunityPublicStage>('pursuing');
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [state, setState] = useState<PlanState>({ key: '', journeys: [], loading: true, error: null });
  const key = `${userId}:${stage}`;
  useFocusEffect(useCallback(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const loadPlan = async () => {
      if (!active) return;
      if (!userId) {
        setState({ key, journeys: [], loading: false, error: 'Sign in to view your plan.' });
        return;
      }
      setState((previous) => ({ ...previous, loading: true, error: null }));
      try {
        const result = await Promise.race([
          listOpportunityJourneys({ userId, stage, getAuthToken: () => dependencies.current.getToken() }),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('Plan request timed out')), 15000);
          }),
        ]);
        if (!result.data) throw new Error('Unable to load your plan. Please try again.');
        if (active) setState({ key, journeys: result.data, loading: false,
          error: result.isStale ? dependencies.current.t('myPlan.stale') : null });
      } catch {
        if (active) setState((previous) => ({ ...previous, key,
          journeys: previous.key === key ? previous.journeys : [],
          loading: false, error: dependencies.current.t('myPlan.loadError') }));
      } finally { clearTimeout(timeout); }
    };
    void loadPlan();
    return () => { active = false; clearTimeout(timeout); };
  // A refresh gesture deliberately restarts the focused read.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, stage, refreshIndex, userId]));

  const current = state.key === key;
  const loading = Boolean(userId) && (!current || state.loading);
  const data = current ? state.journeys : [];
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={{ paddingTop: insets.top }}><PlanWorkspaceHeader section="overview" /></View>
      <JourneyStageTabs value={stage} onChange={setStage} />
      <FlatList
        data={data}
        keyExtractor={(item) => item.journey.id}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 130 }]}
        refreshControl={<RefreshControl refreshing={loading && data.length > 0} onRefresh={() => setRefreshIndex((n) => n + 1)} tintColor={colors.accent} />}
        ListHeaderComponent={current && state.error && data.length > 0 ? (
          <View style={styles.notice}>
            <Text accessibilityRole="alert" style={{ color: colors.textSecondary }}>{state.error}</Text>
            <Pressable accessibilityRole="button" onPress={() => setRefreshIndex((n) => n + 1)} style={styles.retry}>
              <Text style={{ color: colors.accent, fontWeight: '700' }}>{t('myPlan.retry')}</Text>
            </Pressable>
          </View>
        ) : null}
        renderItem={({ item }) => (
          <JourneyCard item={item} onContinue={() => router.push({ pathname: '/my-plan/[id]', params: { id: item.journey.id } })} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        ListEmptyComponent={loading ? (
          <View accessibilityLabel={t('myPlan.loading')} accessibilityState={{ busy: true }} style={{ gap: 16 }}>
            {[0, 1].map(key => <View key={key} style={[styles.loadingCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Skeleton width="35%" height={24} /><Skeleton width="90%" height={24} /><Skeleton width="65%" height={18} />
              <Skeleton height={4} /><Skeleton width="75%" height={20} />
            </View>)}
          </View>
        ) : state.error && current ? (
          <StateView state={{ kind: 'error', cause: 'server' }} flow="applied" fill={false} sceneSize={160}
            title={t('myPlan.reconnectTitle')} body={state.error} actionLabel={t('myPlan.retry')}
            onRetry={() => setRefreshIndex(n => n + 1)} />
        ) : (
          <StateView state={{ kind: 'empty', reason: 'firstRun' }} flow="applied" fill={false} sceneSize={160}
            title={t('myPlan.empty')} body={t(`myPlan.empty_${stage}`)} actionLabel={t('myPlan.explore')}
            onAction={() => router.push('/opportunities')} />
        )}

      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loadingCard: { padding: 20, borderRadius: 24, borderWidth: 1, gap: 20 },
  content: { padding: 20, flexGrow: 1 },
  notice: { gap: 6, paddingBottom: 16 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
