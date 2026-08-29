import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth, useUser } from "@clerk/clerk-expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Ban,
  ChevronRight,
  Clock,
  Flag,
  Info,
  Lock,
  MessageCircle,
  MoreVertical,
  Pin,
  PhoneCall,
  Settings,
  ShieldAlert,
  UserCheck,
} from "lucide-react-native";
import {
  deleteMessage,
  createCommunityAttachmentUpload,
  fetchBlockedUsers,
  fetchGroup,
  fetchGroupForm,
  fetchJoinRequests,
  isCommunityApiError,
  joinGroup,
  removeMember,
  sendMessage,
  serializeCommunityAttachment,
  reportTarget,
  unblockUser,
  type BlockedUser,
  type CommunityMessage,
  type GroupDetail,
  type GroupQuestion,
  type JoinRequestAnswer,
  type MembershipStatus,
} from "@edutu/core/src/services/communities";
import { resolveAdminRole } from "@edutu/core/src/services/communityAuthz";
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { StateView } from "../../../components/state";
import { Skeleton } from "../../../components/ui/Skeleton";
import { AnimatedPressable } from "../../../components/ui/AnimatedPressable";
import { useTheme } from "../../../components/context/ThemeContext";
import { MessageBubble } from "../../../components/community/MessageBubble";
import { Composer } from "../../../components/community/Composer";
import type { PickedCommunityAttachment } from "../../../components/community/Composer";
import { OpportunitySharePicker } from "../../../components/community/OpportunitySharePicker";
import type { Opportunity } from "@edutu/core/src/types/opportunity";
import { uploadPrivateCommunityAsset } from "@edutu/core/src/services/storage";
import { GroupAvatar } from "../../../components/community/GroupAvatar";
import { getCommunityGroupCoverUrl } from "../../../lib/communityDiscovery";
import {
  markGroupRead,
} from "../../../lib/communityReadState";
import {
  GroupContentTabs,
  useGroupContentSwipe,
  type GroupContentTab,
} from "../../../components/community/GroupContentTabs";
import GroupAboutScreen from "./[id]/about";
import {
  FirstPostNotice,
  hasAcknowledgedFirstPost,
} from "../../../components/community/FirstPostNotice";
import {
  useGroupMessages,
  type LocalMessage,
} from "../../../hooks/useGroupMessages";
import { ScheduledCallCard } from "../../../components/community/calls/ScheduledCallCard";
import {
  listCommunityCalls,
  type CommunityCall,
} from "../../../features/community-calls/api";

/**
 * One group's chat, and the gate in front of it.
 *
 * THE GATE IS THE SCREEN'S REAL SUBJECT. Membership has five states and they are
 * not interchangeable:
 *
 *   active   full chat.
 *   invited  an owner put them here. They preview the room and accept — this is
 *            the ONLY way into a private group, so it has to work.
 *   pending  they applied and nobody has approved them. They wait, and they must
 *            NOT see messages: showing the room to an unapproved applicant is
 *            the leak the approval queue exists to prevent.
 *   removed  they were taken out. They may ask again.
 *   banned   terminal. A moderator decided; the client never offers a way back,
 *            because a "try again" button on a ban is a lie with a retry loop.
 *
 * The request-to-join form expands INLINE here rather than opening a screen or
 * a modal. It is the one form in this feature that is not its own destination:
 * it interrupts a browse — somebody tapped a group to read it — so taking over
 * the screen would lose the thing they were looking at (DESIGN.md §5.2).
 */

/**
 * Read by the browse screen to decide which groups are unread. Duplicated from
 * `discussions/index.tsx` deliberately: the two screens are the writer and the
 * reader of the same contract, and the key is asserted in the test suite, so a
 * shared module would only add indirection to a five-character string.
 */
export { markGroupRead } from "../../../lib/communityReadState";

/**
 * The device's copy of the caller's block list, mirroring the server's
 * `user_blocks`. See `visibleMessages` for why the client keeps one at all.
 */
const BLOCKED_KEY = "edutu:community:blocked";

/**
 * Ids of messages this reader has reported.
 *
 * WHY IT IS PERSISTED. A report hides the message — that is the whole of what a
 * report visibly does in this release. Holding that in component state made it
 * survive exactly until the screen unmounted, so a person who reported
 * something abusive met it again on the next launch and reasonably concluded
 * the report did nothing. Hiding is a promise; a promise that lasts one session
 * is not one.
 */
const REPORTED_KEY = "edutu:community:reportedMessages";
const PINNED_KEY = "edutu:community:pinnedMessages";
const MAX_MESSAGE_LENGTH = 2000;

function replyPrefix(message: LocalMessage): string {
  const author = message.author?.displayName?.trim() || "Member";
  const excerpt = message.body.replace(/\s+/g, " ").trim().slice(0, 120);
  return `↪ ${author}: ${excerpt}\n`;
}

function callIdFromMessage(message: LocalMessage): string | null {
  if (message.callId) return message.callId;
  if (message.kind !== "call") return null;
  try {
    const body = JSON.parse(message.body) as {
      callId?: unknown;
      call_id?: unknown;
    };
    const value = body.callId ?? body.call_id;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Stamp this group as read. Read-modify-write on one JSON blob, because the
 * browse screen reads every group's mark in a single `getItem`.
 */
/**
 * WHO MAY ADMINISTER THIS GROUP is decided by
 * `@edutu/core/src/services/communityAuthz`, imported above, and by nothing
 * else on this screen. It used to be a hand-copied mirror of the backend's
 * `community-authz.ts` living here; the three Critical findings this feature
 * has already produced were all "two places that must agree, disagreeing", so
 * the copy went and the import stayed. Do not re-derive a role below.
 */

/** One JSON string array in AsyncStorage, read defensively. */
async function readIdList(key: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

async function addToIdList(key: string, id: string): Promise<string[]> {
  const next = await readIdList(key);
  if (!next.includes(id)) next.push(id);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(next));
  } catch {
    // A failed write costs the hide on the NEXT launch, never this one.
  }
  return next;
}

async function removeFromIdList(key: string, id: string): Promise<string[]> {
  const next = (await readIdList(key)).filter((value) => value !== id);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(next));
  } catch {
    // As above.
  }
  return next;
}

const GROUP_CONTENT_TAB_INDEX: Record<GroupContentTab, number> = {
  posts: 0,
  resources: 1,
  about: 2,
};

export default function GroupChatScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    tab?: string | string[];
  }>();
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const activeTab: GroupContentTab =
    requestedTab === "resources"
      ? "resources"
      : requestedTab === "about"
        ? "about"
        : "posts";
  const previousTab = useRef<GroupContentTab>(activeTab);
  const [tabTransition] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (previousTab.current === activeTab) return;
    const direction =
      GROUP_CONTENT_TAB_INDEX[activeTab] >
      GROUP_CONTENT_TAB_INDEX[previousTab.current]
        ? 1
        : -1;
    previousTab.current = activeTab;
    tabTransition.setValue(direction * 28);
    const animation = Animated.timing(tabTransition, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [activeTab, tabTransition]);

  return (
    <Animated.View
      style={{
        flex: 1,
        transform: [{ translateX: tabTransition }],
      }}
    >
      {activeTab === "posts" ? <GroupChatPostsScreen /> : <GroupAboutScreen />}
    </Animated.View>
  );
}

function GroupChatPostsScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const groupId = Array.isArray(params.id)
    ? (params.id[0] ?? "")
    : (params.id ?? "");

  const { getToken } = useAuth();
  const { user } = useUser();
  const { t } = useTranslation(["community", "common"]);
  const { colors } = useTheme();
  const router = useRouter();

  const userId = user?.id ?? null;

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  /**
   * Reported messages as they stood WHEN THIS SCREEN OPENED, and deliberately
   * not as they stand now: reporting inside this session is answered by the
   * bubble itself, which keeps the row in place and says who was told. Folding
   * a fresh report into this list instead would make the message silently
   * vanish mid-conversation. What this list is for is the next launch.
   */
  const [reportedAtOpen, setReportedAtOpen] = useState<string[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<LocalMessage | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentProgress, setAttachmentProgress] = useState(0);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [opportunityPickerOpen, setOpportunityPickerOpen] = useState(false);
  const [opportunitySending, setOpportunitySending] = useState(false);
  const listRef = useRef<FlatList<LocalMessage>>(null);
  /** Set when the group is loaded — see `loadDetail` for why not in render. */
  const [expired, setExpired] = useState(false);

  const group = detail?.group ?? null;
  const membership = detail?.membership ?? null;
  const status: MembershipStatus | null = membership?.status ?? null;

  /** Only an active member chats. */
  const isMember = status === "active";
  /**
   * An invitee previews the room before deciding — that preview is the entire
   * value of an invitation. Everybody else below `active` reads nothing, and
   * `pending` most of all.
   */
  const canRead = status === "active" || status === "invited";
  const [communityCalls, setCommunityCalls] = useState<CommunityCall[]>([]);

  const messages = useGroupMessages({
    groupId,
    getAuthToken: getToken,
    enabled: canRead,
    userId,
  });

  // ── Group + membership ─────────────────────────────────────────────────────
  const loadDetail = useCallback(async () => {
    if (!groupId) return;
    setDetailError(null);
    try {
      const next = await fetchGroup(groupId, getToken);
      setDetail(next);
      // The clock is read here, in an async callback, and never in the render
      // body: `Date.now()` during render makes the component non-idempotent
      // (react-hooks/purity). An opportunity-linked group's expiry is a fact
      // about the world, not about this paint.
      setExpired(
        !!next.group.expiresAt && Date.parse(next.group.expiresAt) < Date.now(),
      );
    } catch (caught) {
      // "This group is private. Ask an owner for an invite." is the server's
      // sentence and the only useful thing to say here.
      setDetailError(
        isCommunityApiError(caught)
          ? caught.message
          : t("common:errors.generic"),
      );
    }
  }, [groupId, getToken, t]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadDetail();
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDetail]);

  useEffect(() => {
    void (async () => {
      const [blockedIds, reportedIds] = await Promise.all([
        readIdList(BLOCKED_KEY),
        readIdList(REPORTED_KEY),
      ]);
      setBlocked(blockedIds);
      setReportedAtOpen(reportedIds);
    })();
  }, []);

  useEffect(() => {
    void readIdList(`${PINNED_KEY}:${groupId}`).then(setPinnedIds);
  }, [groupId]);

  // ── The first-post notice ──────────────────────────────────────────────────
  // `null` while the flag is being read. The composer stays shut until the
  // answer is known, so the gate can never be beaten by being fast: a first
  // post that slips out during a disk read is exactly the post the App Store
  // requires the notice in front of.
  const [firstPostAcknowledged, setFirstPostAcknowledged] = useState<
    boolean | null
  >(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const acknowledged = await hasAcknowledgedFirstPost();
      if (!cancelled) setFirstPostAcknowledged(acknowledged);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Unread ─────────────────────────────────────────────────────────────────
  // The browse screen compares each group's `lastMessageAt` against this map, so
  // a chat that never writes it leaves every group permanently unread. Keyed on
  // the newest message so a live arrival while the screen is open is marked too.
  const newestAt = messages.newestAt;
  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!groupId || !canRead) return;
    const at = newestAt ?? group?.lastMessageAt ?? null;
    if (!at || markedRef.current === at) return;
    markedRef.current = at;
    void markGroupRead(groupId, at);
  }, [groupId, canRead, newestAt, group?.lastMessageAt]);

  // ── Moderation ─────────────────────────────────────────────────────────────
  /**
   * THE CLIENT-SIDE BLOCK FILTER IS THE SECOND LAYER. DO NOT DELETE IT AS
   * REDUNDANT.
   *
   * `MessagesService.list` filters blocked authors on the server, and that
   * covers REST pages — the history you scroll. It does NOT cover the live
   * stream: Supabase Realtime publishes straight from Postgres replication and
   * never passes through the service, so a blocked member's NEW messages arrive
   * on the socket having been filtered by nothing at all. Without this pass a
   * block works on relaunch and fails while you are watching.
   *
   * The reported-ids pass beside it is durable for the reason given at
   * REPORTED_KEY: a report that stops hiding on relaunch reads as a report that
   * did nothing.
   */
  const visibleMessages = useMemo(
    () =>
      blocked.length === 0 && reportedAtOpen.length === 0
        ? messages.messages
        : messages.messages.filter(
            (message) =>
              !blocked.includes(message.userId) &&
              !reportedAtOpen.includes(message.id),
          ),
    [messages.messages, blocked, reportedAtOpen],
  );

  const pinnedMessages = useMemo(
    () =>
      visibleMessages.filter(
        (message) => pinnedIds.includes(message.id) && !message.deletedAt,
      ),
    [pinnedIds, visibleMessages],
  );

  const handleBlock = useCallback(async (message: CommunityMessage) => {
    if (!message.userId) return;
    // The bubble has already written the block to the server; this is the copy
    // that filters the socket. See `visibleMessages`.
    setBlocked(await addToIdList(BLOCKED_KEY, message.userId));
  }, []);

  const handleUnblock = useCallback(async (userId: string) => {
    setBlocked(await removeFromIdList(BLOCKED_KEY, userId));
  }, []);

  const togglePin = useCallback(
    async (message: CommunityMessage) => {
      const key = `${PINNED_KEY}:${groupId}`;
      const current = await readIdList(key);
      const next = current.includes(message.id)
        ? current.filter((id) => id !== message.id)
        : [...current, message.id];
      try {
        await AsyncStorage.setItem(key, JSON.stringify(next));
      } catch {
        // The message remains usable if local persistence is unavailable.
      }
      setPinnedIds(next);
    },
    [groupId],
  );

  const handleReport = useCallback(
    async (message: CommunityMessage) => {
      await reportTarget(
        {
          targetType: "message",
          targetId: message.id,
          reason: "member_report",
        },
        getToken,
      );
      // Recorded, not applied — `reportedAtOpen` is the next launch's filter.
      await addToIdList(REPORTED_KEY, message.id);
    },
    [getToken],
  );

  const handleDelete = useCallback(
    async (message: CommunityMessage) => {
      // The response is the tombstone, not an absence — fold it back in so the
      // row stays put with blanked text rather than vanishing.
      messages.applyMessage(await deleteMessage(message.id, getToken));
    },
    [messages, getToken],
  );

  /**
   * Remove somebody from the group.
   *
   * The bubble can do this itself, and did — which left the screen holding a
   * roster that still counted the person who had just been thrown out, until
   * something else happened to refetch. Removing changes `member_count` and can
   * change the caller's own standing, so the group is re-read afterwards.
   */
  const handleRemoveMember = useCallback(
    async (message: CommunityMessage) => {
      await removeMember(message.groupId, message.userId, getToken);
      await loadDetail();
    },
    [getToken, loadDetail],
  );

  // ── Rights ─────────────────────────────────────────────────────────────────
  // One derivation, mirroring the backend, feeding every gated affordance on
  // the screen. Nothing below re-tests a role by hand.
  const adminRole = useMemo(
    () => resolveAdminRole(group, userId, membership),
    [group, userId, membership],
  );

  const canModerate = adminRole !== null;
  /** Settings holds the group's identity and the screening form: owner only. */
  const canOpenSettings = adminRole === "owner";
  /**
   * Owner OR mod. A mod who cannot open the one queue they exist to review is a
   * cosmetic role, which is exactly what an earlier review found.
   */
  const canReviewRequests = adminRole !== null;
  /**
   * Any active member who is not the owner. Reporting your own group is
   * meaningless, and a non-member has no room to report from.
   */
  const canReportGroup = isMember && adminRole !== "owner";
  const loadCommunityCalls = useCallback(async () => {
    if (!groupId || !canRead) return;
    try {
      setCommunityCalls(await listCommunityCalls(groupId, getToken));
    } catch {
      /* Calls degrade independently from chat. */
    }
  }, [canRead, getToken, groupId]);
  useFocusEffect(
    useCallback(() => {
      void loadCommunityCalls();
    }, [loadCommunityCalls]),
  );
  const highlightedCall =
    communityCalls.find(
      (call) => call.status === "live" || call.status === "starting",
    ) ??
    communityCalls.find((call) => call.status === "scheduled") ??
    null;

  // ── The pending-request signal ─────────────────────────────────────────────
  // Without it an owner has no way to learn that anybody is waiting: nothing
  // else in the app mentions the queue. A failure leaves the count `null` and
  // the entry point unbadged — the queue is still one tap away.
  //
  // ON FOCUS, not on mount. Approving somebody happens on the requests screen
  // and the owner then comes STRAIGHT BACK here — a count fetched once at mount
  // is stale at precisely the moment it is looked at, and a badge that still
  // says 3 after you cleared the queue teaches people to distrust it.
  const [pendingRequests, setPendingRequests] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!groupId || !canReviewRequests) return undefined;
      let cancelled = false;
      void (async () => {
        try {
          const rows = await fetchJoinRequests(groupId, getToken);
          if (!cancelled) {
            setPendingRequests(
              rows.filter((row) => row.status === "pending").length,
            );
          }
        } catch {
          // A badge is a nicety. It must never surface as an error on a chat.
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [groupId, canReviewRequests, getToken]),
  );

  // ── The header menu ────────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * Block is one mis-tap away in a row action sheet the width of a bubble, and
   * until now nothing in the app could undo it. Any member gets the list.
   */
  const canManageBlocks = isMember;
  const canOpenAbout = canRead;
  const hasMenu =
    canOpenAbout ||
    canOpenSettings ||
    canReviewRequests ||
    canReportGroup ||
    canManageBlocks ||
    canModerate;

  const goTo = useCallback(
    (path: string) => {
      setMenuOpen(false);
      // `as never`: typed routes cannot narrow a template literal, and this is
      // the same cast `discussions/index.tsx` uses to open this screen.
      router.push(path as never);
    },
    [router],
  );

  // ── Send ───────────────────────────────────────────────────────────────────
  /**
   * Nobody posts before they have been shown the house rules once. The flag is
   * device-local and once ever, not once per group — the rules are the same
   * room to room — and `!== true` rather than `=== false` so the unread state
   * gates too.
   */
  const firstPostBlocked = firstPostAcknowledged !== true;

  const handleSend = useCallback(async () => {
    // The composer is disabled while the notice stands; this is the same rule
    // stated where it cannot be routed around.
    if (firstPostBlocked) return;
    const body = replyTo ? `${replyPrefix(replyTo)}${draft.trim()}` : draft;
    const ok = await messages.send(body);
    // Cleared ONLY on success. A screener refusal keeps every character.
    if (ok) {
      setDraft("");
      setReplyTo(null);
    }
  }, [firstPostBlocked, messages, draft, replyTo]);

  const handleChangeDraft = useCallback(
    (value: string) => {
      setDraft(value);
      if (messages.sendError) messages.clearSendError();
    },
    [messages],
  );

  const handleAttachment = useCallback(
    async (attachment: PickedCommunityAttachment) => {
      if (firstPostBlocked || attachmentUploading) return;
      setAttachmentUploading(true);
      setAttachmentProgress(0);
      setAttachmentError(null);
      try {
        const reservation = await createCommunityAttachmentUpload(
          groupId,
          {
            kind: attachment.kind,
            name: attachment.name,
            mime: attachment.mime,
            size: attachment.size,
          },
          getToken,
        );
        await uploadPrivateCommunityAsset(
          reservation.uploadUrl,
          { uri: attachment.uri, type: attachment.mime },
          setAttachmentProgress,
        );
        const body = serializeCommunityAttachment(attachment.kind, {
          url: reservation.resourceUrl,
          name: attachment.name,
          mime: attachment.mime,
          size: attachment.size,
          ...(attachment.caption ? { caption: attachment.caption } : {}),
        });
        const persisted = await sendMessage(
          groupId,
          { kind: attachment.kind, body },
          getToken,
        );
        messages.applyMessage(persisted);
        setDraft("");
      } catch (caught) {
        const message = isCommunityApiError(caught)
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "The attachment could not be sent. Please try again.";
        setAttachmentError(message);
        throw new Error(message);
      } finally {
        setAttachmentUploading(false);
      }
    },
    [attachmentUploading, firstPostBlocked, getToken, groupId, messages],
  );

  const handleShareOpportunity = useCallback(
    async (opportunity: Opportunity) => {
      if (firstPostBlocked || opportunitySending) return;
      setOpportunitySending(true);
      setAttachmentError(null);
      try {
        const persisted = await sendMessage(
          groupId,
          { kind: "opportunity", opportunityId: opportunity.id },
          getToken,
        );
        messages.applyMessage(persisted);
        setOpportunityPickerOpen(false);
      } catch (caught) {
        setAttachmentError(
          isCommunityApiError(caught)
            ? caught.message
            : caught instanceof Error
              ? caught.message
              : "That opportunity could not be shared.",
        );
      } finally {
        setOpportunitySending(false);
      }
    },
    [firstPostBlocked, getToken, groupId, messages, opportunitySending],
  );

  // ── Posting availability ───────────────────────────────────────────────────
  const archived = !!group?.archivedAt;
  const postingDisabled = archived || expired;
  const postingNotice = archived
    ? t("community:groupState.archivedReadOnly")
    : expired
      ? t("community:groupState.expiredDesc")
      : undefined;

  const headerTitle = group?.name ?? t("community:screens.chatTitle");
  const headerSubtitle = group
    ? status === "invited"
      ? `${group.memberCount} ${group.memberCount === 1 ? "member" : "members"} · Invitation preview`
      : `${group.memberCount} ${group.memberCount === 1 ? "member" : "members"} · Posts`
    : undefined;
  const composerMaxLength = replyTo
    ? Math.max(1, MAX_MESSAGE_LENGTH - replyPrefix(replyTo).length)
    : MAX_MESSAGE_LENGTH;

  const jumpToPinned = useCallback(() => {
    const target = pinnedMessages[0];
    if (!target) return;
    const index = visibleMessages.findIndex(
      (message) => message.id === target.id,
    );
    if (index >= 0) {
      listRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    }
  }, [pinnedMessages, visibleMessages]);

  const renderItem = useCallback(
    ({ item }: { item: LocalMessage }) => {
      const callId = callIdFromMessage(item);
      const transcriptCall = callId
        ? communityCalls.find((call) => call.id === callId)
        : null;
      return transcriptCall ? (
        <ScheduledCallCard
          call={transcriptCall}
          viewerRole={adminRole}
          onPress={() =>
            router.push(
              `/discussions/${groupId}/calls/${transcriptCall.id}` as never,
            )
          }
        />
      ) : (
        <MessageBubble
          message={item}
          own={!!userId && item.userId === userId}
          pending={item.pending}
          canDelete={(!!userId && item.userId === userId) || canModerate}
          onReport={handleReport}
          onBlock={handleBlock}
          onDelete={handleDelete}
          // Without this the bubble calls `removeMember` itself and the screen
          // never learns the roster changed.
          onRemoveMember={handleRemoveMember}
          onReply={(message) => setReplyTo(message as LocalMessage)}
          onPin={togglePin}
          pinned={pinnedIds.includes(item.id)}
        />
      );
    },
    [
      userId,
      canModerate,
      handleReport,
      handleBlock,
      handleDelete,
      handleRemoveMember,
      togglePin,
      pinnedIds,
      communityCalls,
      adminRole,
      router,
      groupId,
    ],
  );

  // Once group access is known, keep the room chrome and composer mounted
  // while message history refreshes. Replacing the whole screen with a
  // skeleton during a background fetch made typed drafts and picker actions
  // disappear under the user's finger.
  const busy = detailLoading;
  const tabSwipeHandlers = useGroupContentSwipe(groupId, "posts");

  return (
    <SafeAreaView
      {...tabSwipeHandlers}
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={["top", "bottom"]}
    >
      <ScreenHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        showBack
        titleAccessory={
          group ? (
            <GroupAvatar
              testID="chat-group-avatar"
              resourceUrl={group.coverImageResourceUrl}
              imageUrl={getCommunityGroupCoverUrl(group.slug)}
              emoji={group.coverEmoji}
              size={36}
              radius={11}
            />
          ) : undefined
        }
        right={
          // ONE affordance, not one button per feature. Settings, the request
          // queue and report-group all live behind this kebab, so the header
          // does not grow a control every time the feature does (DESIGN.md §5).
          hasMenu ? (
            <AnimatedPressable
              testID="chat-menu-trigger"
              accessibilityRole="button"
              accessibilityLabel={t("community:actions.groupOptions")}
              accessibilityState={{ expanded: menuOpen }}
              hapticFeedback="selection"
              scaleTo={0.94}
              onPress={() => setMenuOpen((open) => !open)}
              hitSlop={8}
              style={[styles.headerAction, { backgroundColor: colors.card }]}
            >
              <MoreVertical size={20} color={colors.foreground} />
            </AnimatedPressable>
          ) : undefined
        }
      />

      {menuOpen && hasMenu && (
        <GroupHeaderMenu
          groupId={groupId}
          canOpenAbout={canOpenAbout}
          canOpenSettings={canOpenSettings}
          canReviewRequests={canReviewRequests}
          canReportGroup={canReportGroup}
          canManageBlocks={canManageBlocks}
          canScheduleCalls={canModerate}
          pendingRequests={pendingRequests}
          onNavigate={goTo}
          onUnblocked={handleUnblock}
        />
      )}

      {group && canRead && (
        <GroupContentTabs groupId={groupId} active="posts" />
      )}

      {canRead && highlightedCall && (
        <ScheduledCallCard
          call={highlightedCall}
          viewerRole={adminRole}
          compact
          onPress={() =>
            router.push(
              `/discussions/${groupId}/calls/${highlightedCall.id}` as never,
            )
          }
        />
      )}

      {canRead && pinnedMessages.length > 0 && (
        <PinnedMessageBar
          count={pinnedMessages.length}
          message={pinnedMessages[0]!}
          onPress={jumpToPinned}
        />
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Loading is skeleton bubbles in place — never a spinner floating over
            content (DESIGN.md §2). */}
        {busy ? (
          <View testID="chat-skeleton" style={styles.skeletonWrap}>
            {[0, 1, 2, 3].map((key) => (
              <Skeleton
                key={key}
                height={54}
                width={key % 2 === 0 ? "72%" : "58%"}
                borderRadius={18}
                style={key % 2 === 0 ? styles.skelLeft : styles.skelRight}
              />
            ))}
          </View>
        ) : detailError ? (
          <View style={styles.stateWrap}>
            <View
              testID="chat-error"
              style={[
                styles.errorBox,
                {
                  borderColor: colors.error,
                  backgroundColor: `${colors.error}12`,
                },
              ]}
            >
              <Text style={[styles.errorText, { color: colors.error }]}>
                {detailError}
              </Text>
              <AnimatedPressable
                testID="chat-error-retry"
                accessibilityRole="button"
                accessibilityLabel={t("common:actions.retry")}
                onPress={() => void loadDetail()}
                style={[styles.retryButton, { borderColor: colors.error }]}
              >
                <Text style={[styles.retryLabel, { color: colors.error }]}>
                  {t("common:actions.retry")}
                </Text>
              </AnimatedPressable>
            </View>
          </View>
        ) : (
          <>
            {canRead ? (
              messages.error && visibleMessages.length === 0 ? (
                <View style={styles.stateWrap}>
                  <View testID="chat-messages-error-state">
                    <StateView
                      state={{ kind: "error", cause: "network" }}
                      flow="community"
                      fill={false}
                      sceneSize={132}
                      title="Messages unavailable"
                      body={messages.error}
                      onRetry={() => void messages.refresh()}
                    />
                  </View>
                </View>
              ) : visibleMessages.length === 0 ? (
                <View style={styles.stateWrap}>
                  <View testID="chat-empty">
                    <StateView
                      state={{ kind: "empty", reason: "firstRun" }}
                      flow="community"
                      fill={false}
                      sceneSize={140}
                      title={t("community:chat.emptyTitle")}
                      body={t("community:chat.emptyBody")}
                    />
                  </View>
                </View>
              ) : (
                <FlatList
                  ref={listRef}
                  testID="chat-list"
                  data={visibleMessages}
                  keyExtractor={(item) => item.id}
                  renderItem={renderItem}
                  // Inverted: newest at the bottom where a reader looks, and the
                  // list's "end" is the OLDEST message, so reaching it is what
                  // asks for the previous keyset page.
                  inverted
                  onEndReachedThreshold={0.4}
                  onEndReached={() => void messages.loadOlder()}
                  contentContainerStyle={styles.listContent}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={
                    Platform.OS === "ios" ? "interactive" : "on-drag"
                  }
                  maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                  onScrollToIndexFailed={({ index }) => {
                    listRef.current?.scrollToOffset({
                      offset: Math.max(0, index * 70),
                      animated: true,
                    });
                  }}
                  ListFooterComponent={
                    messages.loadingMore ? (
                      <ActivityIndicator
                        testID="chat-loading-older"
                        size="small"
                        color={colors.textSecondary}
                        style={styles.olderLoader}
                      />
                    ) : null
                  }
                />
              )
            ) : (
              // No preview rights: the gate is the screen, not a footer under an
              // empty room. `pending` in particular must see nothing of the room.
              <View style={styles.flex} />
            )}

            {!!messages.error && canRead && visibleMessages.length > 0 && (
              <View
                testID="chat-messages-error"
                accessibilityLiveRegion="polite"
                style={[
                  styles.historyError,
                  { backgroundColor: `${colors.error}12` },
                ]}
              >
                <Text
                  style={[styles.historyErrorText, { color: colors.error }]}
                  numberOfLines={2}
                >
                  {messages.error}
                </Text>
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading messages"
                  hapticFeedback="selection"
                  onPress={() => void messages.refresh()}
                  style={styles.historyRetry}
                >
                  <Text
                    style={[styles.historyRetryText, { color: colors.error }]}
                  >
                    Retry
                  </Text>
                </AnimatedPressable>
              </View>
            )}

            {isMember ? (
              <>
                {/* THE APP STORE'S USER-GENERATED-CONTENT REQUIREMENT, at the
                    only moment it is cheap to state: the person is about to
                    post. It sits above the composer rather than over it,
                    persists its own acknowledgement, and holds the composer
                    shut until it is answered — a notice you can post past is
                    decoration. It is not shown where posting is off anyway. */}
                <FirstPostNotice
                  active={!postingDisabled}
                  onAcknowledge={() => setFirstPostAcknowledged(true)}
                />
                <Composer
                  value={draft}
                  onChangeText={handleChangeDraft}
                  onSend={() => void handleSend()}
                  sending={messages.sending}
                  disabled={postingDisabled || firstPostBlocked}
                  disabledNotice={postingNotice}
                  error={messages.sendError}
                  replyTo={
                    replyTo
                      ? {
                          body: replyTo.body,
                          author: replyTo.author?.displayName,
                        }
                      : null
                  }
                  onClearReply={() => setReplyTo(null)}
                  maxLength={composerMaxLength}
                  onAttachmentSelected={handleAttachment}
                  attachmentUploading={attachmentUploading}
                  attachmentProgress={attachmentProgress}
                  attachmentError={attachmentError}
                  onShareOpportunity={() => setOpportunityPickerOpen(true)}
                />
              </>
            ) : (
              <JoinGate
                groupId={groupId}
                status={status}
                joinPolicy={group?.joinPolicy ?? "open"}
                visibility={group?.visibility ?? "public"}
                onJoined={loadDetail}
              />
            )}
          </>
        )}
      </KeyboardAvoidingView>
      <OpportunitySharePicker
        visible={opportunityPickerOpen}
        sending={opportunitySending}
        shareError={attachmentError}
        onClose={() => {
          if (!opportunitySending) setOpportunityPickerOpen(false);
        }}
        onShare={(opportunity) => void handleShareOpportunity(opportunity)}
      />
    </SafeAreaView>
  );
}

function PinnedMessageBar({
  count,
  message,
  onPress,
}: {
  count: number;
  message: LocalMessage;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const author = message.author?.displayName?.trim() || "Member";
  const preview = message.body.replace(/\s+/g, " ").trim();
  const label = count === 1 ? "Pinned message" : `${count} pinned messages`;

  return (
    <AnimatedPressable
      testID="chat-pinned-bar"
      accessibilityRole="button"
      accessibilityLabel={`${label} from ${author}: ${preview}`}
      accessibilityHint="Moves to the newest pinned message"
      hapticFeedback="selection"
      scaleTo={0.99}
      onPress={onPress}
      style={[
        styles.pinnedBar,
        { borderBottomColor: colors.border, backgroundColor: colors.card },
      ]}
    >
      <View
        style={[styles.pinnedIcon, { backgroundColor: `${colors.accent}18` }]}
      >
        <Pin size={15} color={colors.accent} fill={colors.accent} />
      </View>
      <View style={styles.pinnedCopy}>
        <Text
          style={[styles.pinnedLabel, { color: colors.accent }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          style={[styles.pinnedPreview, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {author}: {preview}
        </Text>
      </View>
      <ChevronRight size={17} color={colors.textSecondary} />
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------------------
// The header menu
// ---------------------------------------------------------------------------

interface GroupHeaderMenuProps {
  groupId: string;
  canOpenAbout: boolean;
  canOpenSettings: boolean;
  canReviewRequests: boolean;
  canReportGroup: boolean;
  canManageBlocks: boolean;
  canScheduleCalls: boolean;
  /** `null` when the count is unknown — never rendered as a zero-that-lies. */
  pendingRequests: number | null;
  onNavigate: (path: string) => void;
  /** Drop this person from the device's socket filter as well as the server. */
  onUnblocked: (userId: string) => Promise<void> | void;
}

/**
 * The three secondary destinations of a group, behind one kebab.
 *
 * It drops in place under the header rather than seizing the screen in a modal
 * — the same choice the message long-press menu makes, and for the same reason
 * (DESIGN.md §5.2): a short list of actions about the thing you are already
 * looking at is content in place, not an interruption.
 *
 * Every row is gated by a right computed ONCE by the screen from
 * `resolveAdminRole`. This component takes booleans and never re-derives one,
 * so there is no second opinion about who may do what.
 */
function GroupHeaderMenu({
  groupId,
  canOpenAbout,
  canOpenSettings,
  canReviewRequests,
  canReportGroup,
  canManageBlocks,
  canScheduleCalls,
  pendingRequests,
  onNavigate,
  onUnblocked,
}: GroupHeaderMenuProps) {
  const { t } = useTranslation(["community", "common"]);
  const { colors } = useTheme();
  const { getToken } = useAuth();

  const [confirmingReport, setConfirmingReport] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── The block list ─────────────────────────────────────────────────────────
  // Fetched when the panel is opened, never on every chat open: it is a
  // recovery path, and a request on the way into a room nobody asked for is a
  // request nobody should pay for.
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [blocks, setBlocks] = useState<BlockedUser[] | null>(null);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const openBlocks = useCallback(async () => {
    setBlocksOpen(true);
    setError(null);
    if (blocks !== null) return;
    setBlocksLoading(true);
    try {
      setBlocks(await fetchBlockedUsers(getToken));
    } catch (caught) {
      setError(
        isCommunityApiError(caught)
          ? caught.message
          : t("common:errors.generic"),
      );
      setBlocks([]);
    } finally {
      setBlocksLoading(false);
    }
  }, [blocks, getToken, t]);

  const submitUnblock = useCallback(
    async (userId: string) => {
      if (unblocking) return;
      setUnblocking(userId);
      setError(null);
      try {
        await unblockUser(userId, getToken);
        // The server is the record; the device's socket filter has to be told
        // too, or the person stays invisible in this room until a relaunch.
        await onUnblocked(userId);
        setBlocks((previous) =>
          (previous ?? []).filter((entry) => entry.userId !== userId),
        );
      } catch (caught) {
        setError(
          isCommunityApiError(caught)
            ? caught.message
            : t("common:errors.generic"),
        );
      } finally {
        setUnblocking(null);
      }
    },
    [unblocking, getToken, onUnblocked, t],
  );

  const submitReport = useCallback(async () => {
    if (reporting) return;
    setReporting(true);
    setError(null);
    try {
      await reportTarget(
        { targetType: "group", targetId: groupId, reason: "member_report" },
        getToken,
      );
      setReported(true);
      setConfirmingReport(false);
    } catch (caught) {
      // The server's sentence, never a status code.
      setError(
        isCommunityApiError(caught)
          ? caught.message
          : t("common:errors.generic"),
      );
    } finally {
      setReporting(false);
    }
  }, [reporting, groupId, getToken, t]);

  return (
    <View
      testID="chat-menu"
      style={[
        styles.menu,
        { borderColor: colors.border, backgroundColor: colors.card },
      ]}
    >
      {canOpenAbout && (
        <MenuRow
          testID="chat-menu-about"
          label={t("community:screens.aboutTitle")}
          icon={Info}
          color={colors.textSecondary}
          labelColor={colors.foreground}
          disabled={reporting}
          onPress={() => onNavigate(`/discussions/${groupId}/about`)}
        />
      )}

      {canOpenSettings && (
        <MenuRow
          testID="chat-menu-settings"
          label={t("community:screens.settingsTitle")}
          icon={Settings}
          color={colors.textSecondary}
          labelColor={colors.foreground}
          disabled={reporting}
          onPress={() => onNavigate(`/discussions/${groupId}/settings`)}
        />
      )}

      {canScheduleCalls && (
        <MenuRow
          testID="chat-menu-schedule-call"
          label={t("community:calls.scheduleTitle")}
          icon={PhoneCall}
          color={colors.accent}
          labelColor={colors.foreground}
          disabled={reporting}
          onPress={() => onNavigate(`/discussions/${groupId}/calls/new`)}
        />
      )}

      {canReviewRequests && (
        <MenuRow
          testID="chat-menu-requests"
          label={t("community:screens.requestsTitle")}
          icon={UserCheck}
          color={colors.textSecondary}
          labelColor={colors.foreground}
          disabled={reporting}
          badge={
            pendingRequests && pendingRequests > 0 ? pendingRequests : null
          }
          onPress={() => onNavigate(`/discussions/${groupId}/requests`)}
        />
      )}

      {canManageBlocks && !blocksOpen && (
        <MenuRow
          testID="chat-menu-blocked"
          label={t("community:moderation.blockedList")}
          icon={Ban}
          color={colors.textSecondary}
          labelColor={colors.foreground}
          disabled={reporting}
          onPress={() => void openBlocks()}
        />
      )}

      {canManageBlocks && blocksOpen && (
        <View testID="chat-menu-blocked-panel" style={styles.menuConfirm}>
          <Text style={[styles.menuConfirmTitle, { color: colors.foreground }]}>
            {t("community:moderation.blockedList")}
          </Text>

          {blocksLoading && (
            <ActivityIndicator
              testID="chat-menu-blocked-busy"
              size="small"
              color={colors.textSecondary}
            />
          )}

          {!blocksLoading && (blocks?.length ?? 0) === 0 && (
            <Text
              testID="chat-menu-blocked-empty"
              style={[styles.menuConfirmBody, { color: colors.textSecondary }]}
            >
              {t("community:moderation.blockedEmpty")}
            </Text>
          )}

          {(blocks ?? []).map((entry) => (
            <View key={entry.userId} style={styles.blockedRow}>
              <Text
                style={[styles.blockedName, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {entry.displayName}
              </Text>
              <AnimatedPressable
                testID={`chat-menu-unblock-${entry.userId}`}
                accessibilityRole="button"
                accessibilityLabel={`${t("community:moderation.unblock")}, ${entry.displayName}`}
                accessibilityState={{
                  disabled: unblocking !== null,
                  busy: unblocking === entry.userId,
                }}
                disabled={unblocking !== null}
                hapticFeedback="medium"
                scaleTo={0.97}
                onPress={() => void submitUnblock(entry.userId)}
                style={[
                  styles.blockedAction,
                  {
                    borderColor: colors.border,
                    opacity: unblocking !== null ? 0.6 : 1,
                  },
                ]}
              >
                {unblocking === entry.userId ? (
                  <ActivityIndicator
                    testID={`chat-menu-unblock-busy-${entry.userId}`}
                    size="small"
                    color={colors.foreground}
                  />
                ) : (
                  <Text
                    style={[
                      styles.menuConfirmLabel,
                      { color: colors.foreground },
                    ]}
                    numberOfLines={1}
                  >
                    {t("community:moderation.unblock")}
                  </Text>
                )}
              </AnimatedPressable>
            </View>
          ))}

          <AnimatedPressable
            testID="chat-menu-blocked-close"
            accessibilityRole="button"
            accessibilityLabel={t("common:actions.close")}
            accessibilityState={{ disabled: unblocking !== null }}
            disabled={unblocking !== null}
            hapticFeedback="selection"
            scaleTo={0.97}
            onPress={() => setBlocksOpen(false)}
            style={[styles.menuConfirmButton, { borderColor: colors.border }]}
          >
            <Text
              style={[styles.menuConfirmLabel, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {t("common:actions.close")}
            </Text>
          </AnimatedPressable>
        </View>
      )}

      {canReportGroup &&
        (confirmingReport ? (
          // The second step states what a report does and does not do, because
          // nobody at Edutu reviews it — the owner is told, and that is all.
          <View testID="chat-menu-report-confirm" style={styles.menuConfirm}>
            <Text
              style={[styles.menuConfirmTitle, { color: colors.foreground }]}
            >
              {t("community:moderation.reportGroupConfirmTitle")}
            </Text>
            <Text
              style={[styles.menuConfirmBody, { color: colors.textSecondary }]}
            >
              {t("community:moderation.reportGroupConfirmBody")}
            </Text>
            <View style={styles.menuConfirmRow}>
              <AnimatedPressable
                testID="chat-menu-report-cancel"
                accessibilityRole="button"
                accessibilityLabel={t("common:actions.cancel")}
                accessibilityState={{ disabled: reporting }}
                disabled={reporting}
                hapticFeedback="selection"
                scaleTo={0.97}
                onPress={() => setConfirmingReport(false)}
                style={[
                  styles.menuConfirmButton,
                  { borderColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.menuConfirmLabel,
                    { color: colors.foreground },
                  ]}
                  numberOfLines={1}
                >
                  {t("common:actions.cancel")}
                </Text>
              </AnimatedPressable>

              <AnimatedPressable
                testID="chat-menu-report-submit"
                accessibilityRole="button"
                accessibilityLabel={t("community:moderation.reportGroup")}
                accessibilityState={{ disabled: reporting, busy: reporting }}
                disabled={reporting}
                hapticFeedback="medium"
                scaleTo={0.97}
                onPress={() => void submitReport()}
                style={[
                  styles.menuConfirmButton,
                  {
                    borderColor: colors.error,
                    backgroundColor: `${colors.error}14`,
                    opacity: reporting ? 0.6 : 1,
                  },
                ]}
              >
                {reporting ? (
                  <ActivityIndicator
                    testID="chat-menu-report-busy"
                    size="small"
                    color={colors.error}
                  />
                ) : (
                  <Text
                    style={[styles.menuConfirmLabel, { color: colors.error }]}
                    numberOfLines={1}
                  >
                    {t("community:moderation.reportGroup")}
                  </Text>
                )}
              </AnimatedPressable>
            </View>
          </View>
        ) : (
          // The only destructive-tinted item here; everything else stays
          // Restrained (DESIGN.md §1).
          <MenuRow
            testID="chat-menu-report-group"
            label={
              reported
                ? t("community:moderation.reportGroupDone")
                : t("community:moderation.reportGroup")
            }
            icon={Flag}
            color={reported ? colors.textSecondary : colors.error}
            labelColor={reported ? colors.textSecondary : colors.error}
            disabled={reported || reporting}
            onPress={() => setConfirmingReport(true)}
          />
        ))}

      {!!error && (
        <Text
          testID="chat-menu-error"
          style={[styles.menuError, { color: colors.error }]}
        >
          {error}
        </Text>
      )}
    </View>
  );
}

/** One row of the header menu. Icon + label, never icon alone. */
function MenuRow({
  testID,
  label,
  icon: Icon,
  color,
  labelColor,
  disabled,
  badge = null,
  onPress,
}: {
  testID: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  color: string;
  labelColor: string;
  disabled: boolean;
  badge?: number | null;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      // The count travels in the label so a screen reader hears "Join
      // requests, 3" rather than a silent badge.
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hapticFeedback="selection"
      onPress={onPress}
      style={[styles.menuRow, { opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={styles.menuRowInner}>
        <Icon size={16} color={color} />
        <Text
          style={[styles.menuRowLabel, { color: labelColor }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {badge ? (
          <View
            testID={`${testID}-badge`}
            style={[styles.menuBadge, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.menuBadgeLabel} numberOfLines={1}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

interface JoinGateProps {
  groupId: string;
  status: MembershipStatus | null;
  joinPolicy: "open" | "request";
  visibility: "public" | "private";
  onJoined: () => Promise<void> | void;
}

function JoinGate({
  groupId,
  status,
  joinPolicy,
  visibility,
  onJoined,
}: JoinGateProps) {
  const { t } = useTranslation(["community", "common"]);
  const { colors } = useTheme();
  const { getToken } = useAuth();

  const [formOpen, setFormOpen] = useState(false);
  const [questions, setQuestions] = useState<GroupQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** `banned` is terminal; `pending` waits. Neither is offered a way through. */
  const terminal = status === "banned";
  const waiting = status === "pending";

  const submit = useCallback(
    async (payload: JoinRequestAnswer[]) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await joinGroup(groupId, payload, getToken);
        await onJoined();
      } catch (caught) {
        setError(
          isCommunityApiError(caught)
            ? caught.message
            : t("common:errors.generic"),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, groupId, getToken, onJoined, t],
  );

  const openForm = useCallback(async () => {
    setFormOpen(true);
    if (questions !== null) return;
    try {
      const form = await fetchGroupForm(groupId, getToken);
      setQuestions(form.questions);
    } catch {
      // No form is a valid group configuration, and a failed fetch must not
      // block the request — fall back to the free-text note.
      setQuestions([]);
    }
  }, [questions, groupId, getToken]);

  const submitForm = useCallback(() => {
    const payload: JoinRequestAnswer[] =
      questions && questions.length > 0
        ? questions.map((question) => ({
            id: question.id,
            value: answers[question.id] ?? "",
          }))
        : note.trim()
          ? [{ id: "message", value: note.trim() }]
          : [];
    void submit(payload);
  }, [questions, answers, note, submit]);

  const headline =
    status === "invited"
      ? t("community:membership.invited")
      : status === "pending"
        ? t("community:membership.pending")
        : status === "removed"
          ? t("community:membership.removed")
          : status === "banned"
            ? t("community:membership.banned")
            : visibility === "private"
              ? t("community:visibility.private")
              : t("community:joinPolicy." + joinPolicy);

  const explanation =
    status === "invited"
      ? t("community:membership.invitedDesc")
      : status === "pending"
        ? t("community:membership.pendingDesc")
        : status === "removed"
          ? t("community:membership.removedDesc")
          : status === "banned"
            ? t("community:membership.bannedDesc")
            : visibility === "private"
              ? t("community:errors.groupPrivate")
              : t("community:joinPolicy." + joinPolicy + "Desc");

  const Icon = terminal
    ? ShieldAlert
    : waiting
      ? Clock
      : visibility === "private"
        ? Lock
        : MessageCircle;

  /** Only an invitee, and anyone with no standing, is offered a way in. */
  const showAccept = status === "invited";
  const showJoin =
    (status === null || status === "removed") && joinPolicy === "open";
  const showRequest =
    (status === null || status === "removed") &&
    joinPolicy === "request" &&
    visibility === "public";

  return (
    <View
      testID="chat-gate"
      style={[
        styles.gate,
        { borderTopColor: colors.border, backgroundColor: colors.background },
      ]}
    >
      <View style={styles.gateHead}>
        <Icon
          size={18}
          color={terminal ? colors.error : colors.textSecondary}
        />
        <Text
          testID="chat-gate-headline"
          style={[
            styles.gateTitle,
            { color: terminal ? colors.error : colors.foreground },
          ]}
          numberOfLines={2}
        >
          {headline}
        </Text>
      </View>

      <Text
        testID="chat-gate-explanation"
        style={[styles.gateBody, { color: colors.textSecondary }]}
      >
        {explanation}
      </Text>

      {!!error && (
        <Text
          testID="chat-gate-error"
          style={[styles.gateBody, { color: colors.error }]}
        >
          {error}
        </Text>
      )}

      {/* The house rules, stated before somebody joins rather than after they
          are removed. */}
      {(showAccept || showJoin || showRequest) && (
        <Text
          style={[styles.gateRules, { color: colors.textSecondary }]}
          numberOfLines={4}
        >
          {t("community:moderation.noToleranceTitle")} —{" "}
          {t("community:moderation.noToleranceBody")}
        </Text>
      )}

      {showAccept && (
        <GateButton
          testID="chat-gate-accept"
          label={t("community:actions.acceptInvite")}
          busy={busy}
          onPress={() => void submit([])}
        />
      )}

      {showJoin && (
        <GateButton
          testID="chat-gate-join"
          label={t("community:actions.join")}
          busy={busy}
          onPress={() => void submit([])}
        />
      )}

      {showRequest && !formOpen && (
        <GateButton
          testID="chat-gate-request"
          label={t("community:actions.requestToJoin")}
          busy={busy}
          onPress={() => void openForm()}
        />
      )}

      {/* INLINE, not a modal and not a screen: it interrupts a browse. */}
      {showRequest && formOpen && (
        <View
          testID="chat-request-form"
          style={[
            styles.form,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
        >
          <Text style={[styles.formTitle, { color: colors.foreground }]}>
            {t("community:joinRequestForm.title")}
          </Text>
          <Text style={[styles.formIntro, { color: colors.textSecondary }]}>
            {t("community:joinRequestForm.intro")}
          </Text>

          {questions && questions.length > 0 ? (
            questions.map((question) => (
              <View key={question.id} style={styles.field}>
                <Text
                  style={[styles.fieldLabel, { color: colors.foreground }]}
                  numberOfLines={2}
                >
                  {question.label}
                </Text>
                {question.type === "single_select" ? (
                  <View style={styles.options}>
                    {question.options.map((option) => {
                      const selected = answers[question.id] === option;
                      return (
                        <AnimatedPressable
                          key={option}
                          testID={`chat-request-option-${question.id}-${option}`}
                          accessibilityRole="button"
                          accessibilityLabel={option}
                          accessibilityState={{ selected }}
                          hapticFeedback="selection"
                          scaleTo={0.97}
                          onPress={() =>
                            setAnswers((previous) => ({
                              ...previous,
                              [question.id]: option,
                            }))
                          }
                          style={[
                            styles.option,
                            {
                              borderColor: selected
                                ? colors.accent
                                : colors.border,
                              backgroundColor: selected
                                ? `${colors.accent}14`
                                : "transparent",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.optionLabel,
                              {
                                color: selected
                                  ? colors.accent
                                  : colors.foreground,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {option}
                          </Text>
                        </AnimatedPressable>
                      );
                    })}
                  </View>
                ) : (
                  <GateInput
                    testID={`chat-request-answer-${question.id}`}
                    value={answers[question.id] ?? ""}
                    onChangeText={(value) =>
                      setAnswers((previous) => ({
                        ...previous,
                        [question.id]: value,
                      }))
                    }
                    placeholder={t(
                      "community:joinRequestForm.messagePlaceholder",
                    )}
                    multiline={question.type === "long_text"}
                  />
                )}
              </View>
            ))
          ) : (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                {t("community:joinRequestForm.messageLabel")}
              </Text>
              <GateInput
                testID="chat-request-note"
                value={note}
                onChangeText={setNote}
                placeholder={t("community:joinRequestForm.messagePlaceholder")}
                multiline
              />
            </View>
          )}

          <GateButton
            testID="chat-request-submit"
            label={t("community:joinRequestForm.submit")}
            busy={busy}
            onPress={submitForm}
          />
        </View>
      )}
    </View>
  );
}

function GateButton({
  testID,
  label,
  busy,
  onPress,
}: {
  testID: string;
  label: string;
  busy: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      hapticFeedback="medium"
      onPress={onPress}
      style={[
        styles.cta,
        { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 },
      ]}
    >
      <Text style={styles.ctaLabel} numberOfLines={1}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function GateInput({
  testID,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  testID: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      accessibilityLabel={placeholder}
      multiline={multiline}
      style={[
        styles.input,
        {
          color: colors.foreground,
          borderColor: colors.border,
          backgroundColor: colors.background,
          minHeight: multiline ? 76 : 44,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 18,
  },
  headerAction: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  pinnedBar: {
    minHeight: 58,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pinnedIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  pinnedCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pinnedLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  pinnedPreview: {
    fontSize: 12,
    lineHeight: 17,
  },
  menu: {
    marginHorizontal: 16,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  menuRow: {
    minHeight: 44,
  },
  menuRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  menuRowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  menuBadge: {
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  menuBadgeLabel: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  menuConfirm: {
    padding: 12,
    gap: 8,
  },
  menuConfirmTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  menuConfirmBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  menuConfirmRow: {
    flexDirection: "row",
    gap: 8,
  },
  menuConfirmButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    borderCurve: "continuous",
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  menuConfirmLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  blockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 38,
  },
  blockedName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  blockedAction: {
    borderWidth: 1,
    borderRadius: 10,
    borderCurve: "continuous",
    minHeight: 34,
    minWidth: 88,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  menuError: {
    fontSize: 12,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  skeletonWrap: {
    flex: 1,
    padding: 16,
    gap: 10,
  },
  skelLeft: {
    alignSelf: "flex-start",
  },
  skelRight: {
    alignSelf: "flex-end",
  },
  stateWrap: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: "continuous",
    padding: 14,
    gap: 10,
    alignItems: "flex-start",
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
  },
  historyError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 7,
  },
  historyErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  historyRetry: {
    minWidth: 54,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  historyRetryText: {
    fontSize: 12,
    fontWeight: "800",
  },
  olderLoader: {
    paddingVertical: 14,
  },
  retryButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  retryLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  gate: {
    borderTopWidth: 1,
    padding: 16,
    gap: 10,
  },
  gateHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gateTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
  },
  gateBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  gateRules: {
    fontSize: 12,
    lineHeight: 18,
  },
  cta: {
    borderRadius: 14,
    borderCurve: "continuous",
    minHeight: 46,
  },
  ctaLabel: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    textAlignVertical: "center",
    lineHeight: 46,
  },
  form: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: "continuous",
    padding: 14,
    gap: 10,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  formIntro: {
    fontSize: 13,
    lineHeight: 19,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: "continuous",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  option: {
    borderWidth: 1,
    borderRadius: 999,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
});
