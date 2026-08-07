import React, { useCallback, useMemo, useState } from "react";
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ChevronRight,
  Mail,
  MessageCircle,
  ShieldOff,
  Trash2,
  UserRound,
  Users,
} from "lucide-react-native";
import {
  fetchGroups,
  isCommunityApiError,
  type CommunityGroup,
  type GroupWithMembership,
} from "@edutu/core/src/services/communities";
import {
  acceptDmRequest,
  blockDmUser,
  declineDmRequest,
  fetchDmConversations,
  fetchDmRequests,
  hideDmConversation,
  isCommunityDmApiError,
  type DmConversationSummary,
  type DmRequestSummary,
} from "@edutu/core/src/services/communityDms";
import {
  useTheme,
  type ThemeColors,
} from "../../../components/context/ThemeContext";
import { AnimatedPressable } from "../../../components/ui/AnimatedPressable";
import { Skeleton } from "../../../components/ui/Skeleton";
import { StateView } from "../../../components/state";
import { formatCompactNumber, formatRelativeTime } from "../../../lib/utils";

const LAST_READ_KEY = "edutu:discussions:lastRead";

type LastReadMap = Record<string, string>;

async function readLastRead(): Promise<LastReadMap> {
  try {
    const raw = await AsyncStorage.getItem(LAST_READ_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as LastReadMap) : {};
  } catch {
    return {};
  }
}

function newestFirst(a: GroupWithMembership, b: GroupWithMembership): number {
  const aTime = a.group.lastMessageAt ? Date.parse(a.group.lastMessageAt) : 0;
  const bTime = b.group.lastMessageAt ? Date.parse(b.group.lastMessageAt) : 0;
  return bTime - aTime;
}

function isUnread(group: CommunityGroup, lastRead: LastReadMap): boolean {
  if (!group.lastMessageAt) return false;
  const readAt = lastRead[group.id];
  return !readAt || Date.parse(group.lastMessageAt) > Date.parse(readAt);
}

/**
 * One backend-backed inbox: message requests, accepted private conversations,
 * group invitations and active group rooms. AsyncStorage is used only for the
 * legacy group-room read marker; private conversations never live on-device.
 */
