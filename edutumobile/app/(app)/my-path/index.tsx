import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Compass, RefreshCw } from 'lucide-react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import {
  listOpportunityJourneys,
  type OpportunityJourneyView,
  type OpportunityPublicStage,
} from '@edutu/core';
import { useTheme } from '../../../components/context/ThemeContext';
import { useFeatureFlag } from '../../../components/context/AppControlContext';
import JourneyCard from '../../../components/opportunity-path/JourneyCard';
import JourneyStageTabs from '../../../components/opportunity-path/JourneyStageTabs';

export default function MyPathScreen() {
  const { colors } = useTheme();
  const enabled = useFeatureFlag('opportunity_my_path');
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [stage, setStage] = useState<OpportunityPublicStage>('pursuing');
  const [items, setItems] = useState<OpportunityJourneyView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (manual = false) => {
      if (!enabled || !user?.id) {
        setLoading(false);
        return;
      }
      if (manual) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await listOpportunityJourneys({
          userId: user.id,
          stage,
          getAuthToken: getToken,
        });
        setItems(result.data ?? []);
        if (!result.data) setError('Unable to load your opportunity path.');
        else if (result.isStale) setError('Showing your last synced path.');
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Unable to load your opportunity path.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [enabled, getToken, stage, user?.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (!enabled) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.disabledText, { color: colors.textSecondary }]}>
          My Path is not enabled for this account yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>Intentional opportunity journey</Text>
          <Text style={[styles.heading, { color: colors.foreground }]}>My Path</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Track active opportunities and the one action that moves each forward.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh My Path"
          onPress={() => void load(true)}
          hitSlop={8}
          style={[styles.refreshButton, { backgroundColor: colors.muted }]}
        >
          <RefreshCw size={18} color={colors.accent} />
        </Pressable>
      </View>
      <JourneyStageTabs value={stage} onChange={setStage} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.accent}
          />
        }
      >
        {error ? (
          <Text style={[styles.notice, { color: colors.textSecondary }]}>{error}</Text>
        ) : null}
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading your path…</Text>
          </View>
        ) : items.length > 0 ? (
          items.map((item) => (
            <JourneyCard
              key={item.journey.id}
              item={item}
              onContinue={() =>
                router.push({
                  pathname: '/opportunities/[id]',
                  params: { id: item.journey.opportunityId },
                } as never)
              }
            />
          ))
        ) : (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Compass size={30} color={colors.accent} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No opportunities in this stage</Text>
            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>Explore relevant opportunities and choose one worth your time.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Explore opportunities"
              onPress={() => router.push('/opportunities' as never)}
              style={[styles.exploreButton, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.exploreText, { color: colors.background }]}>Explore opportunities</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  disabledText: { textAlign: 'center', fontSize: 14 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  heading: { fontSize: 26, fontWeight: '900', marginTop: 3 },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  refreshButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  notice: { fontSize: 12, fontWeight: '600' },
  loading: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 13 },
  empty: { minHeight: 240, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  emptyBody: { fontSize: 13, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  exploreButton: { minHeight: 44, marginTop: 16, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  exploreText: { fontSize: 13, fontWeight: '800' },
});
