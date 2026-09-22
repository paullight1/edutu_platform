import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Search, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useTranslation } from "react-i18next";
import {
  fetchCommunityDiscovery,
  type CommunityDiscoveryResponse,
  type GroupWithMembership,
} from "@edutu/core/src/services/communities";
import { useTheme } from "../../../components/context/ThemeContext";
import { StateView } from "../../../components/state";
import { CommunityDiscoveryShuffle } from "../../../components/community/CommunityDiscoveryShuffle";
import { Skeleton } from "../../../components/ui/Skeleton";
import {
  fetchMobileControlConfig,
  recordCampaignEvent,
  selectCampaigns,
  type MobileCampaign,
} from "../../../lib/mobileControl";

type FocusFilter = "all" | "scholarships" | "careers" | "study";

const FILTERS: Array<{ id: FocusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "scholarships", label: "Scholarships" },
  { id: "careers", label: "Careers" },
  { id: "study", label: "Study help" },
];

const EMPTY_DISCOVERY: CommunityDiscoveryResponse = {
  trending: [],
  communities: [],
};

function matchesDiscoveryFilters(
  row: GroupWithMembership,
  query: string,
  focus: FocusFilter,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  const searchable = `${row.group.name} ${row.group.description ?? ""}`.toLowerCase();
  const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
  const matchesFocus =
    focus === "all" ||
    (focus === "scholarships" &&
      /scholar|funding|fellowship|erasmus/i.test(searchable)) ||
    (focus === "careers" &&
      /career|job|intern|leadership|work/i.test(searchable)) ||
    (focus === "study" &&
      /study|application|sop|essay|review|stem|ielts/i.test(searchable));
  return matchesQuery && matchesFocus;
}

