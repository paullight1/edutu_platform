import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth, useUser } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronRight, Plus, Users } from 'lucide-react-native';
import {
  fetchGroups,
  isCommunityApiError,
  type CommunityGroup,
} from '@edutu/core/src/services/communities';
import {
  fetchSavedOpportunities,
  type SavedOpportunity,
} from '@edutu/core/src/services/bookmarks';
import { supabase } from '../../../lib/supabase';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { AnimatedPressable } from '../../../components/ui/AnimatedPressable';
import { useTheme } from '../../../components/context/ThemeContext';
import { GroupRow } from '../../../components/community/GroupRow';
import { GroupRailCard } from '../../../components/community/GroupRailCard';
import { WhatsAppBanner } from '../../../components/community/WhatsAppBanner';

/**
 * Group Discussions — browse.
 *
 * Until this screen existed the whole feature was one Discover tile that opened
 * a WhatsApp channel. That channel is now the dismissible banner at the top:
 * one room among several, rather than the product.
 *
 * THREE AFFORDANCES, ON PURPOSE. DESIGN.md §5.1 calls card monoculture a known
 * debt and bans repeating one card grid down a screen, so each section gets the
 * shape that matches how you'd actually use it:
 *   • Your groups — list ROWS. A standing relationship you scan by name and
 *     unread state, including invitations and applications, which read
 *     differently because one can walk in and one is waiting.
 *   • Saved-opportunity groups — a horizontal RAIL. These are time-boxed and
 *     close with their opportunity, so they carry a deadline chip from the
 *     shared urgency ramp and read as a queue.
 *   • Discover — an INLINE section of pills. Lightweight browsing; no card
 *     chrome, because none of these are yours yet.
 */

/** One JSON blob keyed by group id: a per-group key would mean N reads. */
const LAST_READ_KEY = 'edutu:discussions:lastRead';

type LastReadMap = Record<string, string>;

async function readLastRead(): Promise<LastReadMap> {
  try {
    const raw = await AsyncStorage.getItem(LAST_READ_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as LastReadMap) : {};
  } catch {
    // Unreadable → nothing is unread. Over-marking every group as unread on a
    // storage hiccup would be a screen full of false alarms.
    return {};
  }
}

function isUnread(group: CommunityGroup, lastRead: LastReadMap): boolean {
  if (!group.lastMessageAt) return false;
  const seen = lastRead[group.id];
  if (!seen) return true;
  return new Date(group.lastMessageAt).getTime() > new Date(seen).getTime();
}

