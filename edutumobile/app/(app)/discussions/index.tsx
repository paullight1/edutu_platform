import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth, useUser } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronRight, Plus } from 'lucide-react-native';
import {
  fetchGroups,
  isCommunityApiError,
  type CommunityGroup,
  type GroupWithMembership,
  type MembershipStatus,
} from '@edutu/core/src/services/communities';
import {
  fetchSavedOpportunities,
  type SavedOpportunity,
} from '@edutu/core/src/services/bookmarks';
import { supabase } from '../../../lib/supabase';
import { StateView } from '../../../components/state';
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

/** `null` when the caller has no row on this group at all. */
function statusOf(row: GroupWithMembership): MembershipStatus | null {
  return row.membership?.status ?? null;
}

/**
 * A relationship that is over. The backend never returns these from the list,
 * but a stale cache or a deploy skew could — and neither may be offered as a
 * way in.
 */
function isClosed(status: MembershipStatus | null): boolean {
  return status === 'removed' || status === 'banned';
}

export default function DiscussionsBrowseScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const { t } = useTranslation(['community', 'common']);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `{ group, membership }` rows, not bare groups: `mine` now means every group
  // the caller has a live relationship with — joined, invited, or applied — and
  // only the membership tells those apart.
  const [mine, setMine] = useState<GroupWithMembership[]>([]);
  const [visible, setVisible] = useState<GroupWithMembership[]>([]);
  const [saved, setSaved] = useState<SavedOpportunity[]>([]);
  const [lastRead, setLastRead] = useState<LastReadMap>({});
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const initialLoadFinishedRef = useRef(false);
  const getTokenRef = useRef(getToken);

  const userId = user?.id ?? null;

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const tokenProvider = getTokenRef.current;

    // Settle independently: a transient Discover failure must not erase the
    // caller's own groups, and an older request must not overwrite a refresh.
    const [mineResult, visibleResult] = await Promise.allSettled([
      fetchGroups({ mine: true, limit: 50 }, tokenProvider),
      fetchGroups({ limit: 50 }, tokenProvider),
    ]);

    if (!mountedRef.current || requestId !== requestIdRef.current) return;

    if (mineResult.status === 'fulfilled') setMine(mineResult.value);
    if (visibleResult.status === 'fulfilled') setVisible(visibleResult.value);

    if (
      mineResult.status === 'rejected' &&
      visibleResult.status === 'rejected'
    ) {
      const caught = mineResult.reason ?? visibleResult.reason;
      // The server writes these sentences for the member to read and act on
      // ("You're already in 2 groups…"). Showing a status code instead throws
      // that away — see the header of services/communities.ts.
      setError(
        isCommunityApiError(caught)
          ? caught.message
          : t('common:errors.generic'),
      );
    } else {
      // Do not clear the red bar at retry start and make it blink. It leaves
      // only after at least one group source has actually recovered.
      setError(null);
    }

    // Bookmarks degrade to [] rather than throwing, and a failure here only
    // costs the rail — so it must never blank out the groups above it.
    if (userId) {
      try {
        const savedRows = await fetchSavedOpportunities(
          supabase,
          userId,
          tokenProvider,
        );
        if (mountedRef.current && requestId === requestIdRef.current) {
          setSaved(savedRows);
        }
      } catch {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setSaved([]);
        }
      }
    }

    const latestLastRead = await readLastRead();
    if (mountedRef.current && requestId === requestIdRef.current) {
      setLastRead(latestLastRead);
    }
  }, [userId, t]);

  useEffect(() => {
    mountedRef.current = true;
    const run = async () => {
      try {
        await load();
      } finally {
        if (mountedRef.current) {
          initialLoadFinishedRef.current = true;
          setLoading(false);
        }
      }
    };
    void run();

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [load]);

  // Expo keeps this route mounted beneath create/detail screens. Revalidate
  // when Groups becomes active again so a new group replaces the stale empty
  // state immediately.
  useFocusEffect(
    useCallback(() => {
      if (!initialLoadFinishedRef.current) return;
      void load();
    }, [load]),
  );

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

  const mineIds = useMemo(
    () => new Set(mine.map((row) => row.group.id)),
    [mine],
  );

  /**
   * One row per group id across both calls, the caller's own membership winning
   * — the `mine` call is the only one guaranteed to carry it, so a group that
   * appears in both must be described by that row, never by the anonymous one.
   */
  const rowsById = useMemo(() => {
    const map = new Map<string, GroupWithMembership>();
    for (const row of [...mine, ...visible]) {
      if (!map.has(row.group.id)) map.set(row.group.id, row);
    }
    return map;
  }, [mine, visible]);

  /**
   * "Your groups", in the order a person acts on them: an invitation is the
   * only door into a private group, so it sits at the top; closed
   * relationships sink to the bottom and are inert. Applications are NOT here
   * — they are not memberships, and they get their own list below.
   */
  const relationshipRows = useMemo(() => {
    const rank = (row: GroupWithMembership) => {
      const status = statusOf(row);
      if (status === 'invited') return 0;
      if (isClosed(status)) return 2;
      return 1;
    };
    return mine
      .filter((row) => statusOf(row) !== 'pending')
      .slice()
      .sort((a, b) => rank(a) - rank(b));
  }, [mine]);

  /** Applied, unapproved. A label on a waiting-room, never a way through. */
  const pendingRows = useMemo(
    () => mine.filter((row) => statusOf(row) === 'pending'),
    [mine],
  );

  /**
   * Groups pinned to an opportunity this user saved. Only rooms they are in or
   * could walk into: an invitation or an application has to read as itself, and
   * a bare rail card would strip that off.
   */
  const railRows = useMemo(() => {
    const out: GroupWithMembership[] = [];
    for (const row of rowsById.values()) {
      const status = statusOf(row);
      if (status !== null && status !== 'active') continue;
      const { opportunityId } = row.group;
      if (!opportunityId || !savedById.has(opportunityId)) continue;
      out.push(row);
    }
    return out;
  }, [rowsById, savedById]);

  const railIds = useMemo(
    () => new Set(railRows.map((row) => row.group.id)),
    [railRows],
  );

  const discoverRows = useMemo(
    () =>
      visible.filter((row) => {
        const { group } = row;
        if (mineIds.has(group.id) || railIds.has(group.id)) return false;
        if (group.archivedAt) return false;
        // A ban is terminal. Offering the room back as a discovery pill would
        // be the client re-opening a door moderation closed.
        return statusOf(row) !== 'banned';
      }),
    [visible, mineIds, railIds],
  );

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      // CommunityHeader owns the top inset on this landing screen. Applying
      // `top` here as well creates the large dead band below the header.
      edges={['left', 'right']}
    >
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
              {
                backgroundColor: `${colors.error}12`,
                borderColor: colors.error,
              },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.error }]}>
              {error}
            </Text>
            <Pressable
              testID="discussions-retry"
              accessibilityRole="button"
              accessibilityLabel={t('common:actions.retry')}
              onPress={handleRefresh}
              disabled={refreshing}
              style={({ pressed }) => [
                styles.retryButton,
                {
                  borderColor: colors.error,
                  opacity: pressed || refreshing ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.retryLabel, { color: colors.error }]}>
                {t('common:actions.retry')}
              </Text>
            </Pressable>
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
              {relationshipRows.length === 0 && pendingRows.length === 0 ? (
                <View testID="discussions-empty">
                  <StateView
                    state={{ kind: 'empty', reason: 'firstRun' }}
                    flow="community"
                    fill={false}
                    sceneSize={150}
                    title={t('community:empty.noGroups')}
                    body={t('community:empty.noGroupsBody', {
                      defaultValue:
                        'Join a group from an opportunity you saved, or start your own.',
                    })}
                    actionLabel={t('community:actions.createGroup')}
                    onAction={openCreate}
                  />
                </View>
              ) : relationshipRows.length > 0 ? (
                <View
                  testID="discussions-group-list"
                  style={[
                    styles.listSurface,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  {relationshipRows.map((row, index) => {
                    const status = statusOf(row);
                    return (
                      <GroupRow
                        key={row.group.id}
                        group={row.group}
                        membership={status}
                        // Unread is about a room you can read. An invitation has
                        // no history yet as far as the invitee is concerned.
                        unread={
                          status === 'active' && isUnread(row.group, lastRead)
                        }
                        // Removed or banned: still named, so the state is legible,
                        // but never a way back in.
                        disabled={isClosed(status)}
                        index={index}
                        variant="list"
                        isLast={index === relationshipRows.length - 1}
                        onPress={openGroup}
                      />
                    );
                  })}
                </View>
              ) : null}
            </View>

            {/* ── 1b. Applications: a separate list, on purpose ─────────
                A pending row in the same list as real memberships would read
                as one. It is its own heading, below them, and tapping it
                lands on the group's waiting state — the room stays shut. */}
            {pendingRows.length > 0 && (
              <View testID="discussions-pending" style={styles.section}>
                <Text
                  style={[styles.sectionTitle, { color: colors.textSecondary }]}
                >
                  {t('community:sections.awaitingApproval')}
                </Text>
                <View
                  style={[
                    styles.listSurface,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  {pendingRows.map((row, index) => (
                    <GroupRow
                      key={row.group.id}
                      group={row.group}
                      membership="pending"
                      index={index}
                      variant="list"
                      isLast={index === pendingRows.length - 1}
                      onPress={openGroup}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* ── 2. Saved-opportunity groups: horizontal rail ─────────── */}
            {railRows.length > 0 && (
              <View style={styles.section}>
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}
                >
                  {t('community:sections.forYourSavedOpportunities')}
                </Text>
                <ScrollView
                  testID="discussions-rail"
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rail}
                >
                  {railRows.map((row, index) => {
                    const { group } = row;
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
            {discoverRows.length > 0 && (
              <View style={styles.section}>
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}
                >
                  {t('community:sections.discover')}
                </Text>
                <View testID="discussions-discover" style={styles.pillWrap}>
                  {discoverRows.map(({ group }) => (
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
                          style={[
                            styles.pillLabel,
                            { color: colors.foreground },
                          ]}
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
      {relationshipRows.length > 0 || pendingRows.length > 0 ? (
        <AnimatedPressable
          testID="discussions-create"
          accessibilityRole="button"
          accessibilityLabel={t('community:actions.createGroup')}
          onPress={openCreate}
          hapticFeedback="medium"
          scaleTo={0.92}
          style={[
            styles.createFab,
            {
              bottom: insets.bottom + 72,
              backgroundColor: colors.accent,
            },
          ]}
        >
          <Plus size={25} color="#FFFFFF" strokeWidth={2.4} />
        </AnimatedPressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 20,
    // CommunityNavigation is taller than the global pill; keep the final
    // discovery row clear of it on both iOS and Android.
    paddingBottom: 132,
    gap: 20,
  },
  section: {
    gap: 12,
  },
  listSurface: {
    borderWidth: 1,
    borderRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
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
  createFab: {
    position: 'absolute',
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
});
