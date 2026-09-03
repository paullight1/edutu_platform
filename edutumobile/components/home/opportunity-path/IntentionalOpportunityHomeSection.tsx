import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { RefreshCw } from "lucide-react-native";
import { useRouter } from "expo-router";
import {
  createOpportunityJourney,
  createOpportunityJourneyIdempotencyKey,
  dismissOpportunity,
  saveOpportunityIntent,
  useOpportunityHome,
  type GetAuthToken,
  type IntentRecommendationView,
  type OpportunityJourneyView,
} from "@edutu/core";
import { useTheme } from "../../context/ThemeContext";
import ActivePursuitsSection from "./ActivePursuitsSection";
import CurrentFocusCard from "./CurrentFocusCard";
import CurrentFocusSheet from "./CurrentFocusSheet";
import FocusedRecommendationCard from "./FocusedRecommendationCard";
import NextActionCard from "./NextActionCard";

export default function IntentionalOpportunityHomeSection({
  userId,
  getAuthToken,
}: {
  userId: string;
  getAuthToken: GetAuthToken;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { data, loading, error, isStale, refresh } = useOpportunityHome({
    userId,
    getAuthToken,
    enabled: true,
    recommendationLimit: 3,
  });
  const [editingFocus, setEditingFocus] = useState(false);
  const [savingFocus, setSavingFocus] = useState(false);
  const [busy, setBusy] = useState<{
    opportunityId: string;
    action: "pursue" | "shortlist" | "pass";
  } | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const recommendations = useMemo(
    () =>
      (data?.recommendations ?? []).filter(
        (item) => !hiddenIds.includes(item.id),
      ),
    [data?.recommendations, hiddenIds],
  );

  const openOpportunity = (opportunityId: string) => {
    router.push({
      pathname: "/opportunities/[id]",
      params: { id: opportunityId },
    } as never);
  };

  const openJourney = (item: OpportunityJourneyView) => {
    openOpportunity(item.journey.opportunityId);
  };

  const decide = async (
    item: IntentRecommendationView,
    action: "pursue" | "shortlist",
  ) => {
    setBusy({ opportunityId: item.id, action });
    try {
      const result = await createOpportunityJourney({
        userId,
        opportunityId: item.id,
        action,
        idempotencyKey: createOpportunityJourneyIdempotencyKey(action),
        getAuthToken,
      });
      setHiddenIds((current) => [...current, item.id]);
      if (result.queued) {
        Alert.alert(
          "Saved for sync",
          "Edutu will complete this action when your connection returns.",
        );
      } else if (action === "pursue") {
        Alert.alert("Path started", "Your first preparation step is ready.");
      }
      await refresh();
    } catch (nextError) {
      Alert.alert(
        "Unable to update your path",
        nextError instanceof Error ? nextError.message : "Please try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  const pass = async (item: IntentRecommendationView) => {
    setBusy({ opportunityId: item.id, action: "pass" });
    setHiddenIds((current) => [...current, item.id]);
    try {
      await dismissOpportunity(
        userId,
        item.id,
        getAuthToken,
        "intentional_home",
        "wrong_field",
      );
    } finally {
      setBusy(null);
    }
  };

  const saveFocus = async (goalKey: string) => {
    if (!data?.intent) return;
    setSavingFocus(true);
    try {
      const result = await saveOpportunityIntent({
        userId,
        intent: {
          goalKey,
          opportunityTypes: data.intent.opportunityTypes,
          locations: data.intent.locations,
          remotePreference: data.intent.remotePreference,
          actionHorizonDays: data.intent.actionHorizonDays,
          weeklyHours: data.intent.weeklyHours,
          readinessMode: data.intent.readinessMode,
        },
        idempotencyKey: createOpportunityJourneyIdempotencyKey("intent"),
        getAuthToken,
      });
      if (result.queued) {
        Alert.alert(
          "Focus saved for sync",
          "Edutu will refresh your recommendations when your connection returns.",
        );
      }
      setEditingFocus(false);
      await refresh();
    } catch (nextError) {
      Alert.alert(
        "Unable to update focus",
        nextError instanceof Error ? nextError.message : "Please try again.",
      );
    } finally {
      setSavingFocus(false);
    }
  };

  if (loading && !data) {
    return (
      <View style={[styles.loadingCard, { backgroundColor: colors.card }]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Preparing your opportunity path…
        </Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View
        style={[
          styles.errorCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>
          Your path could not load
        </Text>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>
          {error ?? "Check your connection and try again."}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry opportunity path"
          onPress={() => void refresh()}
          style={[styles.retry, { borderColor: colors.border }]}
        >
          <RefreshCw size={16} color={colors.accent} />
          <Text style={[styles.retryText, { color: colors.accent }]}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  const priority = data.activePursuits[0] ?? null;

  return (
    <View
      style={styles.section}
      accessibilityLabel="Your intentional opportunity path"
    >
      {isStale ? (
        <Text style={[styles.stale, { color: colors.mutedForeground }]}>
          Showing your last synced path
        </Text>
      ) : null}
      <CurrentFocusCard
        intent={data.intent}
        onEdit={() => setEditingFocus(true)}
      />
      {data.nextAction && priority ? (
        <NextActionCard
          action={data.nextAction}
          progress={priority.progress}
          onContinue={() => openJourney(priority)}
        />
      ) : null}
      <ActivePursuitsSection items={data.activePursuits} onOpen={openJourney} />
      <View style={styles.recommendations}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderCopy}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Recommended for your focus
            </Text>
            <Text
              style={[styles.sectionSubtitle, { color: colors.textSecondary }]}
            >
              Three intentional choices, not an endless feed.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh focused recommendations"
            onPress={() => void refresh()}
            hitSlop={8}
          >
            <RefreshCw size={18} color={colors.accent} />
          </Pressable>
        </View>
        {data.degraded ? (
          <Text style={[styles.degraded, { color: colors.warning }]}>
            Personalisation is temporarily limited; your active path is still
            available.
          </Text>
        ) : null}
        {recommendations.map((item) => (
          <FocusedRecommendationCard
            key={item.id}
            item={item}
            busyAction={busy?.opportunityId === item.id ? busy.action : null}
            onOpen={() => openOpportunity(item.id)}
            onPursue={() => void decide(item, "pursue")}
            onShortlist={() => void decide(item, "shortlist")}
            onPass={() => void pass(item)}
          />
        ))}
        {recommendations.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            You have decided on this shortlist. Explore more opportunities
            below.
          </Text>
        ) : null}
      </View>
      <CurrentFocusSheet
        visible={editingFocus}
        intent={data.intent}
        saving={savingFocus}
        onClose={() => setEditingFocus(false)}
        onSelect={(goalKey) => void saveFocus(goalKey)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 16, paddingHorizontal: 16, marginBottom: 20 },
  stale: { fontSize: 12, fontWeight: "700" },
  loadingCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    minHeight: 112,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: { fontSize: 13, fontWeight: "600" },
  errorCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  errorTitle: { fontSize: 17, fontWeight: "800" },
  errorText: { fontSize: 13, lineHeight: 18 },
  retry: {
    alignSelf: "flex-start",
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
  },
  retryText: { fontSize: 13, fontWeight: "800" },
  recommendations: { gap: 11 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  sectionHeaderCopy: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  sectionSubtitle: { fontSize: 12, marginTop: 3 },
  degraded: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  empty: { fontSize: 13, lineHeight: 18, paddingVertical: 10 },
});