export default function DiscussionsBrowseScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const { t } = useTranslation(['community', 'common']);
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<CommunityGroup[]>([]);
  const [visible, setVisible] = useState<CommunityGroup[]>([]);
  const [saved, setSaved] = useState<SavedOpportunity[]>([]);
  const [lastRead, setLastRead] = useState<LastReadMap>({});

  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    setError(null);
    try {
      // Two calls, not one filtered client-side: the backend caps the list at
      // 50 rows, so asking for "mine" separately guarantees a group you belong
      // to can never be pushed off the page by public ones.
      const [mineRows, visibleRows] = await Promise.all([
        fetchGroups({ mine: true, limit: 50 }, getToken),
        fetchGroups({ limit: 50 }, getToken),
      ]);
      setMine(mineRows);
      setVisible(visibleRows);
    } catch (caught) {
      // The server writes these sentences for the member to read and act on
      // ("You're already in 2 groups…"). Showing a status code instead throws
      // that away — see the header of services/communities.ts.
      setError(
        isCommunityApiError(caught)
          ? caught.message
          : t('common:errors.generic'),
      );
    }

    // Bookmarks degrade to [] rather than throwing, and a failure here only
    // costs the rail — so it must never blank out the groups above it.
    if (userId) {
      try {
        setSaved(await fetchSavedOpportunities(supabase, userId, getToken));
      } catch {
        setSaved([]);
      }
    }

    setLastRead(await readLastRead());
  }, [getToken, userId, t]);

  useEffect(() => {
    const run = async () => {
      try {
        await load();
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const openGroup = useCallback(
    (group: CommunityGroup) => {
      router.push(`/discussions/${group.id}` as never);
    },
    [router],
  );

  const openCreate = useCallback(() => {
    router.push('/discussions/new' as never);
  }, [router]);

  const savedById = useMemo(() => {
    const map = new Map<string, SavedOpportunity>();
    for (const row of saved) map.set(row.opportunity_id, row);
    return map;
  }, [saved]);

  const mineIds = useMemo(() => new Set(mine.map((g) => g.id)), [mine]);

  /** Groups pinned to an opportunity this user saved — mine first. */
  const railGroups = useMemo(() => {
    const seen = new Set<string>();
    const out: CommunityGroup[] = [];
    for (const group of [...mine, ...visible]) {
      if (seen.has(group.id)) continue;
      if (!group.opportunityId || !savedById.has(group.opportunityId)) continue;
      seen.add(group.id);
      out.push(group);
    }
    return out;
  }, [mine, visible, savedById]);

  const railIds = useMemo(
    () => new Set(railGroups.map((g) => g.id)),
    [railGroups],
  );

  const discoverGroups = useMemo(
    () =>
      visible.filter(
        (group) =>
          !mineIds.has(group.id) && !railIds.has(group.id) && !group.archivedAt,
      ),
    [visible, mineIds, railIds],
  );

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScreenHeader
        title={t('community:screens.browseTitle')}
        showBack
        right={
          <AnimatedPressable
            testID="discussions-create"
            accessibilityRole="button"
            accessibilityLabel={t('community:actions.createGroup')}
            hapticFeedback="medium"
            onPress={openCreate}
            style={[styles.headerAction, { backgroundColor: colors.accent }]}
          >
            <Plus size={18} color="#FFFFFF" strokeWidth={2.5} />
          </AnimatedPressable>
        }
      />

      <ScrollView
        testID="discussions-scroll"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
      >
        <WhatsAppBanner />

        {!!error && (
          <View
            testID="discussions-error"
            style={[
              styles.errorBox,
              { backgroundColor: `${colors.error}12`, borderColor: colors.error },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.error }]}>
              {error}
            </Text>
            <AnimatedPressable
              testID="discussions-retry"
              accessibilityRole="button"
              accessibilityLabel={t('common:actions.retry')}
              onPress={handleRefresh}
              disabled={refreshing}
              style={[styles.retryButton, { borderColor: colors.error }]}
            >
              <Text style={[styles.retryLabel, { color: colors.error }]}>
                {t('common:actions.retry')}
              </Text>
            </AnimatedPressable>
          </View>
        )}

        {/* Loading is skeleton rows in place, never a spinner floating over
            content — the shape of what's coming is itself information. */}
        {loading ? (
          <View testID="discussions-loading" style={styles.skeletonWrap}>
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} height={68} borderRadius={14} />
            ))}
          </View>
        ) : (
          <>
            {/* ── 1. Your groups: list rows ────────────────────────────── */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {t('community:sections.yourGroups')}
              </Text>

              {mine.length === 0 ? (
                <EmptyState
                  testID="discussions-empty"
                  icon={Users}
                  title={t('community:empty.noGroups')}
                  // One line, one CTA (DESIGN.md). EmptyState falls back to a
                  // generic second sentence when this is empty, so it is held
                  // blank rather than left undefined.
                  description=" "
                  actionLabel={t('community:actions.createGroup')}
                  onAction={openCreate}
                />
              ) : (
                mine.map((group, index) => (
                  <GroupRow
                    key={group.id}
                    group={group}
                    membership="active"
                    unread={isUnread(group, lastRead)}
                    index={index}
                    onPress={openGroup}
                  />
                ))
              )}
            </View>

            {/* ── 2. Saved-opportunity groups: horizontal rail ─────────── */}
            {railGroups.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  {t('community:sections.forYourSavedOpportunities')}
                </Text>
                <ScrollView
                  testID="discussions-rail"
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rail}
                >
                  {railGroups.map((group, index) => {
                    const opportunity = group.opportunityId
                      ? savedById.get(group.opportunityId)
                      : undefined;
                    return (
                      <GroupRailCard
                        key={group.id}
                        group={group}
                        deadline={opportunity?.deadline ?? group.expiresAt}
                        opportunityTitle={opportunity?.title ?? null}
                        index={index}
                        onPress={openGroup}
                      />
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* ── 3. Discover: inline pills, no card chrome ────────────── */}
            {discoverGroups.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  {t('community:sections.discover')}
                </Text>
                <View testID="discussions-discover" style={styles.pillWrap}>
                  {discoverGroups.map((group) => (
                    <AnimatedPressable
                      key={group.id}
                      testID={`discover-pill-${group.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={group.name}
                      hapticFeedback="selection"
                      scaleTo={0.97}
                      onPress={() => openGroup(group)}
                      style={[styles.pill, { borderColor: colors.border }]}
                    >
                      <View style={styles.pillInner}>
                        <Text style={styles.pillEmoji}>{group.coverEmoji}</Text>
                        <Text
                          style={[styles.pillLabel, { color: colors.foreground }]}
                          numberOfLines={1}
                        >
                          {group.name}
                        </Text>
                        <ChevronRight size={14} color={colors.textSecondary} />
                      </View>
                    </AnimatedPressable>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
    gap: 20,
  },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  skeletonWrap: {
    gap: 10,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    alignItems: 'flex-start',
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
  },
  retryButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  retryLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  rail: {
    paddingRight: 8,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
  },
  pillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillEmoji: {
    fontSize: 14,
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 160,
  },
});
