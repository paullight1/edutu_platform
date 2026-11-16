import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { BellRing, Compass, Plus, Settings, TriangleAlert } from "lucide-react-native";
import { useAuth } from "@clerk/clerk-expo";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { BrandedLoader } from "../../components/ui/BrandedLoader";
import { AnimatedPressable } from "../../components/ui/AnimatedPressable";
import { useTheme } from "../../components/context/ThemeContext";
import { AlertComposer } from "../../components/savedSearches/AlertComposer";
import { SavedSearchCard } from "../../components/savedSearches/SavedSearchCard";
import { notificationService } from "../../lib/notifications";
import { haptics } from "../../lib/haptics";
import {
  createSavedSearch,
  deleteSavedSearch,
  fetchSavedSearchMatches,
  fetchSavedSearches,
  updateSavedSearch,
  type SavedSearch,
  type SavedSearchCriteria,
  type SavedSearchMatchPreview,
} from "@edutu/core/src/services/savedSearches";

// Mirrors MAX_SAVED_SEARCHES_PER_USER in the backend service. requestProductApi
// collapses every non-ok response to null, so the server's "delete one first"
// message never reaches us — we have to say it ourselves.
const MAX_ALERTS = 20;

type ComposerState =
  | { mode: "create" }
  | { mode: "edit"; search: SavedSearch }
  | null;

type PreviewState = {
  matches: SavedSearchMatchPreview[] | null;
  loading: boolean;
  failed: boolean;
};

