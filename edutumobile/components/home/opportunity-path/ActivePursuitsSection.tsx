import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowRight, Clock3 } from "lucide-react-native";
import { useTheme } from "../../context/ThemeContext";
import type { OpportunityJourneyView } from "@edutu/core";

function opportunityTitle(item: OpportunityJourneyView): string {
  const title = item.opportunity.title;
  return typeof title === "string" && title.trim()
    ? title.trim()
    : "Opportunity";
}

export default function ActivePursuitsSection({
  items,
  onOpen,
}: {
  items: OpportunityJourneyView[];
  onOpen: (item: OpportunityJourneyView) => void;
}) {
  const { colors } = useTheme();
  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: colors.foreground }]}>
        Active pursuits
      </Text>
      {items.slice(0, 3).map((item) => (
        <Pressable
          key={item.journey.id}
          accessibilityRole="button"
          accessibilityLabel={`Continue ${opportunityTitle(item)}`}
          onPress={() => onOpen(item)}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <View style={styles.copy}>
            <View style={styles.statusRow}>
              <Clock3 size={14} color={colors.accent} />
              <Text style={[styles.status, { color: colors.accent }]}>
                {item.journey.state.replaceAll("_", " ")}
              </Text>
            </View>
            <Text
              numberOfLines={2}
              style={[styles.title, { color: colors.foreground }]}
            >
              {opportunityTitle(item)}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.next, { color: colors.textSecondary }]}
            >
              Next: {item.nextAction.label}
            </Text>
            <View style={[styles.track, { backgroundColor: colors.muted }]}>
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: colors.accent,
                    width: `${Math.max(0, Math.min(100, item.progress.percent))}%`,
                  },
                ]}
              />
            </View>
          </View>
          <ArrowRight size={18} color={colors.mutedForeground} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  heading: { fontSize: 18, fontWeight: "800" },
  card: {
    minHeight: 112,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  copy: { flex: 1, gap: 5 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  status: { fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  title: { fontSize: 15, fontWeight: "800", lineHeight: 20 },
  next: { fontSize: 12 },
  track: { height: 5, borderRadius: 999, overflow: "hidden", marginTop: 3 },
  fill: { height: "100%", borderRadius: 999 },
});
