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
import { useAuth } from '@clerk/clerk-expo';
import { Plus } from 'lucide-react-native';
import {
  fetchGroups,
  isCommunityApiError,
  type CommunityGroup,
  type GroupWithMembership,
  type MembershipStatus,
} from '@edutu/core/src/services/communities';
import { StateView } from '../../../components/state';
import { Skeleton } from '../../../components/ui/Skeleton';
import { AnimatedPressable } from '../../../components/ui/AnimatedPressable';
import { useTheme } from '../../../components/context/ThemeContext';
import { GroupRow } from '../../../components/community/GroupRow';
import { useCommunityUnreadCounts } from '../../../hooks/useCommunityUnreadCounts';

/**
 * Group Discussions — browse.
 *
 * This screen is intentionally narrow: it is the member's room list. Public
 * discovery belongs to Explore, so a group can never appear here merely
 * because it is public or attached to a saved opportunity.
 */

/** `null` when the caller has no row on this group at all. */
function statusOf(row: GroupWithMembership): MembershipStatus | null {
  return row.membership?.status ?? null;
}

export default function DiscussionsBrowseScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const { t } = useTranslation(['community', 'common']);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mineAvailable, setMineAvailable] = useState(false);
  // `{ group, membership }` rows, not bare groups. The API returns live
  // relationships, and the screen keeps only active memberships below.
  const [mine, setMine] = useState<GroupWithMembership[]>([]);
  const { groupUnreadCounts } = useCommunityUnreadCounts(userId, getToken);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const initialLoadFinishedRef = useRef(false);
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const tokenProvider = getTokenRef.current;

    const [mineResult] = await Promise.allSettled([
      fetchGroups({ mine: true, limit: 50 }, tokenProvider),
    ]);

    if (!mountedRef.current || requestId !== requestIdRef.current) return;

    if (mineResult.status === 'fulfilled') {
      setMine(mineResult.value);
      setMineAvailable(true);
      setError(null);
    } else {
      const caught = mineResult.reason;
      // The server writes these sentences for the member to read and act on
      // ("You're already in 2 groups…"). Showing a status code instead throws
      // that away — see the header of services/communities.ts.
      setError(
        isCommunityApiError(caught)
          ? caught.message
          : t('common:errors.generic'),
      );
    }
  }, [t]);

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

  /** Only active memberships belong in Groups. Invitations and applications
   * remain actionable elsewhere in the community flow, but are not rooms the
   * member is currently in. */
  const relationshipRows = useMemo(() => {
    return mine.filter((row) => statusOf(row) === 'active');
  }, [mine]);

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
              {mineAvailable && relationshipRows.length === 0 ? (
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
                        unreadCount={groupUnreadCounts[row.group.id] ?? 0}
                        unread={(groupUnreadCounts[row.group.id] ?? 0) > 0}
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

          </>
        )}
      </ScrollView>
      {relationshipRows.length > 0 ? (
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
