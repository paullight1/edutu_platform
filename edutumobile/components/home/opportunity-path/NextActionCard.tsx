import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowRight, CheckCircle2 } from "lucide-react-native";
import { useTheme } from "../../context/ThemeContext";
import type { OpportunityNextActionView } from "@edutu/core";

export default function NextActionCard({
  action,
  progress,
  onContinue,
}: {
  action: OpportunityNextActionView;
  progress?: { percent: number } | null;
  onContinue: () => void;
}) {
  const { colors } = useTheme();
  const percent = Math.max(0, Math.min(100, progress?.percent ?? 0));

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.accent },
      ]}
    >
      <View style={styles.headingRow}>
        <View style={[styles.icon, { backgroundColor: colors.accentLight }]}>
          <CheckCircle2 size={20} color={colors.accent} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
            Your next action
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {action.label}
          </Text>
          {action.dueAt ? (
            <Text style={[styles.due, { color: colors.mutedForeground }]}>
              Due {new Date(action.dueAt).toLocaleDateString()}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={[styles.track, { backgroundColor: colors.muted }]}>
        <View
          accessibilityLabel={`${percent}% complete`}
          style={[
            styles.fill,
            { width: `${percent}%`, backgroundColor: colors.accent },
          ]}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Continue: ${action.label}`}
        onPress={onContinue}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Text style={[styles.buttonText, { color: colors.background }]}>
          Continue
        </Text>
        <ArrowRight size={17} color={colors.background} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 14 },
  headingRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: { fontSize: 17, lineHeight: 22, fontWeight: "800", marginTop: 4 },
  due: { fontSize: 12, marginTop: 4 },
  track: { height: 6, borderRadius: 999, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 999 },
  button: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: { fontSize: 14, fontWeight: "800" },
});
