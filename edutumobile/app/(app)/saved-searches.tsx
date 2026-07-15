import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Bell,
  BellOff,
  BellRing,
  ChevronRight,
  Search,
  Tag,
  Trash2,
} from "lucide-react-native";
import { useAuth } from "@clerk/clerk-expo";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { BrandedLoader } from "../../components/ui/BrandedLoader";
import { useTheme } from "../../components/context/ThemeContext";
import {
  deleteSavedSearch,
  fetchSavedSearches,
  updateSavedSearch,
  type SavedSearch,
} from "@edutu/core/src/services/savedSearches";

export default function SavedSearchesScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { isDark, colors } = useTheme();

  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const textSecondary = isDark ? "#94A3B8" : "#64748B";

  const load = useCallback(async () => {
    const rows = await fetchSavedSearches(getToken);
    setSearches(rows);
  }, [getToken]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toggleNotify = useCallback(
    async (search: SavedSearch) => {
      const next = !search.notifyEnabled;
      setSearches((current) =>
        current.map((item) =>
          item.id === search.id ? { ...item, notifyEnabled: next } : item,
        ),
      );
      const updated = await updateSavedSearch(
        search.id,
        { notifyEnabled: next },
        getToken,
      );
      if (!updated) {
        // Revert on failure
        setSearches((current) =>
          current.map((item) =>
            item.id === search.id
              ? { ...item, notifyEnabled: search.notifyEnabled }
              : item,
          ),
        );
      }
    },
    [getToken],
  );

  const handleDelete = useCallback(
    (search: SavedSearch) => {
      Alert.alert(
        "Delete this alert?",
        `You'll stop getting notified about new matches for “${search.name}”.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              setSearches((current) =>
                current.filter((item) => item.id !== search.id),
              );
              const success = await deleteSavedSearch(search.id, getToken);
              if (!success) void load();
            },
          },
        ],
      );
    },
    [getToken, load],
  );

  const runSearch = useCallback(
    (search: SavedSearch) => {
      router.push({
        pathname: "/opportunities",
        params: {
          ...(search.query ? { q: search.query } : {}),
          ...(search.category ? { category: search.category } : {}),
        },
      } as never);
    },
    [router],
  );

  const renderItem = ({ item }: { item: SavedSearch }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => runSearch(item)}
      activeOpacity={0.75}
    >
      <View style={styles.cardTop}>
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: item.notifyEnabled
                ? `${colors.accent}15`
                : isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.04)",
            },
          ]}
        >
          {item.notifyEnabled ? (
            <BellRing size={18} color={colors.accent} />
          ) : (
            <BellOff size={18} color={textSecondary} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text style={{ color: textSecondary, fontSize: 12, marginTop: 2 }}>
            {item.matchCount > 0
              ? `${item.matchCount} match${item.matchCount === 1 ? "" : "es"} so far`
              : "No matches yet — we're watching"}
          </Text>
        </View>
        <ChevronRight size={18} color={textSecondary} />
      </View>

      <View style={styles.chipRow}>
        {item.query ? (
          <View style={[styles.chip, { backgroundColor: `${colors.accent}10` }]}>
            <Search size={11} color={colors.accent} />
            <Text style={[styles.chipText, { color: colors.accent }]} numberOfLines={1}>
              {item.query}
            </Text>
          </View>
        ) : null}
        {item.category ? (
          <View style={[styles.chip, { backgroundColor: `${colors.accent}10` }]}>
            <Tag size={11} color={colors.accent} />
            <Text style={[styles.chipText, { color: colors.accent }]}>
              {item.category}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
        <View style={styles.footerLeft}>
          <Text style={{ color: textSecondary, fontSize: 12.5, fontWeight: "600" }}>
            Notify me about new matches
          </Text>
          <Switch
            value={item.notifyEnabled}
            onValueChange={() => void toggleNotify(item)}
            trackColor={{ false: colors.border, true: `${colors.accent}80` }}
            thumbColor={item.notifyEnabled ? colors.accent : "#f4f3f4"}
          />
        </View>
        <TouchableOpacity
          onPress={() => handleDelete(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.deleteBtn}
        >
          <Trash2 size={15} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return <BrandedLoader label="Loading your alerts..." />;
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "left", "right"]}
    >
      <ScreenHeader
        title="Saved Searches & Alerts"
        subtitle="We watch the catalog so you don't have to"
        showBack
      />
      <FlatList
        data={searches}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: `${colors.accent}12` }]}>
              <Bell size={26} color={colors.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No alerts yet
            </Text>
            <Text style={[styles.emptyBody, { color: textSecondary }]}>
              Search or filter on Discover, then tap “Save this search” — we&apos;ll
              notify you the moment a new opportunity matches.
            </Text>
            <TouchableOpacity
              style={[styles.emptyCta, { backgroundColor: colors.accent }]}
              onPress={() => router.push("/opportunities" as never)}
              activeOpacity={0.85}
            >
              <Search size={16} color="#FFFFFF" />
              <Text style={styles.emptyCtaText}>Explore opportunities</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 48, flexGrow: 1 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    maxWidth: 220,
  },
  chipText: { fontSize: 12, fontWeight: "600" },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 10,
  },
  footerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.1)",
  },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: "800" },
  emptyBody: { fontSize: 13.5, lineHeight: 20, textAlign: "center", marginTop: 6 },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 13,
    marginTop: 18,
  },
  emptyCtaText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});