export default function CommunityChatsScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { colors } = useTheme();
  const [rows, setRows] = useState<GroupWithMembership[]>([]);
  const [directMessages, setDirectMessages] = useState<DmConversationSummary[]>(
    [],
  );
  const [incomingRequests, setIncomingRequests] = useState<DmRequestSummary[]>(
    [],
  );
  const [outgoingRequests, setOutgoingRequests] = useState<DmRequestSummary[]>(
    [],
  );
  const [lastRead, setLastRead] = useState<LastReadMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const queryInbox = useCallback(async () => {
    const [nextRows, nextLastRead, nextDms, nextIncoming, nextOutgoing] =
      await Promise.all([
        fetchGroups({ mine: true, limit: 50 }, getToken),
        readLastRead(),
        fetchDmConversations({ limit: 50 }, getToken),
        fetchDmRequests("incoming", { limit: 50 }, getToken),
        fetchDmRequests("outgoing", { limit: 50 }, getToken),
      ]);
    return { nextRows, nextLastRead, nextDms, nextIncoming, nextOutgoing };
  }, [getToken]);

  const applyInbox = useCallback(
    ({
      nextRows,
      nextLastRead,
      nextDms,
      nextIncoming,
      nextOutgoing,
    }: Awaited<ReturnType<typeof queryInbox>>) => {
      setRows(nextRows);
      setLastRead(nextLastRead);
      setDirectMessages(nextDms);
      setIncomingRequests(nextIncoming);
      setOutgoingRequests(nextOutgoing);
      setError(null);
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void queryInbox()
        .then((result) => {
          if (active) applyInbox(result);
        })
        .catch((caught) => {
          if (!active) return;
          setError(
            isCommunityApiError(caught) || isCommunityDmApiError(caught)
              ? caught.message
              : "We couldn't load your conversations. Please try again.",
          );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [applyInbox, queryInbox]),
  );

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      applyInbox(await queryInbox());
    } catch (caught) {
      setError(
        isCommunityApiError(caught) || isCommunityDmApiError(caught)
          ? caught.message
          : "We couldn't refresh your conversations. Please try again.",
      );
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [applyInbox, queryInbox, refreshing]);

  const invitations = useMemo(
    () =>
      rows
        .filter((row) => row.membership?.status === "invited")
        .sort(newestFirst),
    [rows],
  );
  const conversations = useMemo(
    () =>
      rows
        .filter((row) => row.membership?.status === "active")
        .sort(newestFirst),
    [rows],
  );

  const openGroup = useCallback(
    (groupId: string) => router.push(`/discussions/${groupId}` as never),
    [router],
  );

  const openDm = useCallback(
    (conversationId: string) =>
      router.push(`/discussions/dm/${conversationId}` as never),
    [router],
  );

  const runRequestAction = useCallback(
    async (
      request: DmRequestSummary,
      action: "accept" | "decline" | "block",
    ) => {
      if (busyId) return;
      setBusyId(request.id);
      setError(null);
      try {
        if (action === "accept") {
          await acceptDmRequest(request.id, getToken);
          openDm(request.id);
        } else if (action === "decline") {
          await declineDmRequest(request.id, getToken);
          setIncomingRequests((current) =>
            current.filter((row) => row.id !== request.id),
          );
        } else {
          await blockDmUser(request.otherUser.userId, getToken);
          setIncomingRequests((current) =>
            current.filter((row) => row.id !== request.id),
          );
        }
      } catch (caught) {
        setError(
          isCommunityDmApiError(caught)
            ? caught.message
            : "That action could not be completed.",
        );
      } finally {
        setBusyId(null);
      }
    },
    [busyId, getToken, openDm],
  );

  const confirmRequestAction = useCallback(
    (request: DmRequestSummary, action: "decline" | "block") => {
      const blocking = action === "block";
      Alert.alert(
        blocking
          ? `Block ${request.otherUser.displayName}?`
          : "Decline message request?",
        blocking
          ? "They will not be able to send you private messages. You can unblock them later."
          : "The sender will not be able to continue this conversation.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: blocking ? "Block" : "Decline",
            style: "destructive",
            onPress: () => void runRequestAction(request, action),
          },
        ],
      );
    },
    [runRequestAction],
  );

  const confirmHide = useCallback(
    (conversation: DmConversationSummary) => {
      Alert.alert(
        "Remove from your inbox?",
        "This only hides the conversation for you. It does not delete the other person’s history, and a new message will bring it back.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
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
                      : "Could not remove the conversation.",
                  ),
                )
                .finally(() => setBusyId(null));
            },
          },
        ],
      );
    },
    [getToken],
  );

  const hasInboxContent =
    invitations.length > 0 ||
    conversations.length > 0 ||
    directMessages.length > 0 ||
    incomingRequests.length > 0 ||
    outgoingRequests.length > 0;

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
        ) : error && !hasInboxContent ? (
          <StateView
            state={{ kind: "error", cause: "network" }}
            flow="community"
            fill={false}
            sceneSize={154}
            style={styles.state}
            title="Conversations unavailable"
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
            title="No conversations yet"
            body="Message a member or join a community. Private message requests and group conversations will appear here."
            actionLabel="Explore communities"
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
                  accessibilityLabel="Retry loading conversations"
                  onPress={() => void refresh()}
                  style={styles.inlineRetry}
                >
                  <Text
                    style={[styles.inlineRetryText, { color: colors.error }]}
                  >
                    Retry
                  </Text>
                </AnimatedPressable>
              </View>
            )}

            {incomingRequests.length > 0 && (
              <View testID="dm-requests" style={styles.section}>
                <SectionLabel
                  icon={Mail}
                  label="Message requests"
                  color={colors.accent}
                />
                <Text
                  style={[styles.sectionHint, { color: colors.textSecondary }]}
                >
                  Read the first message before choosing who can contact you.
                </Text>
                <View style={[styles.list, { backgroundColor: colors.card }]}>
                  {incomingRequests.map((request, index) => (
                    <RequestRow
                      key={request.id}
                      request={request}
                      last={index === incomingRequests.length - 1}
                      busy={busyId === request.id}
                      colors={colors}
                      onAccept={() => void runRequestAction(request, "accept")}
                      onDecline={() => confirmRequestAction(request, "decline")}
                      onBlock={() => confirmRequestAction(request, "block")}
                    />
                  ))}
                </View>
              </View>
            )}

            {directMessages.length > 0 && (
              <View testID="direct-conversations" style={styles.section}>
                <SectionLabel
                  icon={UserRound}
                  label="Private messages"
                  color={colors.foreground}
                />
                <Text
                  style={[styles.sectionHint, { color: colors.textSecondary }]}
                >
                  Only you and the other person can see these messages.
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

            {outgoingRequests.length > 0 && (
              <View testID="sent-dm-requests" style={styles.section}>
                <SectionLabel
                  icon={Mail}
                  label="Sent requests"
                  color={colors.textSecondary}
                />
                <View style={[styles.list, { backgroundColor: colors.card }]}>
                  {outgoingRequests.map((request, index) => (
                    <PendingRequestRow
                      key={request.id}
                      request={request}
                      last={index === outgoingRequests.length - 1}
                      colors={colors}
                    />
                  ))}
                </View>
              </View>
            )}

            {invitations.length > 0 && (
              <View testID="chat-invitations" style={styles.section}>
                <SectionLabel
                  icon={Mail}
                  label="Invitations"
                  color={colors.accent}
                />
                <View style={[styles.list, { backgroundColor: colors.card }]}>
                  {invitations.map((row, index) => (
                    <ConversationRow
                      key={row.group.id}
                      group={row.group}
                      invited
                      unread={isUnread(row.group, lastRead)}
                      last={index === invitations.length - 1}
                      colors={colors}
                      onPress={() => openGroup(row.group.id)}
                    />
                  ))}
                </View>
              </View>
            )}

            <View testID="group-conversations" style={styles.section}>
              <SectionLabel
                icon={MessageCircle}
                label="Group conversations"
                color={colors.foreground}
              />
              <Text
                style={[styles.sectionHint, { color: colors.textSecondary }]}
              >
                Messages here are visible to the whole group.
              </Text>
              {conversations.length > 0 ? (
                <View style={[styles.list, { backgroundColor: colors.card }]}>
                  {conversations.map((row, index) => (
                    <ConversationRow
                      key={row.group.id}
                      group={row.group}
                      unread={isUnread(row.group, lastRead)}
                      last={index === conversations.length - 1}
                      colors={colors}
                      onPress={() => openGroup(row.group.id)}
                    />
                  ))}
                </View>
              ) : (
                <View
                  style={[
                    styles.compactEmpty,
                    { backgroundColor: colors.card },
                  ]}
                >
                  <Users size={20} color={colors.textSecondary} />
                  <Text
                    style={[
                      styles.compactEmptyText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Accept an invitation or join a community to begin.
                  </Text>
                </View>
              )}
            </View>
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

function ConversationRow({
  group,
  invited = false,
  unread,
  last,
  colors,
  onPress,
}: {
  group: CommunityGroup;
  invited?: boolean;
  unread: boolean;
  last: boolean;
  colors: ThemeColors;
  onPress: () => void;
}) {
  const activity = group.lastMessageAt
    ? formatRelativeTime(group.lastMessageAt)
    : "No messages yet";
  const countCopy = `${formatCompactNumber(group.memberCount)} ${group.memberCount === 1 ? "member" : "members"}`;
  const accessibilityLabel = invited
    ? `${group.name}, group invitation, ${countCopy}`
    : `${group.name}, ${unread ? "unread messages, " : ""}${countCopy}, ${activity}`;

  return (
    <AnimatedPressable
      testID={`chat-row-${group.id}`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={
        invited
          ? "Opens the invitation preview"
          : "Opens the group conversation"
      }
      onPress={onPress}
      hapticFeedback="selection"
      scaleTo={0.985}
      style={[
        styles.row,
        !last && {
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={styles.rowInner}>
        <View
          style={[styles.avatar, { backgroundColor: `${colors.accent}18` }]}
        >
          <Text style={styles.emoji} accessibilityElementsHidden>
            {group.coverEmoji || "💬"}
          </Text>
        </View>

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
              {group.name}
            </Text>
            {unread && (
              <View
                testID={`chat-unread-${group.id}`}
                style={[styles.unreadDot, { backgroundColor: colors.accent }]}
              />
            )}
          </View>
          <Text
            style={[styles.preview, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {invited
              ? `You're invited · ${countCopy}`
              : `${countCopy} · ${formatCompactNumber(group.messageCount)} messages`}
          </Text>
        </View>

        <View style={styles.trailing}>
          <Text
            style={[
              styles.time,
              { color: unread ? colors.accent : colors.textSecondary },
            ]}
            numberOfLines={1}
          >
            {invited ? "Review" : activity}
          </Text>
          <ChevronRight size={17} color={colors.textSecondary} />
        </View>
      </View>
    </AnimatedPressable>
  );
}

function RequestRow({
  request,
  last,
  busy,
  colors,
  onAccept,
  onDecline,
  onBlock,
}: {
  request: DmRequestSummary;
  last: boolean;
  busy: boolean;
  colors: ThemeColors;
  onAccept: () => void;
  onDecline: () => void;
  onBlock: () => void;
}) {
  return (
    <View
      style={[
        styles.requestRow,
        !last && {
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
      accessibilityLabel={`Message request from ${request.otherUser.displayName}: ${request.firstMessage.body}`}
    >
      <View style={styles.requestHeader}>
        <PersonAvatar profile={request.otherUser} colors={colors} />
        <View style={styles.rowCopy}>
          <Text
            style={[styles.name, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {request.otherUser.displayName}
          </Text>
          <Text style={[styles.time, { color: colors.textSecondary }]}>
            {formatRelativeTime(request.createdAt)}
          </Text>
        </View>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={`Block ${request.otherUser.displayName}`}
          disabled={busy}
          onPress={onBlock}
          style={styles.iconAction}
        >
          <ShieldOff size={18} color={colors.error} />
        </AnimatedPressable>
      </View>
      <Text
        style={[styles.requestMessage, { color: colors.foreground }]}
        numberOfLines={3}
      >
        “{request.firstMessage.body}”
      </Text>
      <View style={styles.requestActions}>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={`Decline ${request.otherUser.displayName}'s message request`}
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={onDecline}
          style={[styles.requestButton, { borderColor: colors.border }]}
        >
          <Text
            style={[styles.requestButtonText, { color: colors.foreground }]}
          >
            Decline
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={`Accept ${request.otherUser.displayName}'s message request`}
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={onAccept}
          style={[styles.requestButton, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.acceptText}>{busy ? "Working…" : "Accept"}</Text>
        </AnimatedPressable>
      </View>
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
  const unread = conversation.unreadCount > 0;
  return (
    <Swipeable
      overshootRight={false}
      friction={2}
      rightThreshold={36}
      renderRightActions={() => (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={`Remove conversation with ${conversation.otherUser.displayName} from your inbox`}
          disabled={busy}
          onPress={onHide}
          style={[styles.swipeRemove, { backgroundColor: colors.error }]}
        >
          <Trash2 size={18} color="#FFFFFF" />
          <Text style={styles.swipeRemoveText}>Remove</Text>
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
          accessibilityLabel={`${conversation.otherUser.displayName}, ${unread ? `${conversation.unreadCount} unread, ` : ""}${conversation.lastMessage.body}`}
          accessibilityHint="Swipe left to remove this conversation from your inbox."
          accessibilityActions={[
            { name: "activate", label: "Open" },
            { name: "delete", label: "Remove from inbox" },
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
                <View
                  style={[styles.unreadDot, { backgroundColor: colors.accent }]}
                />
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

function PendingRequestRow({
  request,
  last,
  colors,
}: {
  request: DmRequestSummary;
  last: boolean;
  colors: ThemeColors;
}) {
  return (
    <View
      style={[
        styles.pendingRow,
        !last && {
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <PersonAvatar profile={request.otherUser} colors={colors} />
      <View style={styles.rowCopy}>
        <Text
          style={[styles.name, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {request.otherUser.displayName}
        </Text>
        <Text
          style={[styles.preview, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          Waiting for a response · {request.firstMessage.body}
        </Text>
      </View>
    </View>
  );
}

function PersonAvatar({
  profile,
  colors,
}: {
  profile: DmRequestSummary["otherUser"];
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
  return (
    <View
      testID="chats-loading"
      style={styles.skeletons}
      accessibilityLabel="Loading conversations"
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
