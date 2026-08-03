import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth, useUser } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Clock, Lock, MessageCircle, ShieldAlert } from 'lucide-react-native';
import {
  deleteMessage,
  fetchGroup,
  fetchGroupForm,
  isCommunityApiError,
  joinGroup,
  reportTarget,
  type CommunityMessage,
  type GroupDetail,
  type GroupQuestion,
  type JoinRequestAnswer,
  type MembershipStatus,
} from '@edutu/core/src/services/communities';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { AnimatedPressable } from '../../../components/ui/AnimatedPressable';
import { useTheme } from '../../../components/context/ThemeContext';
import { MessageBubble } from '../../../components/community/MessageBubble';
import { Composer } from '../../../components/community/Composer';
import { useGroupMessages, type LocalMessage } from '../../../hooks/useGroupMessages';

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
const LAST_READ_KEY = 'edutu:discussions:lastRead';

/** Local-only mute list. There is no server block endpoint yet. */
const BLOCKED_KEY = 'edutu:community:blocked';

/**
 * Stamp this group as read. Read-modify-write on one JSON blob, because the
 * browse screen reads every group's mark in a single `getItem`.
 */
export async function markGroupRead(groupId: string, at: string): Promise<void> {
  if (!groupId) return;
  try {
    const raw = await AsyncStorage.getItem(LAST_READ_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    const map: Record<string, string> =
      parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
    map[groupId] = at;
    await AsyncStorage.setItem(LAST_READ_KEY, JSON.stringify(map));
  } catch {
    // A failed mark costs one stale unread dot. It must never break the chat.
  }
}

async function readBlocked(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(BLOCKED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export default function GroupChatScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const groupId = Array.isArray(params.id) ? (params.id[0] ?? '') : (params.id ?? '');

  const { getToken } = useAuth();
  const { user } = useUser();
  const { t } = useTranslation(['community', 'common']);
  const { colors } = useTheme();

  const userId = user?.id ?? null;

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  /** Set when the group is loaded — see `loadDetail` for why not in render. */
  const [expired, setExpired] = useState(false);

  const group = detail?.group ?? null;
  const membership = detail?.membership ?? null;
  const status: MembershipStatus | null = membership?.status ?? null;

  /** Only an active member chats. */
  const isMember = status === 'active';
  /**
   * An invitee previews the room before deciding — that preview is the entire
   * value of an invitation. Everybody else below `active` reads nothing, and
   * `pending` most of all.
   */
  const canRead = status === 'active' || status === 'invited';

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
        isCommunityApiError(caught) ? caught.message : t('common:errors.generic'),
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
    void (async () => setBlocked(await readBlocked()))();
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
  const visibleMessages = useMemo(
    () =>
      blocked.length === 0
        ? messages.messages
        : messages.messages.filter((message) => !blocked.includes(message.userId)),
    [messages.messages, blocked],
  );

  const handleBlock = useCallback(async (message: CommunityMessage) => {
    if (!message.userId) return;
    const next = await readBlocked();
    if (!next.includes(message.userId)) next.push(message.userId);
    await AsyncStorage.setItem(BLOCKED_KEY, JSON.stringify(next));
    setBlocked(next);
  }, []);

  const handleReport = useCallback(
    async (message: CommunityMessage) => {
      await reportTarget(
        { targetType: 'message', targetId: message.id, reason: 'member_report' },
        getToken,
      );
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

  const canModerate = membership?.role === 'owner' || membership?.role === 'mod';

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const ok = await messages.send(draft);
    // Cleared ONLY on success. A screener refusal keeps every character.
    if (ok) setDraft('');
  }, [messages, draft]);

  const handleChangeDraft = useCallback(
    (value: string) => {
      setDraft(value);
      if (messages.sendError) messages.clearSendError();
    },
    [messages],
  );

  // ── Posting availability ───────────────────────────────────────────────────
  const archived = !!group?.archivedAt;
  const postingDisabled = archived || expired;
  const postingNotice = archived
    ? t('community:groupState.archivedReadOnly')
    : expired
      ? t('community:groupState.expiredDesc')
      : undefined;

  const headerTitle = group?.name ?? t('community:screens.chatTitle');

  const renderItem = useCallback(
    ({ item }: { item: LocalMessage }) => (
      <MessageBubble
        message={item}
        own={!!userId && item.userId === userId}
        pending={item.pending}
        canDelete={(!!userId && item.userId === userId) || canModerate}
        onReport={handleReport}
        onBlock={handleBlock}
        onDelete={handleDelete}
      />
    ),
    [userId, canModerate, handleReport, handleBlock, handleDelete],
  );

  const busy = detailLoading || (canRead && messages.loading && visibleMessages.length === 0);

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScreenHeader title={headerTitle} showBack />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Loading is skeleton bubbles in place — never a spinner floating over
            content (DESIGN.md §2). */}
        {busy ? (
          <View testID="chat-skeleton" style={styles.skeletonWrap}>
            {[0, 1, 2, 3].map((key) => (
              <Skeleton
                key={key}
                height={54}
                width={key % 2 === 0 ? '72%' : '58%'}
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
                { borderColor: colors.error, backgroundColor: `${colors.error}12` },
              ]}
            >
              <Text style={[styles.errorText, { color: colors.error }]}>{detailError}</Text>
              <AnimatedPressable
                testID="chat-error-retry"
                accessibilityRole="button"
                accessibilityLabel={t('common:actions.retry')}
                onPress={() => void loadDetail()}
                style={[styles.retryButton, { borderColor: colors.error }]}
              >
                <Text style={[styles.retryLabel, { color: colors.error }]}>
                  {t('common:actions.retry')}
                </Text>
              </AnimatedPressable>
            </View>
          </View>
        ) : (
          <>
            {canRead ? (
              visibleMessages.length === 0 ? (
                <View style={styles.stateWrap}>
                  <EmptyState
                    testID="chat-empty"
                    icon={MessageCircle}
                    title={t('community:chat.emptyTitle')}
                    description={t('community:chat.emptyBody')}
                  />
                </View>
              ) : (
                <FlatList
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
                />
              )
            ) : (
              // No preview rights: the gate is the screen, not a footer under an
              // empty room. `pending` in particular must see nothing of the room.
              <View style={styles.flex} />
            )}

            {!!messages.error && canRead && (
              <Text testID="chat-messages-error" style={[styles.inlineError, { color: colors.error }]}>
                {messages.error}
              </Text>
            )}

            {isMember ? (
              <Composer
                value={draft}
                onChangeText={handleChangeDraft}
                onSend={() => void handleSend()}
                sending={messages.sending}
                disabled={postingDisabled}
                disabledNotice={postingNotice}
                error={messages.sendError}
              />
            ) : (
              <JoinGate
                groupId={groupId}
                status={status}
                joinPolicy={group?.joinPolicy ?? 'open'}
                visibility={group?.visibility ?? 'public'}
                onJoined={loadDetail}
              />
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

interface JoinGateProps {
  groupId: string;
  status: MembershipStatus | null;
  joinPolicy: 'open' | 'request';
  visibility: 'public' | 'private';
  onJoined: () => Promise<void> | void;
}

function JoinGate({ groupId, status, joinPolicy, visibility, onJoined }: JoinGateProps) {
  const { t } = useTranslation(['community', 'common']);
  const { colors } = useTheme();
  const { getToken } = useAuth();

  const [formOpen, setFormOpen] = useState(false);
  const [questions, setQuestions] = useState<GroupQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** `banned` is terminal; `pending` waits. Neither is offered a way through. */
  const terminal = status === 'banned';
  const waiting = status === 'pending';

  const submit = useCallback(
    async (payload: JoinRequestAnswer[]) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await joinGroup(groupId, payload, getToken);
        await onJoined();
      } catch (caught) {
        setError(isCommunityApiError(caught) ? caught.message : t('common:errors.generic'));
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
        ? questions.map((question) => ({ id: question.id, value: answers[question.id] ?? '' }))
        : note.trim()
          ? [{ id: 'message', value: note.trim() }]
          : [];
    void submit(payload);
  }, [questions, answers, note, submit]);

  const headline =
    status === 'invited'
      ? t('community:membership.invited')
      : status === 'pending'
        ? t('community:membership.pending')
        : status === 'removed'
          ? t('community:membership.removed')
          : status === 'banned'
            ? t('community:membership.banned')
            : visibility === 'private'
              ? t('community:visibility.private')
              : t('community:joinPolicy.' + joinPolicy);

  const explanation =
    status === 'invited'
      ? t('community:membership.invitedDesc')
      : status === 'pending'
        ? t('community:membership.pendingDesc')
        : status === 'removed'
          ? t('community:membership.removedDesc')
          : status === 'banned'
            ? t('community:membership.bannedDesc')
            : visibility === 'private'
              ? t('community:errors.groupPrivate')
              : t('community:joinPolicy.' + joinPolicy + 'Desc');

  const Icon = terminal ? ShieldAlert : waiting ? Clock : visibility === 'private' ? Lock : MessageCircle;

  /** Only an invitee, and anyone with no standing, is offered a way in. */
  const showAccept = status === 'invited';
  const showJoin = (status === null || status === 'removed') && joinPolicy === 'open';
  const showRequest =
    (status === null || status === 'removed') && joinPolicy === 'request' && visibility === 'public';

  return (
    <View
      testID="chat-gate"
      style={[styles.gate, { borderTopColor: colors.border, backgroundColor: colors.background }]}
    >
      <View style={styles.gateHead}>
        <Icon size={18} color={terminal ? colors.error : colors.textSecondary} />
        <Text
          testID="chat-gate-headline"
          style={[styles.gateTitle, { color: terminal ? colors.error : colors.foreground }]}
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
        <Text testID="chat-gate-error" style={[styles.gateBody, { color: colors.error }]}>
          {error}
        </Text>
      )}

      {/* The house rules, stated before somebody joins rather than after they
          are removed. */}
      {(showAccept || showJoin || showRequest) && (
        <Text style={[styles.gateRules, { color: colors.textSecondary }]} numberOfLines={4}>
          {t('community:moderation.noToleranceTitle')} — {t('community:moderation.noToleranceBody')}
        </Text>
      )}

      {showAccept && (
        <GateButton
          testID="chat-gate-accept"
          label={t('community:actions.acceptInvite')}
          busy={busy}
          onPress={() => void submit([])}
        />
      )}

      {showJoin && (
        <GateButton
          testID="chat-gate-join"
          label={t('community:actions.join')}
          busy={busy}
          onPress={() => void submit([])}
        />
      )}

      {showRequest && !formOpen && (
        <GateButton
          testID="chat-gate-request"
          label={t('community:actions.requestToJoin')}
          busy={busy}
          onPress={() => void openForm()}
        />
      )}

      {/* INLINE, not a modal and not a screen: it interrupts a browse. */}
      {showRequest && formOpen && (
        <View
          testID="chat-request-form"
          style={[styles.form, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <Text style={[styles.formTitle, { color: colors.foreground }]}>
            {t('community:joinRequestForm.title')}
          </Text>
          <Text style={[styles.formIntro, { color: colors.textSecondary }]}>
            {t('community:joinRequestForm.intro')}
          </Text>

          {questions && questions.length > 0 ? (
            questions.map((question) => (
              <View key={question.id} style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]} numberOfLines={2}>
                  {question.label}
                </Text>
                {question.type === 'single_select' ? (
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
                            setAnswers((previous) => ({ ...previous, [question.id]: option }))
                          }
                          style={[
                            styles.option,
                            {
                              borderColor: selected ? colors.accent : colors.border,
                              backgroundColor: selected ? `${colors.accent}14` : 'transparent',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.optionLabel,
                              { color: selected ? colors.accent : colors.foreground },
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
                    value={answers[question.id] ?? ''}
                    onChangeText={(value) =>
                      setAnswers((previous) => ({ ...previous, [question.id]: value }))
                    }
                    placeholder={t('community:joinRequestForm.messagePlaceholder')}
                    multiline={question.type === 'long_text'}
                  />
                )}
              </View>
            ))
          ) : (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                {t('community:joinRequestForm.messageLabel')}
              </Text>
              <GateInput
                testID="chat-request-note"
                value={note}
                onChangeText={setNote}
                placeholder={t('community:joinRequestForm.messagePlaceholder')}
                multiline
              />
            </View>
          )}

          <GateButton
            testID="chat-request-submit"
            label={t('community:joinRequestForm.submit')}
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
      style={[styles.cta, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}
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
  },
  skeletonWrap: {
    flex: 1,
    padding: 16,
    gap: 10,
  },
  skelLeft: {
    alignSelf: 'flex-start',
  },
  skelRight: {
    alignSelf: 'flex-end',
  },
  stateWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 14,
    gap: 10,
    alignItems: 'flex-start',
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
  },
  inlineError: {
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  retryButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  retryLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  gate: {
    borderTopWidth: 1,
    padding: 16,
    gap: 10,
  },
  gateHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gateTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
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
    borderCurve: 'continuous',
    minHeight: 46,
  },
  ctaLabel: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 46,
  },
  form: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 14,
    gap: 10,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '700',
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
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    borderWidth: 1,
    borderRadius: 999,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
});
