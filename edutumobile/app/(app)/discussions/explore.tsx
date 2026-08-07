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
import { useAuth } from '@clerk/clerk-expo';
import { Flame, Star, Users } from 'lucide-react-native';
import {
  fetchGroups,
  type GroupWithMembership,
} from '@edutu/core/src/services/communities';
import { fetchCommunityStories } from '@edutu/core/src/services/community';
import type { CommunityStory } from '@edutu/core/src/types/community';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../components/context/ThemeContext';
import { StateView } from '../../../components/state';
import { GroupRow } from '../../../components/community/GroupRow';
import { Skeleton } from '../../../components/ui/Skeleton';

export default function CommunityExploreScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { colors } = useTheme();
  const [rows, setRows] = useState<GroupWithMembership[]>([]);
  const [stories, setStories] = useState<CommunityStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    const [groupResult, storyResult] = await Promise.allSettled([
      fetchGroups({ limit: 50 }, getToken),
      fetchCommunityStories(supabase, { limit: 12, orderBy: 'featuredRank' }),
    ]);
    if (groupResult.status === 'fulfilled')
      setRows(groupResult.value.filter((row) => !row.group.archivedAt));
    if (storyResult.status === 'fulfilled') setStories(storyResult.value);
    setLoadError(
      groupResult.status === 'rejected' && storyResult.status === 'rejected',
    );
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  const trending = useMemo(
    () =>
      rows
        .slice()
        .sort(
          (a, b) =>
            b.group.messageCount - a.group.messageCount ||
            b.group.memberCount - a.group.memberCount,
        )
        .slice(0, 4),
    [rows],
  );
  const featured = useMemo(
    () => stories.filter((story) => story.featured).slice(0, 4),
    [stories],
  );
  const people = useMemo(() => {
    const seen = new Set<string>();
    return stories
      .filter((story) => {
        const name = story.creator.name.trim();
        if (!name || seen.has(name)) return false;
        seen.add(name);
        return true;
      })
      .slice(0, 4);
  }, [stories]);
  const hasContent =
    trending.length > 0 || featured.length > 0 || people.length > 0;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const openGroup = useCallback(
    (groupId: string) => router.push(`/discussions/${groupId}` as never),
    [router],
  );

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={['left', 'right']}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.accent}
          />
        }
      >
        {loading ? (
          <View style={styles.skeletons}>
            <Skeleton height={88} borderRadius={18} />
            <Skeleton height={88} borderRadius={18} />
          </View>
        ) : loadError ? (
          <StateView
            state={{ kind: 'error', cause: 'network' }}
            flow="community"
            fill={false}
            sceneSize={190}
            style={styles.largeState}
            onRetry={() => void refresh()}
          />
        ) : !hasContent ? (
          <StateView
            state={{ kind: 'empty', reason: 'firstRun' }}
            flow="community"
            fill={false}
            sceneSize={200}
            style={styles.largeState}
            title="Nothing to explore yet"
            body="Active groups, featured posts, and people to meet will appear here as the community grows."
            actionLabel="Check again"
            onAction={() => void refresh()}
          />
        ) : (
          <>
            <SectionHeading
              icon={Flame}
              title="Trending communities"
              color={colors.accent}
              textColor={colors.foreground}
            />
            <View
              style={[
                styles.groupList,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {trending.length ? (
                trending.map((row, index) => (
                  <GroupRow
                    key={row.group.id}
                    group={row.group}
                    membership={row.membership?.status ?? null}
                    index={index}
                    variant="list"
                    isLast={index === trending.length - 1}
                    onPress={(group) => openGroup(group.id)}
                  />
                ))
              ) : (
                <EmptyLine
                  text="Trending groups will appear here as people start conversations."
                  color={colors.textSecondary}
                />
              )}
            </View>

            <SectionHeading
              icon={Star}
              title="Featured from the community"
              color={colors.warning}
              textColor={colors.foreground}
            />
            <View style={styles.featureList}>
              {featured.length ? (
                featured.map((story) => (
                  <FeaturedStory key={story.id} story={story} colors={colors} />
                ))
              ) : (
                <EmptyLine
                  text="Featured roadmaps and resources are coming soon."
                  color={colors.textSecondary}
                />
              )}
            </View>

            <SectionHeading
              icon={Users}
              title="People to meet"
              color={colors.success}
              textColor={colors.foreground}
            />
            <View style={styles.peopleList}>
              {people.length ? (
                people.map((person) => (
                  <PersonRow
                    key={person.creator.name}
                    name={person.creator.name}
                    title={person.creator.title}
                    colors={colors}
                  />
                ))
              ) : (
                <EmptyLine
                  text="People you can follow will appear as community profiles grow."
                  color={colors.textSecondary}
                />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  color,
  textColor,
}: {
  icon: React.ComponentType<{ size: number; color: string }>;
  title: string;
  color: string;
  textColor: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={[styles.sectionIcon, { backgroundColor: `${color}18` }]}>
        <Icon size={18} color={color} />
      </View>
      <Text style={[styles.sectionTitle, { color: textColor }]}>{title}</Text>
    </View>
  );
}

type ExploreColors = ReturnType<typeof useTheme>['colors'];

function FeaturedStory({
  story,
  colors,
}: {
  story: CommunityStory;
  colors: ExploreColors;
}) {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${story.title}, by ${story.creator.name}`}
      style={[
        styles.featuredStory,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.storyCopy}>
        <Text style={[styles.storyCategory, { color: colors.accent }]}>
          {story.category}
        </Text>
        <Text
          style={[styles.storyTitle, { color: colors.foreground }]}
          numberOfLines={2}
        >
          {story.title}
        </Text>
        <Text
          style={[styles.storyMeta, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {story.creator.name} · {story.stats.likes ?? 0} likes
        </Text>
      </View>
    </View>
  );
}

function PersonRow({
  name,
  title,
  colors,
}: {
  name: string;
  title?: string;
  colors: ExploreColors;
}) {
  return (
    <View
      style={[
        styles.personRow,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: `${colors.accent}22` }]}>
        <Text style={[styles.avatarText, { color: colors.accent }]}>
          {name.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={styles.personCopy}>
        <Text
          style={[styles.personName, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text
          style={[styles.personTitle, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {title || 'Community member'}
        </Text>
      </View>
      <View
        accessibilityRole="text"
        accessibilityLabel={`Following ${name} will be available soon`}
        style={[
          styles.followButton,
          { borderColor: colors.border, opacity: 0.55 },
        ]}
      >
        <Text style={[styles.followText, { color: colors.textSecondary }]}>
          Soon
        </Text>
      </View>
    </View>
  );
}

function EmptyLine({ text, color }: { text: string; color: string }) {
  return <Text style={[styles.emptyLine, { color }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 132, gap: 16 },
  largeState: { minHeight: 470 },
  skeletons: { gap: 10 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { flex: 1, fontSize: 18, lineHeight: 23, fontWeight: '700' },
  groupList: {
    borderWidth: 1,
    borderRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  featureList: { gap: 9 },
  featuredStory: {
    borderWidth: 1,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  storyCopy: { flex: 1, gap: 5 },
  storyCategory: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  storyTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  storyMeta: { fontSize: 12 },
  peopleList: { gap: 9 },
  personRow: {
    borderWidth: 1,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 17, fontWeight: '800' },
  personCopy: { flex: 1, gap: 2 },
  personName: { fontSize: 14, fontWeight: '800' },
  personTitle: { fontSize: 12 },
  followButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  followText: { fontSize: 12, fontWeight: '800' },
  emptyLine: { fontSize: 13, lineHeight: 19, padding: 16 },
});
