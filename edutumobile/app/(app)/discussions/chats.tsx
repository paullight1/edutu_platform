import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useTranslation } from "react-i18next";
import {
  Trash2,
  UserRound,
} from "lucide-react-native";
import {
  fetchDmConversations,
  hideDmConversation,
  isCommunityDmApiError,
  type DmConversationSummary,
} from "@edutu/core/src/services/communityDms";
import {
  useTheme,
  type ThemeColors,
} from "../../../components/context/ThemeContext";
import { AnimatedPressable } from "../../../components/ui/AnimatedPressable";
import { Skeleton } from "../../../components/ui/Skeleton";
import { StateView } from "../../../components/state";
import { formatRelativeTime } from "../../../lib/utils";

type InboxSnapshot = {
  nextDms?: DmConversationSummary[];
  error: string | null;
  completeFailure: boolean;
};

function inboxErrorMessage(error: unknown, fallback: string): string {
  return isCommunityDmApiError(error) ? error.message : fallback;
}

/**
 * One backend-backed inbox for accepted one-to-one conversations. Community
 * rooms belong on Groups, and pending requests are intentionally not mixed into
 * the Chats tab: this surface is only for direct conversations with people the
 * member has chosen to connect with.
 */
export default function CommunityChatsScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation(["community", "common"]);
  const [directMessages, setDirectMessages] = useState<DmConversationSummary[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completeFailure, setCompleteFailure] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const refreshingRef = useRef(false);
  const busyIdRef = useRef<string | null>(null);

  const queryInbox = useCallback(async (): Promise<InboxSnapshot> => {
    const dmsResult = await Promise.allSettled([
      fetchDmConversations({ limit: 50 }, getToken),
    ]).then(([result]) => result);

    return {
      nextDms: dmsResult.status === "fulfilled" ? dmsResult.value : undefined,
      error:
        dmsResult.status === "fulfilled"
          ? null
          : inboxErrorMessage(dmsResult.reason, t("community:inbox.networkError")),
      completeFailure: dmsResult.status === "rejected",
    };
  }, [getToken, t]);

  const applyInbox = useCallback(
    ({
      nextDms,
      error: nextError,
      completeFailure: nextCompleteFailure,
    }: Awaited<ReturnType<typeof queryInbox>>) => {
      if (nextDms) setDirectMessages(nextDms);
      setError(nextError);
      setCompleteFailure(nextCompleteFailure);
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const requestId = ++requestVersion.current;
      void queryInbox()
        .then((result) => {
          if (active && requestId === requestVersion.current) applyInbox(result);
        })
        .catch((caught) => {
          if (!active || requestId !== requestVersion.current) return;
          setError(inboxErrorMessage(caught, t("community:inbox.networkError")));
          setCompleteFailure(true);
        })
        .finally(() => {
          if (active && requestId === requestVersion.current) setLoading(false);
        });
      return () => {
        active = false;
        if (requestId === requestVersion.current) requestVersion.current += 1;
      };
    }, [applyInbox, queryInbox, t]),
  );

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    const requestId = ++requestVersion.current;
    setRefreshing(true);
    try {
      const result = await queryInbox();
      if (requestId === requestVersion.current) applyInbox(result);
    } catch (caught) {
      if (requestId === requestVersion.current) {
        setError(inboxErrorMessage(caught, t("community:inbox.networkError")));
        setCompleteFailure(true);
      }
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      if (requestId === requestVersion.current) {
        setLoading(false);
      }
    }
  }, [applyInbox, queryInbox, t]);

  const openDm = useCallback(
    (conversationId: string) =>
      router.push(`/discussions/dm/${conversationId}` as never),
    [router],
  );

  const confirmHide = useCallback(
    (conversation: DmConversationSummary) => {
      Alert.alert(
        t("community:inbox.removeTitle"),
        t("community:inbox.removeBody"),
        [
          { text: t("common:actions.cancel"), style: "cancel" },
          {
            text: t("community:inbox.remove"),
            style: "destructive",
            onPress: () => {
              if (busyIdRef.current) return;
              busyIdRef.current = conversation.id;
              setBusyId(conversation.id);
              void hideDmConversation(conversation.id, getToken)
                .then(() =>
                  setDirectMessages((current) =>
                    current.filter((row) => row.id !== conversation.id),
                  ),
                )
                .catch((caught) =>
                  setError(
                    isCommunityDmApiError(caught)
                      ? caught.message
                      : t("community:dm.removeFailed"),
                  ),
                )
                .finally(() => {
                  busyIdRef.current = null;
                  setBusyId(null);
                });
            },
          },
        ],
      );
    },
    [getToken, t],
  );

  const hasInboxContent = directMessages.length > 0;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={["left", "right"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.accent}
          />
        }
      >
        {loading ? (
          <InboxSkeleton colors={colors} />
        ) : completeFailure && error && !hasInboxContent ? (
          <StateView
            state={{ kind: "error", cause: "network" }}
            flow="community"
            fill={false}
            sceneSize={154}
            style={styles.state}
            title={t("community:inbox.unavailable")}
            body={error}
            onRetry={() => void refresh()}
          />
        ) : !hasInboxContent ? (
          <StateView
            state={{ kind: "empty", reason: "firstRun" }}
            flow="community"
            fill={false}
            sceneSize={164}
            style={styles.state}
            title={t("community:inbox.emptyTitle")}
            body={
              error
                ? t("community:inbox.emptyPartial")
                : t("community:inbox.emptyBody")
            }
            actionLabel={t("community:inbox.explore")}
            onAction={() => router.push("/discussions/explore" as never)}
          />
        ) : (
          <>
            {!!error && (
              <View
                testID="chats-inline-error"
                accessibilityLiveRegion="polite"
                style={[
                  styles.inlineError,
                  { backgroundColor: `${colors.error}12` },
                ]}
              >
                <Text style={[styles.inlineErrorText, { color: colors.error }]}>
                  {error}
                </Text>
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel={t("community:inbox.retryA11y")}
                  onPress={() => void refresh()}
                  style={styles.inlineRetry}
                >
                  <Text
                    style={[styles.inlineRetryText, { color: colors.error }]}
                  >
                    {t("common:actions.retry")}
                  </Text>
                </AnimatedPressable>
              </View>
            )}

            {directMessages.length > 0 && (
              <View testID="direct-conversations" style={styles.section}>
                <SectionLabel
                  icon={UserRound}
                  label={t("community:inbox.privateMessages")}
                  color={colors.foreground}
                />
                <Text
                  style={[styles.sectionHint, { color: colors.textSecondary }]}
                >
                  {t("community:inbox.privateHint")}
                </Text>
                <View style={[styles.list, { backgroundColor: colors.card }]}>
                  {directMessages.map((conversation, index) => (
                    <DirectMessageRow
                      key={conversation.id}
                      conversation={conversation}
                      last={index === directMessages.length - 1}
                      busy={busyId === conversation.id}
                      colors={colors}
                      onPress={() => openDm(conversation.id)}
                      onHide={() => confirmHide(conversation)}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({
  icon: Icon,
  label,
  color,
}: {
  icon: React.ComponentType<{ size: number; color: string }>;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.sectionLabel} accessibilityRole="header">
      <Icon size={17} color={color} />
      <Text style={[styles.sectionTitle, { color }]}>{label}</Text>
    </View>
  );
}

function DirectMessageRow({
  conversation,
  last,
  busy,
  colors,
  onPress,
  onHide,
}: {
  conversation: DmConversationSummary;
  last: boolean;
  busy: boolean;
  colors: ThemeColors;
  onPress: () => void;
  onHide: () => void;
}) {
  const { t } = useTranslation('community');
  const unread = conversation.unreadCount > 0;
  return (
    <Swipeable
      overshootRight={false}
      friction={2}
      rightThreshold={36}
      renderRightActions={() => (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={t("inbox.removePersonA11y", { name: conversation.otherUser.displayName })}
          disabled={busy}
          onPress={onHide}
          style={[styles.swipeRemove, { backgroundColor: colors.error }]}
        >
          <Trash2 size={18} color="#FFFFFF" />
          <Text style={styles.swipeRemoveText}>{t("inbox.remove")}</Text>
        </AnimatedPressable>
      )}
    >
      <View
        style={[
          styles.dmRow,
          { backgroundColor: colors.card },
          !last && {
            borderBottomColor: colors.border,
            borderBottomWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        <AnimatedPressable
          testID={`dm-row-${conversation.id}`}
          accessibilityRole="button"
          accessibilityLabel={t("inbox.dmA11y", { name: conversation.otherUser.displayName, unread: unread ? t("inbox.unreadCount", { count: conversation.unreadCount }) : "", message: conversation.lastMessage.body })}
          accessibilityHint={t("inbox.removeHint")}
          accessibilityActions={[
            { name: "activate", label: t("inbox.open") },
            { name: "delete", label: t("inbox.removeInbox") },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "delete") onHide();
          }}
          onLongPress={onHide}
          onPress={onPress}
          style={styles.dmMain}
        >
          <PersonAvatar profile={conversation.otherUser} colors={colors} />
          <View style={styles.rowCopy}>
            <View style={styles.nameLine}>
              <Text
                style={[
                  styles.name,
                  { color: colors.foreground },
                  unread && styles.nameUnread,
                ]}
                numberOfLines={1}
              >
                {conversation.otherUser.displayName}
              </Text>
              {unread && (
                <View style={[styles.unreadBadge, { backgroundColor: colors.accent }]}>
                  <Text style={styles.unreadBadgeText}>
                    {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={[styles.preview, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {conversation.lastMessage.body}
            </Text>
          </View>
          <Text
            style={[
              styles.time,
              { color: unread ? colors.accent : colors.textSecondary },
            ]}
          >
            {formatRelativeTime(conversation.lastMessage.createdAt)}
          </Text>
        </AnimatedPressable>
      </View>
    </Swipeable>
  );
}

function PersonAvatar({
  profile,
  colors,
}: {
  profile: DmConversationSummary["otherUser"];
  colors: ThemeColors;
}) {
  if (profile.avatarUrl)
    return <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />;
  return (
    <View style={[styles.avatar, { backgroundColor: `${colors.accent}18` }]}>
      <Text style={[styles.avatarInitial, { color: colors.accent }]}>
        {initials(profile.displayName)}
      </Text>
    </View>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "E"
  );
}

function InboxSkeleton({ colors }: { colors: ThemeColors }) {
  const { t } = useTranslation('community');
  return (
    <View
      testID="chats-loading"
      style={styles.skeletons}
      accessibilityLabel={t("inbox.loading")}
    >
      <Skeleton height={18} width="42%" borderRadius={7} />
      {[0, 1, 2].map((key) => (
        <View
          key={key}
          style={[styles.skeletonRow, { backgroundColor: colors.card }]}
        >
          <Skeleton width={48} height={48} borderRadius={16} />
          <View style={styles.skeletonCopy}>
            <Skeleton
              height={15}
              width={key === 1 ? "64%" : "78%"}
              borderRadius={6}
            />
            <Skeleton height={12} width="48%" borderRadius={6} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 132 },
  state: { minHeight: 430, paddingHorizontal: 4 },
  section: { marginBottom: 24, gap: 8 },
  sectionLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.25 },
  sectionHint: { fontSize: 12, lineHeight: 17, marginTop: -2 },
  list: { borderRadius: 18, borderCurve: "continuous", overflow: "hidden" },
  row: { minHeight: 76 },
  rowInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 23 },
  rowCopy: { flex: 1, minWidth: 0, gap: 4 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.15,
  },
  nameUnread: { fontWeight: "900" },
  unreadDot: { width: 7, height: 7, borderRadius: 4 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: { color: '#FFFFFF', fontSize: 10, lineHeight: 12, fontWeight: '800' },
  preview: { fontSize: 12, lineHeight: 17 },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 92,
  },
  time: { flexShrink: 1, fontSize: 11, fontWeight: "600" },
  compactEmpty: {
    minHeight: 72,
    borderRadius: 18,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  compactEmptyText: { flex: 1, fontSize: 13, lineHeight: 18 },
  requestRow: { paddingHorizontal: 12, paddingVertical: 13, gap: 10 },
  requestHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  requestMessage: { fontSize: 14, lineHeight: 20, paddingLeft: 59 },
  requestActions: { flexDirection: "row", gap: 8, paddingLeft: 59 },
  requestButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  requestButtonText: { fontSize: 13, fontWeight: "800" },
  acceptText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  iconAction: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  dmRow: { minHeight: 76, flexDirection: "row", alignItems: "stretch" },
  dmMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  swipeRemove: {
    width: 94,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  swipeRemoveText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  pendingRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatarInitial: { fontSize: 14, fontWeight: "900" },
  inlineError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 14,
  },
  inlineErrorText: { flex: 1, fontSize: 12, lineHeight: 17 },
  inlineRetry: {
    minWidth: 54,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineRetryText: { fontSize: 12, fontWeight: "800" },
  skeletons: { gap: 10 },
  skeletonRow: {
    minHeight: 76,
    borderRadius: 18,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 12,
  },
  skeletonCopy: { flex: 1, gap: 8 },
});
