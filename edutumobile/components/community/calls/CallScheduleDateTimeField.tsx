import React, { useMemo, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import CommunityDateTimePicker from "@expo/ui/community/datetime-picker";
import { useTranslation } from "react-i18next";
import { AnimatedPressable } from "../../ui/AnimatedPressable";
import { useTheme } from "../../context/ThemeContext";
import {
  mergeLocalDate,
  mergeLocalTime,
} from "../../../features/community-calls/schedule";

type PickerMode = "date" | "time";

export function CallScheduleDateTimeField({
  value,
  onChange,
  minimumDate,
}: {
  value: Date;
  onChange: (value: Date) => void;
  minimumDate: Date;
}) {
  const { t, i18n } = useTranslation("community");
  const { colors, isDark } = useTheme();
  const [androidPicker, setAndroidPicker] = useState<PickerMode | null>(null);
  const locale = i18n.resolvedLanguage || i18n.language;
  const dateText = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(value),
    [locale, value],
  );
  const timeText = useMemo(
    () => new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(value),
    [locale, value],
  );
  const timeZone = useMemo(
    () =>
      Intl.DateTimeFormat().resolvedOptions().timeZone || t("calls.localTime"),
    [t],
  );

  const update = (mode: PickerMode, selected: Date) => {
    onChange(
      mode === "date"
        ? mergeLocalDate(value, selected)
        : mergeLocalTime(value, selected),
    );
  };

  const picker = (mode: PickerMode, presentation: "inline" | "dialog") => (
    <CommunityDateTimePicker
      testID={`call-${mode}-picker`}
      value={value}
      mode={mode}
      display={Platform.OS === "ios" ? "compact" : "default"}
      presentation={presentation}
      minimumDate={mode === "date" ? minimumDate : undefined}
      accentColor={colors.accent}
      locale={locale}
      themeVariant={isDark ? "dark" : "light"}
      onValueChange={(_event, selected) => {
        update(mode, selected);
        if (Platform.OS === "android") setAndroidPicker(null);
      }}
      onDismiss={() => setAndroidPicker(null)}
    />
  );

  if (Platform.OS === "ios") {
    return (
      <View style={styles.fields}>
        <View
          style={[
            styles.iosField,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.label, { color: colors.foreground }]}>
            {t("calls.dateLabel")}
          </Text>
          {picker("date", "inline")}
        </View>
        <View
          style={[
            styles.iosField,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.label, { color: colors.foreground }]}>
            {t("calls.timeLabel")}
          </Text>
          {picker("time", "inline")}
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {t("calls.whenHint", { timeZone })}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.fields}>
      <View style={styles.androidRow}>
        <DateTimeButton
          label={t("calls.dateLabel")}
          value={dateText}
          testID="call-date-button"
          onPress={() => setAndroidPicker("date")}
        />
        <DateTimeButton
          label={t("calls.timeLabel")}
          value={timeText}
          testID="call-time-button"
          onPress={() => setAndroidPicker("time")}
        />
      </View>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        {t("calls.whenHint", { timeZone })}
      </Text>
      {androidPicker ? picker(androidPicker, "dialog") : null}
    </View>
  );
}

function DateTimeButton({
  label,
  value,
  testID,
  onPress,
}: {
  label: string;
  value: string;
  testID: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.buttonLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text
        style={[styles.buttonValue, { color: colors.foreground }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 8 },
  androidRow: { flexDirection: "row", gap: 10 },
  button: {
    flex: 1,
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    justifyContent: "center",
  },
  buttonLabel: { fontSize: 12, fontWeight: "700", marginBottom: 5 },
  buttonValue: { fontSize: 15, fontWeight: "700", lineHeight: 20 },
  iosField: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  label: { fontSize: 13, fontWeight: "800" },
  hint: { fontSize: 12, lineHeight: 17 },
});
