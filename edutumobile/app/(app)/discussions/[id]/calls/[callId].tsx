import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useTranslation } from "react-i18next";
import { fetchGroup } from "@edutu/core/src/services/communities";
import { resolveAdminRole } from "@edutu/core/src/services/communityAuthz";
import { ScreenHeader } from "../../../../../components/ui/ScreenHeader";
import { AnimatedPressable } from "../../../../../components/ui/AnimatedPressable";
import { CallPreflight } from "../../../../../components/community/calls/CallPreflight";
import { VoiceCallRoom } from "../../../../../components/community/calls/VoiceCallRoom";
import { useTheme } from "../../../../../components/context/ThemeContext";
import { startCommunityCall } from "../../../../../features/community-calls/api";
import {
  getNativeAudioRoutes,
  setNativeAudioRoute,
} from "../../../../../features/community-calls/nativeCall";
import { useCommunityCall } from "../../../../../features/community-calls/useCommunityCall";

export default function CommunityCallScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    callId?: string | string[];
    incoming?: string;
  }>();
  const groupId = Array.isArray(params.id)
    ? (params.id[0] ?? "")
    : (params.id ?? "");
  const callId = Array.isArray(params.callId)
    ? (params.callId[0] ?? "")
    : (params.callId ?? "");
  const { getToken } = useAuth();
  const { user } = useUser();
  const { t } = useTranslation("community");
  const { colors } = useTheme();
  const call = useCommunityCall(callId, getToken);
  const { join } = call;
  const [role, setRole] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    void fetchGroup(groupId, getToken)
      .then((d) =>
        setRole(resolveAdminRole(d.group, user?.id ?? null, d.membership)),
      )
      .catch(() => undefined);
  }, [getToken, groupId, user?.id]);
  useEffect(() => {
    if (params.incoming === "1" && call.state.phase === "preflight")
      void join();
  }, [params.incoming, call.state.phase, join]);
  const canEnd = role === "owner" || role === "mod";
  const title = call.state.call?.title ?? t("calls.voiceCall");
  const cycleAudio = async () => {
    const routes = await getNativeAudioRoutes();
    if (!routes.length) return;
    const selected = routes.findIndex((r) => r.selected);
    const next = routes[(selected + 1) % routes.length];
    if (next) await setNativeAudioRoute(callId, next.name);
  };
  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await startCommunityCall(callId, getToken);
      await call.refresh();
      await call.join();
    } finally {
      setStarting(false);
    }
  };
  const state = useMemo(() => call.state.phase, [call.state.phase]);
  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={["top", "bottom"]}
    >
      <ScreenHeader title={title} subtitle={t("calls.voiceCall")} showBack />
      {state === "loading" ? (
        <ActivityIndicator style={styles.center} color={colors.accent} />
      ) : state === "preflight" || state === "connecting" ? (
        <CallPreflight
          busy={state === "connecting"}
          onJoin={() => void call.join()}
        />
      ) : state === "live" || state === "reconnecting" ? (
        <VoiceCallRoom
          title={title}
          participants={call.state.participants}
          speakers={call.state.activeSpeakers}
          muted={call.state.muted}
          reconnecting={state === "reconnecting"}
          canEnd={canEnd}
          onMute={() => void call.setMuted(!call.state.muted)}
          onAudioRoute={() => void cycleAudio()}
          onReconnect={() => void call.reconnect()}
          onLeave={() => void call.leave()}
          onEnd={() => void call.endForEveryone()}
        />
      ) : call.state.call?.status === "scheduled" && canEnd ? (
        <State
          title={t("calls.scheduled")}
          body={new Date(call.state.call.scheduledFor).toLocaleString()}
          action={t("calls.start")}
          busy={starting}
          onAction={() => void start()}
        />
      ) : (
        <State
          title={
            state === "summary"
              ? t("calls.ended")
              : state === "full"
                ? t("calls.full")
                : state === "denied"
                  ? t("calls.denied")
                  : state === "unsupported"
                    ? t("calls.unsupported")
                    : t("calls.failed")
          }
          body={call.state.error ?? t("calls.summaryBody")}
          action={state === "failed" ? t("calls.retry") : undefined}
          onAction={() => void call.reconnect()}
        />
      )}
    </SafeAreaView>
  );
}
function State({
  title,
  body,
  action,
  busy,
  onAction,
}: {
  title: string;
  body: string;
  action?: string;
  busy?: boolean;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View testID="call-state" style={styles.state}>
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>
        {title}
      </Text>
      <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
        {body}
      </Text>
      {action && onAction ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={onAction}
          style={[styles.action, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.actionText}>{action}</Text>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1 },
  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  stateTitle: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  stateBody: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
  },
  action: {
    height: 50,
    minWidth: 190,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  actionText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
