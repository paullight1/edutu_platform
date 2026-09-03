import { Pressable, StyleSheet, Text, View } from "react-native";
import { BookmarkPlus, ChevronRight, X } from "lucide-react-native";
import { useTheme } from "../../context/ThemeContext";
import type { IntentRecommendationView } from "@edutu/core";

const ELIGIBILITY_LABELS = {
  eligible: "Eligible",
  likely: "Likely eligible",
  unclear: "Check eligibility",
  ineligible: "Not eligible",
} as const;

export default function FocusedRecommendationCard({
  item,
  busyAction,
  onOpen,
  onPursue,
  onShortlist,
  onPass,
}: {
  item: IntentRecommendationView;
  busyAction?: "pursue" | "shortlist" | "pass" | null;
  onOpen: () => void;
  onPursue: () => void;
  onShortlist: () => void;
  onPass: () => void;
}) {
  const { colors } = useTheme();
  const organization =
    typeof item.organization === "string" ? item.organization : null;
  const reason = item.matchReasons[0];
  const risk = item.matchRisks[0];
  const disabled =
    Boolean(busyAction) || item.eligibilityStatus === "ineligible";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.title}`}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.openArea,
          { opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text
              numberOfLines={2}
              style={[styles.title, { color: colors.foreground }]}
            >
              {item.title}
            </Text>
            {organization ? (
              <Text
                numberOfLines={1}
                style={[styles.organization, { color: colors.textSecondary }]}
              >
                {organization}
              </Text>
            ) : null}
          </View>
          <ChevronRight size={18} color={colors.mutedForeground} />
        </View>
        <View style={styles.metaRow}>
          <View style={[styles.badge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.badgeText, { color: colors.accent }]}>
              {ELIGIBILITY_LABELS[item.eligibilityStatus]}
            </Text>
          </View>
          {typeof item.estimatedEffortHours === "number" ? (
            <Text style={[styles.effort, { color: colors.mutedForeground }]}>
              About {item.estimatedEffortHours}h preparation
            </Text>
          ) : null}
        </View>
        {reason ? (
          <Text
            numberOfLines={2}
            style={[styles.reason, { color: colors.textSecondary }]}
          >
            <Text style={[styles.strong, { color: colors.foreground }]}>
              Why it fits:{" "}
            </Text>
            {reason}
          </Text>
        ) : null}
        {risk ? (
          <Text
            numberOfLines={2}
            style={[styles.risk, { color: colors.mutedForeground }]}
          >
            <Text style={styles.strong}>Watch out: </Text>
            {risk}
          </Text>
        ) : null}
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Pursue ${item.title}`}
          disabled={disabled}
          onPress={onPursue}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: colors.primary,
              opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text style={[styles.primaryText, { color: colors.background }]}>
            {busyAction === "pursue" ? "Starting…" : "Pursue"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Shortlist ${item.title}`}
          disabled={Boolean(busyAction)}
          onPress={onShortlist}
          style={({ pressed }) => [
            styles.secondaryButton,
            {
              borderColor: colors.border,
              backgroundColor: colors.background,
              opacity: busyAction ? 0.45 : pressed ? 0.75 : 1,
            },
          ]}
        >
          <BookmarkPlus size={16} color={colors.accent} />
          <Text style={[styles.secondaryText, { color: colors.foreground }]}>
            Save
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Pass on ${item.title}`}
          disabled={Boolean(busyAction)}
          onPress={onPass}
          hitSlop={6}
          style={({ pressed }) => [
            styles.passButton,
            { opacity: busyAction ? 0.45 : pressed ? 0.6 : 1 },
          ]}
        >
          <X size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  openArea: { padding: 15, gap: 8 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  headingCopy: { flex: 1 },
  title: { fontSize: 16, lineHeight: 21, fontWeight: "800" },
  organization: { fontSize: 12, marginTop: 4 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "800" },
  effort: { fontSize: 11, fontWeight: "600" },
  reason: { fontSize: 12, lineHeight: 17 },
  risk: { fontSize: 12, lineHeight: 17 },
  strong: { fontWeight: "800" },
  actions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
  },
  primaryButton: {
    minHeight: 42,
    flex: 1,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  primaryText: { fontSize: 13, fontWeight: "800" },
  secondaryButton: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  secondaryText: { fontSize: 13, fontWeight: "800" },
  passButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});