export default function SavedSearchesScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { isDark, colors } = useTheme();
  const { t } = useTranslation("opps");

  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [composer, setComposer] = useState<ComposerState>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const [pushEnabled, setPushEnabled] = useState(true);

  const textSecondary = isDark ? "#94A3B8" : "#64748B";

  const load = useCallback(async () => {
    const rows = await fetchSavedSearches(getToken);
    setSearches(rows);
  }, [getToken]);

  useEffect(() => {
    // Inline loader: the linter flags setState reached through a callback the
    // effect invokes (set-state-in-effect), but an effect-local async fn whose
    // sets all happen after the await is the sanctioned shape.
    const run = async () => {
      try {
        const [rows, settings] = await Promise.all([
          fetchSavedSearches(getToken),
          notificationService.loadSettings(),
        ]);
        setSearches(rows);
        // An alert can only ever reach the user through push, so a global
        // push-off makes every alert on this screen a no-op. Say so.
        setPushEnabled(settings.pushEnabled);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [getToken]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setPreviews({});
    setRefreshing(false);
  }, [load]);

  // ─── Create / edit ────────────────────────────────────────────────────────

  const openCreate = useCallback(() => {
    if (searches.length >= MAX_ALERTS) {
      Alert.alert(
        t("alerts.composer.failedTitle"),
        t("alerts.composer.limitReached", { max: MAX_ALERTS }),
      );
      return;
    }
    setComposer({ mode: "create" });
  }, [searches.length, t]);

  const handleSubmit = useCallback(
    async (criteria: SavedSearchCriteria) => {
      const editing = composer?.mode === "edit" ? composer.search : null;
      setSaving(true);
      try {
        const saved = editing
          ? await updateSavedSearch(editing.id, criteria, getToken)
          : await createSavedSearch(
              { ...criteria, notifyEnabled: true },
              getToken,
            );
        if (!saved) {
          haptics.error();
          Alert.alert(
            t("alerts.composer.failedTitle"),
            searches.length >= MAX_ALERTS && !editing
              ? t("alerts.composer.limitReached", { max: MAX_ALERTS })
              : t("alerts.composer.failedBody"),
          );
          return;
        }
        haptics.success();
        setSearches((current) =>
          editing
            ? current.map((item) => (item.id === saved.id ? saved : item))
            : [saved, ...current],
        );
        // Criteria changed — any cached preview for it is now wrong.
        setPreviews((current) => {
          const next = { ...current };
          delete next[saved.id];
          return next;
        });
        setComposer(null);
      } finally {
        setSaving(false);
      }
    },
    [composer, getToken, searches.length, t],
  );

  // ─── Row actions ──────────────────────────────────────────────────────────

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
        // Revert *and* say so — a silent revert reads as "it saved".
        setSearches((current) =>
          current.map((item) =>
            item.id === search.id
              ? { ...item, notifyEnabled: search.notifyEnabled }
              : item,
          ),
        );
        Alert.alert(t("alerts.composer.failedTitle"), t("alerts.toggleFailed"));
      }
    },
    [getToken, t],
  );

  const handleDelete = useCallback(
    (search: SavedSearch) => {
      Alert.alert(
        t("alerts.deleteTitle"),
        t("alerts.deleteBody", { name: search.name }),
        [
          { text: t("alerts.composer.cancel"), style: "cancel" },
          {
            text: t("alerts.delete"),
            style: "destructive",
            onPress: async () => {
              setSearches((current) =>
                current.filter((item) => item.id !== search.id),
              );
              const success = await deleteSavedSearch(search.id, getToken);
              if (!success) {
                Alert.alert(
                  t("alerts.composer.failedTitle"),
                  t("alerts.deleteFailed"),
                );
                void load();
              }
            },
          },
        ],
      );
    },
    [getToken, load, t],
  );

  /**
   * Expanding runs the alert server-side (`/saved-searches/:id/matches`), which
   * honours every criterion. Cached per id until refresh so re-collapsing and
   * re-opening doesn't re-hit the API.
   */
  const toggleExpand = useCallback(
    async (search: SavedSearch) => {
      if (expandedId === search.id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(search.id);
      if (previews[search.id]?.matches) return;
      setPreviews((current) => ({
        ...current,
        [search.id]: { matches: null, loading: true, failed: false },
      }));
      const result = await fetchSavedSearchMatches(search.id, getToken);
      setPreviews((current) => ({
        ...current,
        [search.id]: {
          matches: result?.matches ?? null,
          loading: false,
          failed: !result,
        },
      }));
    },
    [expandedId, previews, getToken],
  );

  const openMatch = useCallback(
    (match: SavedSearchMatchPreview) => {
      router.push(`/opportunities/${match.id}` as never);
    },
    [router],
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  const pausedCount = useMemo(
    () => searches.filter((item) => !item.notifyEnabled).length,
    [searches],
  );

  const renderItem = useCallback(
    ({ item }: { item: SavedSearch }) => {
      const preview = previews[item.id];
      return (
        <SavedSearchCard
          search={item}
          expanded={expandedId === item.id}
          matches={preview?.matches ?? null}
          matchesLoading={Boolean(preview?.loading)}
          matchesFailed={Boolean(preview?.failed)}
          onToggleExpand={(search) => void toggleExpand(search)}
          onToggleNotify={(search) => void toggleNotify(search)}
          onEdit={(search) => setComposer({ mode: "edit", search })}
          onDelete={handleDelete}
          onOpenMatch={openMatch}
        />
      );
    },
    [previews, expandedId, toggleExpand, toggleNotify, handleDelete, openMatch],
  );

  const pushWarning = !pushEnabled ? (
    <AnimatedPressable
      onPress={() => router.push("/profile/settings" as never)}
      accessibilityRole="button"
      style={[styles.warning, { backgroundColor: "rgba(245,158,11,0.12)" }]}
    >
      <View style={styles.warningInner}>
        <TriangleAlert size={16} color="#F59E0B" />
        <Text style={[styles.warningText, { color: colors.foreground }]}>
          {t("alerts.pushOff")}
        </Text>
      </View>
    </AnimatedPressable>
  ) : null;

  if (loading) {
    // BrandedLoader is only minHeight:160 with no flex, so returning it bare
    // pinned it under the notch with the previous screen showing through.
    // Same shell as the loaded state, so the header doesn't pop in after.
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background }}
        edges={["top", "left", "right"]}
      >
        <ScreenHeader title={t("alerts.title")} showBack />
        <View style={styles.loadingContainer}>
          <BrandedLoader label={t("alerts.loading")} />
        </View>
      </SafeAreaView>
    );
  }

  const isEmpty = searches.length === 0;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "left", "right"]}
    >
      <ScreenHeader
        title={t("alerts.title")}
        subtitle={
          isEmpty
            ? t("alerts.subtitle")
            : t("alerts.summary", { n: searches.length }) +
              (pausedCount ? ` · ${t("alerts.summaryPaused", { n: pausedCount })}` : "")
        }
        showBack
        right={
          <AnimatedPressable
            onPress={() => router.push("/profile/settings" as never)}
            accessibilityRole="button"
            accessibilityLabel={t("alerts.settingsA11y")}
            style={[styles.headerBtn, { backgroundColor: colors.card }]}
            testID="alerts-settings"
          >
            <View style={styles.headerBtnInner}>
              <Settings size={20} color={colors.foreground} />
            </View>
          </AnimatedPressable>
        }
      />
      <FlatList
        data={searches}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListHeaderComponent={
          isEmpty ? null : (
            <View>
              {pushWarning}
              {composer ? (
                <AlertComposer
                  key={composer.mode === "edit" ? composer.search.id : "create"}
                  mode={composer.mode}
                  initial={composer.mode === "edit" ? composer.search : null}
                  saving={saving}
                  onCancel={() => setComposer(null)}
                  onSubmit={(criteria) => void handleSubmit(criteria)}
                />
              ) : (
                <AnimatedPressable
                  onPress={openCreate}
                  accessibilityRole="button"
                  style={[styles.newBtn, { borderColor: colors.accent }]}
                  testID="alerts-new"
                >
                  <View style={styles.newBtnInner}>
                    <Plus size={17} color={colors.accent} />
                    <Text style={[styles.newBtnText, { color: colors.accent }]}>
                      {t("alerts.newAlert")}
                    </Text>
                  </View>
                </AnimatedPressable>
              )}
            </View>
          )
        }
        ListEmptyComponent={
          // Top-aligned and immediately actionable: the old centred bell left
          // most of the screen dead and only pointed at a different screen.
          <View style={styles.emptyWrap}>
            {pushWarning}
            <View style={styles.emptyIntro}>
              <View style={[styles.emptyIcon, { backgroundColor: `${colors.accent}12` }]}>
                <BellRing size={32} color={colors.accent} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {t("alerts.empty.title")}
              </Text>
              <Text style={[styles.emptyBody, { color: textSecondary }]}>
                {t("alerts.empty.body")}
              </Text>
            </View>
            <AlertComposer
              mode="create"
              saving={saving}
              onSubmit={(criteria) => void handleSubmit(criteria)}
            />
            <AnimatedPressable
              onPress={() => router.push("/opportunities" as never)}
              accessibilityRole="button"
              style={styles.emptyLink}
            >
              <View style={styles.emptyLinkInner}>
                <Compass size={15} color={textSecondary} />
                <Text style={[styles.emptyLinkText, { color: textSecondary }]}>
                  {t("alerts.empty.browse")}
                </Text>
              </View>
            </AnimatedPressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { padding: 16, paddingBottom: 48 },
  headerBtn: { width: 36, height: 36, borderRadius: 10, borderCurve: "continuous" },
  headerBtnInner: { flex: 1, alignItems: "center", justifyContent: "center" },
  warning: { borderRadius: 13, borderCurve: "continuous", marginBottom: 12 },
  warningInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  warningText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  newBtn: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 14,
    borderCurve: "continuous",
    marginBottom: 12,
  },
  newBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
  },
  newBtnText: { fontSize: 14, fontWeight: "700" },
  emptyWrap: { paddingTop: 4 },
  emptyIntro: { alignItems: "center", paddingHorizontal: 8, marginBottom: 20 },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
  emptyBody: { fontSize: 13.5, lineHeight: 20, textAlign: "center", marginTop: 6 },
  emptyLink: { alignSelf: "center", marginTop: 4 },
  emptyLinkInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  emptyLinkText: { fontSize: 13.5, fontWeight: "600", textDecorationLine: "underline" },
});
