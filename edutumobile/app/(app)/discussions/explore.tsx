import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useTranslation } from "react-i18next";
import { ChevronRight, LockKeyhole, Users } from "lucide-react-native";
import {
  fetchGroups,
  type CommunityGroup,
  type GroupWithMembership,
} from "@edutu/core/src/services/communities";
import {
  useTheme,
  type ThemeColors,
} from "../../../components/context/ThemeContext";
import { StateView } from "../../../components/state";
import { GroupAvatar } from "../../../components/community/GroupAvatar";
import { Skeleton } from "../../../components/ui/Skeleton";
import { AnimatedPressable } from "../../../components/ui/AnimatedPressable";

const PREVIEW_COUNT = 3;

export default function CommunityExploreScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { t, i18n } = useTranslation("community");
  const { colors } = useTheme();
  const [rows, setRows] = useState<GroupWithMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const result = await fetchGroups({ limit: 50 }, getToken);
      setRows(result.filter((row) => !row.group.archivedAt));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
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

  const ranked = useMemo(
    () =>
      rows
        .slice()
        .sort(
          (a, b) =>
            b.group.messageCount - a.group.messageCount ||
            b.group.memberCount - a.group.memberCount ||
            b.group.createdAt.localeCompare(a.group.createdAt),
        ),
    [rows],
  );
  const visibleRows = showAll ? ranked : ranked.slice(0, PREVIEW_COUNT);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={["left", "right"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.intro}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {t("discovery.title")}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t("discovery.subtitle")}
          </Text>
        </View>

        {loading ? (
          <View style={styles.skeletons}>
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} height={112} borderRadius={18} />
            ))}
          </View>
        ) : loadError ? (
          <StateView
            state={{ kind: "error", cause: "network" }}
            flow="community"
            fill={false}
            sceneSize={170}
            style={styles.largeState}
            onRetry={() => void refresh()}
          />
        ) : ranked.length === 0 ? (
          <StateView
            state={{ kind: "empty", reason: "firstRun" }}
            flow="community"
            fill={false}
            sceneSize={180}
            style={styles.largeState}
            title={t("discovery.emptyTitle")}
            body={t("discovery.emptyBody")}
            actionLabel={t("discovery.checkAgain")}
            onAction={() => void refresh()}
          />
        ) : (
          <View>
            {visibleRows.map((row, index) => (
              <ExploreGroupRow
                key={row.group.id}
                group={row.group}
                colors={colors}
                memberLabel={t("discovery.memberCount", {
                  count: row.group.memberCount,
                  formatted: formatMemberCount(
                    row.group.memberCount,
                    i18n.resolvedLanguage ?? i18n.language,
                  ),
                })}
                fallbackDescription={t("discovery.fallbackDescription")}
                last={
                  index === visibleRows.length - 1 &&
                  (showAll || ranked.length <= PREVIEW_COUNT)
                }
                onPress={() =>
                  router.push(`/discussions/${row.group.id}` as never)
                }
              />
            ))}
            {ranked.length > PREVIEW_COUNT ? (
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={
                  showAll
                    ? t("discovery.showLessA11y")
                    : t("discovery.showMoreA11y")
                }
                onPress={() => setShowAll((current) => !current)}
                style={[styles.showMore, { borderTopColor: colors.border }]}
              >
                <View style={styles.showMoreContent}>
                  <Users size={19} color={colors.accent} />
                  <Text
                    style={[styles.showMoreText, { color: colors.accent }]}
                  >
                    {showAll
                      ? t("discovery.showLess")
                      : t("discovery.showMore")}
                  </Text>
                  <ChevronRight
                    size={18}
                    color={colors.accent}
                    style={showAll ? styles.chevronUp : undefined}
                  />
                </View>
              </AnimatedPressable>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ExploreGroupRow({
  group,
  colors,
  memberLabel,
  fallbackDescription,
  last,
  onPress,
}: {
  group: CommunityGroup;
  colors: ThemeColors;
  memberLabel: string;
  fallbackDescription: string;
  last: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${group.name}, ${memberLabel}`}
      onPress={onPress}
      hapticFeedback="selection"
      scaleTo={0.985}
      style={[
        styles.groupRow,
        !last && {
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View testID={`community-row-${group.id}`} style={styles.groupRowContent}>
        <GroupAvatar
          resourceUrl={group.coverImageResourceUrl}
          emoji={group.coverEmoji}
          size={82}
          radius={22}
        />
        <View style={styles.groupCopy}>
          <View style={styles.groupTitleRow}>
            <Text
              style={[styles.groupTitle, { color: colors.foreground }]}
              numberOfLines={2}
            >
              {group.name}
            </Text>
            {group.visibility === "private" ? (
              <LockKeyhole size={13} color={colors.textSecondary} />
            ) : null}
          </View>
          <Text
            style={[styles.groupPurpose, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {group.description || fallbackDescription}
          </Text>
          <View style={styles.memberLine}>
            <View
              style={[
                styles.memberIndicator,
                { backgroundColor: `${colors.accent}16` },
              ]}
            >
              <Users size={14} color={colors.accent} />
            </View>
            <Text
              style={[styles.memberCount, { color: colors.textSecondary }]}
            >
              {memberLabel}
            </Text>
          </View>
        </View>
        <ChevronRight size={20} color={colors.accent} />
      </View>
    </AnimatedPressable>
  );
}

function formatMemberCount(count: number, language: string): string {
  try {
    return new Intl.NumberFormat(language, {
      notation: count >= 1000 ? "compact" : "standard",
      maximumFractionDigits: 1,
    }).format(count);
  } catch {
    return String(count);
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 132 },
  intro: { marginBottom: 14 },
  title: {
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  subtitle: { marginTop: 5, maxWidth: 330, fontSize: 13, lineHeight: 19 },
  skeletons: { gap: 12 },
  // Keep the empty state compact on short phones. A fixed 450dp minimum made
  // the illustration and copy center in a very tall block, pushing the CTA
  // toward the tab bar and leaving the page looking broken.
  largeState: {
    paddingVertical: 24,
  },
  groupRow: {
    minHeight: 126,
    paddingVertical: 16,
  },
  groupRowContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  groupCopy: { flex: 1, minWidth: 0 },
  groupTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  groupTitle: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  groupPurpose: { marginTop: 5, fontSize: 12, lineHeight: 17 },
  memberLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 11,
  },
  memberIndicator: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  memberCount: { fontSize: 12, fontWeight: "700" },
  showMore: {
    minHeight: 58,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  showMoreContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  showMoreText: { flex: 1, fontSize: 15, fontWeight: "800" },
  chevronUp: { transform: [{ rotate: "-90deg" }] },
});
