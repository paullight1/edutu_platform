import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { X } from "lucide-react-native";
import { useTheme } from "../../context/ThemeContext";
import type { OpportunityIntentView } from "@edutu/core";

const GOALS = [
  ["study_funding", "Study funding"],
  ["work_experience", "Work experience"],
  ["employment", "Employment"],
  ["business_funding", "Business funding"],
  ["leadership_growth", "Leadership growth"],
  ["skill_building", "Skill building"],
  ["open_exploration", "Explore opportunities"],
] as const;

export default function CurrentFocusSheet({
  visible,
  intent,
  saving,
  onClose,
  onSelect,
}: {
  visible: boolean;
  intent: OpportunityIntentView;
  saving: boolean;
  onClose: () => void;
  onSelect: (goalKey: string) => void;
}) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                Current focus
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Choose what Edutu should help you achieve now.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close current focus editor"
              onPress={onClose}
              hitSlop={8}
              style={[styles.close, { backgroundColor: colors.muted }]}
            >
              <X size={19} color={colors.foreground} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.options}>
            {GOALS.map(([key, label]) => {
              const selected = intent.goalKey === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: saving }}
                  accessibilityLabel={`Set current focus to ${label}`}
                  disabled={saving}
                  onPress={() => onSelect(key)}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      borderColor: selected ? colors.accent : colors.border,
                      backgroundColor: selected
                        ? colors.muted
                        : colors.background,
                      opacity: saving ? 0.55 : pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[styles.optionText, { color: colors.foreground }]}
                  >
                    {label}
                  </Text>
                  {selected ? (
                    <Text style={[styles.selected, { color: colors.accent }]}>
                      Current
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(2, 6, 23, 0.58)",
  },
  sheet: {
    maxHeight: "78%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    paddingBottom: 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  headerCopy: { flex: 1 },
  title: { fontSize: 20, fontWeight: "900" },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  options: { gap: 10, paddingBottom: 12 },
  option: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionText: { fontSize: 15, fontWeight: "800" },
  selected: { fontSize: 12, fontWeight: "800" },
});
