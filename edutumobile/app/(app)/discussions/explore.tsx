import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { BriefcaseBusiness, BookOpen, GraduationCap, Search } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useTranslation } from "react-i18next";
import {
  fetchGroups,
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

const FILTERS: Array<{
  id: FocusFilter;
  label: string;
  icon: typeof GraduationCap;
}> = [
  { id: "all", label: "All", icon: Search },
  { id: "scholarships", label: "Scholarships", icon: GraduationCap },
  { id: "careers", label: "Careers", icon: BriefcaseBusiness },
  { id: "study", label: "Study help", icon: BookOpen },
];

export default function CommunityExploreScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { t } = useTranslation("community");
  const { colors, isDark } = useTheme();
  const [rows, setRows] = useState<GroupWithMembership[]>([]);
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
    border: isDark ? colors.border : "#F7D9C3",
    accent: isDark ? colors.accent : "#F45B16",
    muted: isDark ? colors.muted : "#FCEAD5",
    textSecondary: isDark ? colors.textSecondary : "#796F6B",
  };

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [result, mobileControl] = await Promise.all([
        fetchGroups({ limit: 50 }, getToken),
        fetchMobileControlConfig().catch(() => null),
      ]);
      setRows(result.filter((row) => !row.group.archivedAt));
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

  const filteredRows = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter(({ group }) => {
      const searchable = `${group.name} ${group.description || ""}`.toLowerCase();
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
      const matchesFocus =
        focus === "all" ||
        (focus === "scholarships" && /scholar|funding|fellowship|erasmus/i.test(searchable)) ||
        (focus === "careers" && /career|job|intern|leadership/i.test(searchable)) ||
        (focus === "study" && /study|application|sop|review|stem/i.test(searchable));
      return matchesQuery && matchesFocus;
    });
  }, [focus, query, rows]);

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.accent}
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
            <Search size={20} color={palette.textSecondary} strokeWidth={2.2} />
            <TextInput
              testID="community-search"
              value={query}
              onChangeText={setQuery}
              placeholder="Search communities"
              placeholderTextColor={palette.textSecondary}
              style={[styles.searchInput, { color: palette.foreground }]}
              returnKeyType="search"
              accessibilityLabel="Search communities"
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTERS.map(({ id, label, icon: Icon }) => {
              const active = focus === id;
              return (
                <TouchableOpacity
                  key={id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                  onPress={() => setFocus(id)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: active ? palette.accent : palette.card,
                      borderColor: active ? palette.accent : palette.border,
                    },
                  ]}
                >
                  <Icon
                    size={16}
                    color={active ? "#FFFFFF" : palette.foreground}
                    strokeWidth={2.2}
                  />
                  <Text
                    style={[
                      styles.filterLabel,
                      { color: active ? "#FFFFFF" : palette.foreground },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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
        ) : rows.length === 0 ? (
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
          <CommunityDiscoveryShuffle
            rows={filteredRows}
            heroCampaigns={heroCampaigns}
            onPress={(group) => router.push(`/discussions/${group.id}` as never)}
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
  content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 132 },
  searchBlock: { gap: 12, marginBottom: 12 },
  searchField: {
    minHeight: 52,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  filterRow: { gap: 9, paddingRight: 4 },
  filterChip: {
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  filterLabel: { fontSize: 13, fontWeight: "700" },
  skeletons: { gap: 12 },
  // Keep the empty state compact on short phones. A fixed 450dp minimum made
  // the illustration and copy center in a very tall block, pushing the CTA
  // toward the tab bar and leaving the page looking broken.
  largeState: {
    paddingVertical: 24,
  },
});