export default function CommunityExploreScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { t } = useTranslation("community");
  const { colors, isDark } = useTheme();
  const [discovery, setDiscovery] = useState<CommunityDiscoveryResponse>(EMPTY_DISCOVERY);
  const [heroCampaigns, setHeroCampaigns] = useState<MobileCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<FocusFilter>("all");

  const palette = {
    background: isDark ? colors.background : "#FFF9F1",
    foreground: isDark ? colors.foreground : "#4A170D",
    card: isDark ? colors.card : "#FFFFFF",
    border: isDark ? colors.border : "#F2DCCB",
    accent: isDark ? colors.accent : "#F45B16",
    muted: isDark ? colors.muted : "#FCEAD5",
    textSecondary: isDark ? colors.textSecondary : "#796F6B",
  };

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [result, mobileControl] = await Promise.all([
        fetchCommunityDiscovery(getToken, 50),
        fetchMobileControlConfig().catch(() => null),
      ]);
      setDiscovery({
        trending: result.trending.filter(({ group }) => !group.archivedAt),
        communities: result.communities.filter(({ group }) => !group.archivedAt),
      });
      setHeroCampaigns(
        mobileControl
          ? selectCampaigns(mobileControl.campaigns, "community").filter(
              (campaign) =>
                campaign.placement === "community" &&
                campaign.campaign_type === "banner",
            )
          : [],
      );
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

  const trending = useMemo(
    () =>
      discovery.trending.filter((row) =>
        matchesDiscoveryFilters(row, query, focus),
      ),
    [discovery.trending, focus, query],
  );
  const moreCommunities = useMemo(
    () =>
      discovery.communities.filter((row) =>
        matchesDiscoveryFilters(row, query, focus),
      ),
    [discovery.communities, focus, query],
  );
  const totalRows = discovery.trending.length + discovery.communities.length;
  const visibleCount = trending.length + moreCommunities.length;

  const showAll = useCallback(() => {
    setQuery("");
    setFocus("all");
  }, []);

  const openCampaign = useCallback(
    (campaign: MobileCampaign) => {
      void getToken()
        .then((token) => recordCampaignEvent(campaign.id, "click", token))
        .catch(() => undefined);
      const route = campaign.creative?.ctaRoute;
      if (typeof route === "string" && route.startsWith("/")) {
        router.push(route as never);
      }
    },
    [getToken, router],
  );

  const trackHeroImpression = useCallback(
    (campaign: MobileCampaign) => {
      void getToken()
        .then((token) => recordCampaignEvent(campaign.id, "impression", token))
        .catch(() => undefined);
    },
    [getToken],
  );

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
      style={[styles.screen, { backgroundColor: palette.background }]}
      edges={["left", "right"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={palette.accent}
            colors={[palette.accent]}
          />
        }
      >
        <View style={styles.searchBlock}>
          <View
            style={[
              styles.searchField,
              { backgroundColor: palette.card, borderColor: palette.border },
            ]}
          >
            <Search size={21} color={palette.textSecondary} strokeWidth={2.1} />
            <TextInput
              testID="community-search"
              value={query}
              onChangeText={setQuery}
              placeholder="Search communities"
              placeholderTextColor={palette.textSecondary}
              style={[styles.searchInput, { color: palette.foreground }]}
              returnKeyType="search"
              accessibilityLabel="Search communities"
              clearButtonMode="while-editing"
            />
            {!!query && (
              <TouchableOpacity
                testID="community-search-clear"
                accessibilityRole="button"
                accessibilityLabel="Clear community search"
                onPress={() => setQuery("")}
                hitSlop={10}
                style={styles.clearSearch}
              >
                <X size={17} color={palette.textSecondary} strokeWidth={2.3} />
              </TouchableOpacity>
            )}
          </View>

          <View
            accessibilityRole="tablist"
            accessibilityLabel="Community focus"
            style={[styles.filterTabs, { borderColor: palette.border }]}
          >
            {FILTERS.map(({ id, label }) => {
              const active = focus === id;
              return (
                <TouchableOpacity
                  key={id}
                  testID={`community-focus-${id}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                  onPress={() => setFocus(id)}
                  activeOpacity={0.72}
                  style={styles.filterTab}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.86}
                    style={[
                      styles.filterLabel,
                      { color: active ? palette.foreground : palette.textSecondary },
                    ]}
                  >
                    {label}
                  </Text>
                  {active ? (
                    <View
                      style={[styles.filterIndicator, { backgroundColor: palette.accent }]}
                    />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {loading ? (
          <View accessibilityLabel="Loading communities" style={styles.skeletons}>
            <Skeleton height={232} borderRadius={22} />
            <View style={styles.skeletonHeading}>
              <Skeleton width={120} height={24} borderRadius={8} />
            </View>
            <View style={styles.skeletonRail}>
              <Skeleton width={246} height={242} borderRadius={18} />
              <Skeleton width={86} height={242} borderRadius={18} />
            </View>
          </View>
        ) : loadError && totalRows === 0 ? (
          <StateView
            state={{ kind: "error", cause: "network" }}
            flow="community"
            fill={false}
            sceneSize={170}
            style={styles.largeState}
            onRetry={() => void refresh()}
          />
        ) : totalRows === 0 ? (
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
        ) : visibleCount === 0 ? (
          <View style={[styles.noMatch, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.noMatchTitle, { color: palette.foreground }]}>
              {t("discovery.noMatchTitle")}
            </Text>
            <Text style={[styles.noMatchBody, { color: palette.textSecondary }]}>
              {t("discovery.noMatchBody")}
            </Text>
            <TouchableOpacity
              testID="community-explore-show-all"
              accessibilityRole="button"
              onPress={showAll}
              style={[styles.showAllButton, { backgroundColor: palette.accent }]}
            >
              <Text style={styles.showAllLabel}>{t("discovery.showAll")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CommunityDiscoveryShuffle
            trendingRows={trending}
            communityRows={moreCommunities}
            heroCampaigns={heroCampaigns}
            onPress={(group) => router.push(`/discussions/${group.id}` as never)}
            onBrowse={() => router.push("/discussions" as never)}
            onSeeAll={() => router.push("/discussions" as never)}
            onHeroPress={openCampaign}
            onHeroImpression={trackHeroImpression}
            testID="community-explore-discover"
            legacyRowTestID={(group) => `community-row-${group.id}`}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 132 },
  searchBlock: { gap: 10, marginBottom: 16 },
  searchField: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  clearSearch: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  filterTabs: {
    height: 46,
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterTab: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  filterLabel: { fontSize: 12, fontWeight: "700" },
  filterIndicator: {
    position: "absolute",
    bottom: -1,
    left: 8,
    right: 8,
    height: 3,
    borderRadius: 2,
  },
  skeletons: { gap: 14 },
  skeletonHeading: { marginTop: 6 },
  skeletonRail: { flexDirection: "row", gap: 12, overflow: "hidden" },
  largeState: { paddingVertical: 24 },
  noMatch: {
    marginTop: 20,
    paddingHorizontal: 22,
    paddingVertical: 30,
    borderWidth: 1,
    borderRadius: 22,
    alignItems: "center",
  },
  noMatchTitle: { fontSize: 20, lineHeight: 25, fontWeight: "800", textAlign: "center" },
  noMatchBody: { marginTop: 8, fontSize: 14, lineHeight: 21, textAlign: "center" },
  showAllButton: { marginTop: 18, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 12 },
  showAllLabel: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
});
