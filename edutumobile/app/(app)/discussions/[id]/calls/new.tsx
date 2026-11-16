import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useTranslation } from "react-i18next";
import { fetchGroup } from "@edutu/core/src/services/communities";
import { resolveAdminRole } from "@edutu/core/src/services/communityAuthz";
import { ScreenHeader } from "../../../../../components/ui/ScreenHeader";
import { AnimatedPressable } from "../../../../../components/ui/AnimatedPressable";
import { useTheme } from "../../../../../components/context/ThemeContext";
import { scheduleCommunityCall } from "../../../../../features/community-calls/api";
import { CallScheduleDateTimeField } from "../../../../../components/community/calls/CallScheduleDateTimeField";
import { getInitialScheduledDate } from "../../../../../features/community-calls/schedule";

const DURATIONS = [15, 30, 45, 60];

export default function ScheduleCommunityCallScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const groupId = Array.isArray(params.id)
    ? (params.id[0] ?? "")
    : (params.id ?? "");
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const { t } = useTranslation("community");
  const { colors } = useTheme();
  const [title, setTitle] = useState("");
  const [scheduledFor, setScheduledFor] = useState(getInitialScheduledDate);
  const [minimumDate] = useState(() => new Date());
  const [duration, setDuration] = useState(30);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void fetchGroup(groupId, getToken)
      .then(
        (detail) => {
          if (active)
            setRole(
              resolveAdminRole(
                detail.group,
                user?.id ?? null,
                detail.membership,
              ),
            );
        },
        (caught) => {
          if (active)
            setError(
              caught instanceof Error ? caught.message : t("calls.loadFailed"),
            );
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [getToken, groupId, t, user?.id]);
  const valid = useMemo(
    () =>
      title.trim().length > 0 &&
      title.trim().length <= 120 &&
      scheduledFor.getTime() > minimumDate.getTime(),
    [minimumDate, scheduledFor, title],
  );
  const submit = async () => {
    if (!valid || saving || !role) return;
    setSaving(true);
    setError(null);
    try {
      const call = await scheduleCommunityCall(
        groupId,
        {
          title: title.trim(),
          scheduledFor: scheduledFor.toISOString(),
          durationMinutes: duration,
        },
        getToken,
      );
      router.replace(`/discussions/${groupId}/calls/${call.id}` as never);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("calls.scheduleFailed"),
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={["top", "bottom"]}
    >
      <ScreenHeader title={t("calls.scheduleTitle")} showBack />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : role !== "owner" && role !== "mod" ? (
            <Text
              testID="call-role-denied"
              style={[styles.error, { color: colors.error }]}
            >
              {t("calls.adminOnly")}
            </Text>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.foreground }]}>
                {t("calls.titleLabel")}
              </Text>
              <TextInput
                testID="call-title"
                value={title}
                onChangeText={setTitle}
                maxLength={120}
                placeholder={t("calls.titlePlaceholder")}
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                  },
                ]}
              />
              <Text style={[styles.label, { color: colors.foreground }]}>
                {t("calls.whenLabel")}
              </Text>
              <CallScheduleDateTimeField
                value={scheduledFor}
                onChange={setScheduledFor}
                minimumDate={minimumDate}
              />
              <Text style={[styles.label, { color: colors.foreground }]}>
                {t("calls.durationLabel")}
              </Text>
              <View style={styles.durations}>
                {DURATIONS.map((minutes) => (
                  <AnimatedPressable
                    key={minutes}
                    accessibilityRole="button"
                    accessibilityState={{ selected: duration === minutes }}
                    onPress={() => setDuration(minutes)}
                    style={[
                      styles.duration,
                      {
                        borderColor:
                          duration === minutes ? colors.accent : colors.border,
                        backgroundColor:
                          duration === minutes
                            ? `${colors.accent}16`
                            : colors.card,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color:
                          duration === minutes
                            ? colors.accent
                            : colors.foreground,
                        fontWeight: "700",
                      }}
                    >
                      {t("calls.minutes", { count: minutes })}
                    </Text>
                  </AnimatedPressable>
                ))}
              </View>
              {error && (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[styles.error, { color: colors.error }]}
                >
                  {error}
                </Text>
              )}
              <AnimatedPressable
                testID="call-schedule-submit"
                accessibilityRole="button"
                accessibilityLabel={t("calls.schedule")}
                accessibilityState={{
                  disabled: !valid || saving,
                  busy: saving,
                }}
                disabled={!valid || saving}
                onPress={() => void submit()}
                style={[
                  styles.submit,
                  {
                    backgroundColor: colors.accent,
                    opacity: !valid || saving ? 0.55 : 1,
                  },
                ]}
              >
                <Text style={styles.submitText}>
                  {saving ? t("calls.scheduling") : t("calls.schedule")}
                </Text>
              </AnimatedPressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 20, gap: 10 },
  label: { fontSize: 13, fontWeight: "800", marginTop: 10 },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  durations: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  duration: {
    height: 42,
    minWidth: 70,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  error: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  submit: {
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  submitText: { fontSize: 15, fontWeight: "800", color: "#fff" },
});
