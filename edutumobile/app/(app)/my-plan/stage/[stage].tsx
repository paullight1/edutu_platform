import { useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../../components/context/ThemeContext';
import JourneyCard from '../../../../components/opportunity-path/JourneyCard';
import { PLAN_PAGE_SIZE, PLAN_STAGES, planPalette } from '../../../../components/opportunity-path/planPresentation';
import { StateView } from '../../../../components/state';
import { Skeleton } from '../../../../components/ui/Skeleton';
import { usePlanJourneys } from '../../../../hooks/usePlanJourneys';
import { getDeadlineBadge } from '@edutu/core/src/utils/deadline';
import type { OpportunityJourneyView, OpportunityPublicStage } from '@edutu/core/src/types/opportunityJourney';

export default function PlanStageScreen() {
  const { stage: parameter } = useLocalSearchParams<{ stage: string }>();
  const value = Array.isArray(parameter) ? parameter[0] : parameter;
  const stage = PLAN_STAGES.find(item => item.key === value);
  const { userId } = useAuth();
  const router = useRouter();
  if (!stage) return <StateView state={{ kind: 'error', cause: 'server' }} flow="applied"
    title="This plan list is unavailable" body="Return to My Plan and choose a status." actionLabel="My Plan" onAction={() => router.replace('/my-plan')} />;
  return <PlanStageContent key={`${userId}:${stage.key}`} stage={stage.key} />;
}

function PlanStageContent({ stage }: { stage: OpportunityPublicStage }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('home');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reads, loading, signedIn, refresh } = usePlanJourneys([stage]);
  const [search, setSearch] = useState('');
  const [dueSoon, setDueSoon] = useState(false);
  const [requestedPage, setPage] = useState(1);
  const list = useRef<FlatList<OpportunityJourneyView>>(null);
  const config = PLAN_STAGES.find(item => item.key === stage)!;
  const swatch = planPalette(isDark)[config.tone];
  const read = reads[stage];
  const entries = read?.data ?? [];
  const isDueSoon = (item: OpportunityJourneyView) => {
    const deadline = getDeadlineBadge(typeof item.opportunity.deadline === 'string' ? item.opportunity.deadline : null);
    return deadline.daysLeft !== null && deadline.daysLeft >= 0 && deadline.daysLeft <= 7;
  };
  const query = search.trim().toLocaleLowerCase();
  const filtered = entries.filter(item => (!dueSoon || isDueSoon(item)) &&
    (!query || [item.opportunity.title, item.opportunity.organization, item.journey.state.replaceAll('_', ' ')].some(value =>
      typeof value === 'string' && value.toLocaleLowerCase().includes(query))));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PLAN_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const first = (page - 1) * PLAN_PAGE_SIZE;
  const visible = filtered.slice(first, first + PLAN_PAGE_SIZE);
  const unavailable = !loading && !read?.data;
  const changePage = (next: number) => {
    setPage(next);
    list.current?.scrollToOffset({ offset: 0, animated: false });
  };
  const back = () => router.canGoBack() ? router.back() : router.replace('/my-plan');

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to My Plan" style={styles.iconButton} onPress={back}>
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{t(`myPlan.stages.${stage}`, { defaultValue: config.label })}</Text>
        <View style={[styles.count, { backgroundColor: swatch.background }]}>
          <Text style={{ color: swatch.ink, fontWeight: '700' }}>{read?.data ? entries.length : '—'}</Text>
        </View>
      </View>
      <View style={styles.controls}>
        <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Search size={18} color={colors.textSecondary} />
          <TextInput accessibilityLabel="Search this plan list" placeholder="Search opportunities" placeholderTextColor={colors.textSecondary}
            value={search} onChangeText={value => { setSearch(value); changePage(1); }}
            style={[styles.searchInput, { color: colors.foreground }]} autoCorrect={false} returnKeyType="search" />
          {search.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" style={styles.iconButton} onPress={() => { setSearch(''); changePage(1); }}>
            <X size={18} color={colors.textSecondary} />
          </Pressable>}
        </View>
        {stage !== 'outcome' && <View style={styles.filters}>
          {[false, true].map(value => <Pressable key={String(value)} accessibilityRole="button" accessibilityState={{ selected: dueSoon === value }}
            onPress={() => { setDueSoon(value); changePage(1); }}
            style={[styles.filter, { borderColor: dueSoon === value ? colors.accent : colors.border, backgroundColor: dueSoon === value ? swatch.background : colors.card }]}>
            <Text style={{ color: dueSoon === value ? swatch.ink : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
              {value ? `Due in 7 days · ${entries.filter(isDueSoon).length}` : `All · ${read?.data ? entries.length : '—'}`}
            </Text>
          </Pressable>)}
        </View>}
      </View>
      <FlatList ref={list} data={visible} keyExtractor={item => item.journey.id}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        refreshControl={<RefreshControl refreshing={loading && entries.length > 0} onRefresh={refresh} tintColor={colors.accent} />}
        ListHeaderComponent={<View style={styles.listHeading}>
          {unavailable || read?.isStale ? <View>
            <Text accessibilityRole="alert" style={{ color: colors.textSecondary }}>{!signedIn ? 'Sign in to view your plan.' : unavailable ? t('myPlan.loadError') : t('myPlan.stale')}</Text>
            <Pressable accessibilityRole="button" style={styles.retry} onPress={refresh}><Text style={{ color: colors.accent }}>{t('myPlan.retry')}</Text></Pressable>
          </View> : null}
          {!loading && !unavailable && <Text accessibilityLiveRegion="polite" style={{ color: colors.textSecondary, fontSize: 13 }}>
            {filtered.length ? `Showing ${first + 1}–${Math.min(first + PLAN_PAGE_SIZE, filtered.length)} of ${filtered.length}` : 'No matching opportunities'}
          </Text>}
        </View>}
        renderItem={({ item }) => <JourneyCard item={item} onContinue={() => router.push({ pathname: '/my-plan/[id]', params: { id: item.journey.id } })} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={loading ? <Skeleton height={126} borderRadius={16} /> : !unavailable ? (
          <StateView state={{ kind: 'empty', reason: 'firstRun' }} flow="applied" fill={false} sceneSize={100}
            title={search || dueSoon ? 'No opportunities match' : t('myPlan.empty')}
            body={search || dueSoon ? 'Try another search or clear your filters.' : t(`myPlan.empty_${stage}`)}
            actionLabel={search || dueSoon ? 'Clear filters' : t('myPlan.explore')}
            onAction={() => { if (search || dueSoon) { setSearch(''); setDueSoon(false); changePage(1); } else router.push('/opportunities'); }} />
        ) : null}
        ListFooterComponent={filtered.length > 0 ? <View style={styles.footer}>
          <View style={styles.pagination}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous page" accessibilityState={{ disabled: page === 1 }}
              disabled={page === 1} onPress={() => changePage(page - 1)} style={[styles.pageButton, { borderColor: colors.border, opacity: page === 1 ? 0.4 : 1 }]}>
              <ChevronLeft size={18} color={colors.foreground} />
            </Pressable>
            <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground, fontWeight: '600' }}>Page {page} of {totalPages}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next page" accessibilityState={{ disabled: page === totalPages }}
              disabled={page === totalPages} onPress={() => changePage(page + 1)} style={[styles.pageButton, { borderColor: colors.border, opacity: page === totalPages ? 0.4 : 1 }]}>
              <ChevronRight size={18} color={colors.foreground} />
            </Pressable>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{PLAN_PAGE_SIZE} opportunities per page</Text>
        </View> : null}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 6, alignItems: 'center' },
  iconButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 25, fontWeight: '700', flexShrink: 1 },
  count: { borderRadius: 16, paddingHorizontal: 10, paddingVertical: 3 },
  controls: { paddingHorizontal: 18, gap: 10, paddingBottom: 8 },
  search: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 13, paddingLeft: 12, gap: 8 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 14, paddingRight: 10 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { borderRadius: 20, paddingHorizontal: 12, minHeight: 44, justifyContent: 'center', borderWidth: 1 },
  content: { paddingHorizontal: 18, flexGrow: 1 },
  listHeading: { paddingVertical: 8, gap: 8 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  footer: { paddingTop: 16, alignItems: 'center', gap: 8 },
  pagination: { flexDirection: 'row', gap: 20, alignItems: 'center' },
  pageButton: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
