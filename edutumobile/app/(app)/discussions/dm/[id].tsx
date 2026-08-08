import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MoreHorizontal, Send } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  blockDmUser,
  DM_MESSAGE_MAX_LENGTH,
  fetchDmConversation,
  fetchDmMessages,
  hideDmConversation,
  isCommunityDmApiError,
  markDmConversationRead,
  sendDmMessage,
  type DmConversationDetail,
  type DmMessage,
} from '@edutu/core/src/services/communityDms';
import { useTheme } from '../../../../components/context/ThemeContext';
import { AnimatedPressable } from '../../../../components/ui/AnimatedPressable';
import { ScreenHeader } from '../../../../components/ui/ScreenHeader';

const PAGE_SIZE = 40;
const REFRESH_INTERVAL_MS = 10_000;

function mergeDmMessages(current: DmMessage[], incoming: DmMessage[]): DmMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => {
    const timeDifference = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return timeDifference || b.id.localeCompare(a.id);
  });
}

export default function DirectMessageScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation(['community', 'common']);
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId = Array.isArray(params.id) ? params.id[0] ?? '' : params.id ?? '';
  const [conversation, setConversation] = useState<DmConversationDetail | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [sending, setSending] = useState(false);
  const [managing, setManaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Background refreshes may supersede one another, but they must never
  // invalidate a send or pagination request. Route identity is tracked
  // separately so only leaving this conversation can discard those results.
  const loadRequestVersion = useRef(0);
  const activeConversationIdRef = useRef(conversationId);
  const screenActiveRef = useRef(false);
  const loadedConversationId = useRef<string | null>(null);
  const loadingOlderLock = useRef(false);
  const lastMarkedMessageId = useRef<string | null>(null);
  const sendingLock = useRef(false);
  const managingLock = useRef(false);

  activeConversationIdRef.current = conversationId;

  const load = useCallback(async () => {
    if (!conversationId) {
      setConversation(null);
      setMessages([]);
      setError(t('community:dm.invalidLink'));
      setLoading(false);
      return;
    }

    const routeChanged = loadedConversationId.current !== conversationId;
    if (routeChanged) {
      // Conversation state is private to its route. Clear it before the next
      // request begins so a partial failure can never render person A's
      // messages beneath person B's name.
      setLoading(true);
      setConversation(null);
      setMessages([]);
      setBody('');
      setHasOlder(true);
      setLoadingOlder(false);
      setSending(false);
      setManaging(false);
      setError(null);
      lastMarkedMessageId.current = null;
    }

    const requestId = ++loadRequestVersion.current;
    const [detailResult, messagesResult] = await Promise.allSettled([
      fetchDmConversation(conversationId, getToken),
      fetchDmMessages(conversationId, { limit: PAGE_SIZE }, getToken),
    ]);
    if (
      !screenActiveRef.current ||
      activeConversationIdRef.current !== conversationId ||
      requestId !== loadRequestVersion.current
    ) return;
    if (detailResult.status === 'fulfilled') {
      setConversation(detailResult.value);
      loadedConversationId.current = conversationId;
    } else if (routeChanged) {
      setConversation(null);
    }

    if (messagesResult.status === 'fulfilled') {
      const page = messagesResult.value;
      loadedConversationId.current = conversationId;
      setMessages((current) => routeChanged ? page : mergeDmMessages(current, page));
      setHasOlder(page.length === PAGE_SIZE);

      const newestIncoming = page.find((message) => message.senderId !== userId);
      if (newestIncoming && newestIncoming.id !== lastMarkedMessageId.current) {
        lastMarkedMessageId.current = newestIncoming.id;
        void markDmConversationRead(conversationId, getToken).catch(() => {
          if (lastMarkedMessageId.current === newestIncoming.id) {
            lastMarkedMessageId.current = null;
          }
        });
      }
    }

    const failure = detailResult.status === 'rejected'
      ? detailResult.reason
      : messagesResult.status === 'rejected'
        ? messagesResult.reason
        : null;
    setError(
      failure
        ? isCommunityDmApiError(failure)
          ? failure.message
          : t('community:dm.loadFailed')
        : null,
    );
    setLoading(false);
  }, [conversationId, getToken, t, userId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      screenActiveRef.current = true;
      let refreshTimer: ReturnType<typeof setTimeout> | undefined;
      if (!conversationId) {
        void load();
        return () => {
          active = false;
          screenActiveRef.current = false;
          loadRequestVersion.current += 1;
        };
      }
      const refresh = async () => {
        await load();
        if (active) refreshTimer = setTimeout(() => void refresh(), REFRESH_INTERVAL_MS);
      };
      void refresh();
      return () => {
        active = false;
        screenActiveRef.current = false;
        if (refreshTimer) clearTimeout(refreshTimer);
        loadRequestVersion.current += 1;
      };
    }, [conversationId, load]),
  );

  const loadOlder = useCallback(async () => {
    if (!hasOlder || loadingOlderLock.current || messages.length === 0) return;
    const oldest = messages[messages.length - 1];
    const activeConversationId = conversationId;
    loadingOlderLock.current = true;
    setLoadingOlder(true);
    try {
      const page = await fetchDmMessages(
        conversationId,
        { before: oldest.createdAt, beforeId: oldest.id, limit: PAGE_SIZE },
        getToken,
      );
      if (
        !screenActiveRef.current ||
        activeConversationId !== activeConversationIdRef.current ||
        activeConversationId !== loadedConversationId.current
      ) return;
      setMessages((current) => mergeDmMessages(current, page));
      setHasOlder(page.length === PAGE_SIZE);
    } catch (caught) {
      if (
        screenActiveRef.current &&
        activeConversationId === activeConversationIdRef.current &&
        activeConversationId === loadedConversationId.current
      ) {
        setError(isCommunityDmApiError(caught) ? caught.message : t('community:dm.olderFailed'));
      }
    } finally {
      loadingOlderLock.current = false;
      if (
        screenActiveRef.current &&
        activeConversationId === activeConversationIdRef.current
      ) setLoadingOlder(false);
    }
  }, [conversationId, getToken, hasOlder, messages, t]);

  const send = useCallback(async () => {
    const text = body.trim();
    if (!text || sendingLock.current || !conversation) return;
    const activeConversationId = conversation.id;
    sendingLock.current = true;
    setSending(true);
    setError(null);
    try {
      const message = await sendDmMessage(activeConversationId, text, getToken);
      if (
        !screenActiveRef.current ||
        activeConversationId !== activeConversationIdRef.current ||
        activeConversationId !== loadedConversationId.current
      ) return;
      setMessages((current) => mergeDmMessages(current, [message]));
      setBody('');
      void markDmConversationRead(activeConversationId, getToken).catch(() => undefined);
    } catch (caught) {
      if (
        screenActiveRef.current &&
        activeConversationId === activeConversationIdRef.current &&
        activeConversationId === loadedConversationId.current
      ) {
        setError(isCommunityDmApiError(caught) ? caught.message : t('community:dm.sendFailed'));
      }
    } finally {
      sendingLock.current = false;
      if (
        screenActiveRef.current &&
        activeConversationId === activeConversationIdRef.current
      ) setSending(false);
    }
  }, [body, conversation, getToken, t]);

  const hide = useCallback(async () => {
    if (!conversation || managingLock.current) return;
    managingLock.current = true;
    setManaging(true);
    try {
      await hideDmConversation(conversation.id, getToken);
      router.replace('/discussions/chats' as never);
    } catch (caught) {
      setError(isCommunityDmApiError(caught) ? caught.message : t('community:dm.removeFailed'));
    } finally {
      managingLock.current = false;
      setManaging(false);
    }
  }, [conversation, getToken, router, t]);

  const block = useCallback(async () => {
    if (!conversation || managingLock.current) return;
    managingLock.current = true;
    setManaging(true);
    try {
      await blockDmUser(conversation.otherUser.userId, getToken);
      router.replace('/discussions/chats' as never);
    } catch (caught) {
      setError(isCommunityDmApiError(caught) ? caught.message : t('community:dm.blockFailed'));
    } finally {
      managingLock.current = false;
      setManaging(false);
    }
  }, [conversation, getToken, router, t]);

  const openMenu = useCallback(() => {
    if (!conversation) return;
    Alert.alert(conversation.otherUser.displayName, t('community:dm.manage'), [
      { text: t('community:dm.removeInbox'), onPress: () => void hide() },
      {
        text: t('community:dm.blockPerson', { name: conversation.otherUser.displayName }),
        style: 'destructive',
        onPress: () => Alert.alert(
          t('community:dm.blockPersonTitle', { name: conversation.otherUser.displayName }),
          t('community:dm.blockPersonBody'),
          [
            { text: t('common:actions.cancel'), style: 'cancel' },
            { text: t('community:dm.block'), style: 'destructive', onPress: () => void block() },
          ],
        ),
      },
      { text: t('common:actions.cancel'), style: 'cancel' },
    ]);
  }, [block, conversation, hide, t]);

  const headerRight = conversation ? (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={t('community:dm.options')}
      accessibilityState={{ disabled: managing, busy: managing }}
      disabled={managing}
      onPress={openMenu}
      style={[styles.headerAction, { backgroundColor: colors.muted, opacity: managing ? 0.5 : 1 }]}
    >
      <MoreHorizontal size={20} color={colors.foreground} />
    </AnimatedPressable>
  ) : null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <ScreenHeader
        title={conversation?.otherUser.displayName ?? t('community:dm.privateMessage')}
        subtitle={conversation?.blocked ? t('community:dm.unavailable') : t('community:dm.privateConversation')}
        showBack
        right={headerRight}
      />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : !conversation ? (
        <View style={styles.centerState}>
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>{t('community:dm.conversationUnavailable')}</Text>
          <Text style={[styles.stateBody, { color: colors.textSecondary }]}>{error}</Text>
          <AnimatedPressable onPress={() => void load()} style={[styles.retry, { backgroundColor: colors.accent }]}><Text style={styles.retryText}>{t('common:actions.retry')}</Text></AnimatedPressable>
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
          {!!error && <Text accessibilityLiveRegion="polite" style={[styles.inlineError, { color: colors.error, backgroundColor: `${colors.error}12` }]}>{error}</Text>}
          {messages.length === 0 ? (
            <View testID="dm-empty-messages" style={styles.emptyMessages}>
              <Text style={[styles.emptyMessagesTitle, { color: colors.foreground }]}>{t('community:dm.startConversation')}</Text>
              <Text style={[styles.emptyMessagesBody, { color: colors.textSecondary }]}>{t('community:dm.emptyBody', { name: conversation.otherUser.displayName })}</Text>
            </View>
          ) : (
            <FlatList
              testID="dm-message-list"
              data={messages}
              inverted
              keyExtractor={(item) => item.id}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.messages}
              onEndReached={() => void loadOlder()}
              onEndReachedThreshold={0.25}
              ListFooterComponent={loadingOlder ? <ActivityIndicator testID="dm-loading-older" style={styles.olderLoader} color={colors.accent} /> : null}
              renderItem={({ item }) => (
                <MessageRow message={item} mine={item.senderId === userId} />
              )}
            />
          )}
          {conversation.blocked ? (
            <View style={[styles.blockedDock, { borderTopColor: colors.border }]}>
              <Text style={[styles.blockedText, { color: colors.textSecondary }]}>{t('community:dm.blockedBody')}</Text>
            </View>
          ) : (
            <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
              <View style={styles.inputWrap}>
                <TextInput
                  testID="dm-composer-input"
                  value={body}
                  onChangeText={setBody}
                  placeholder={t('community:dm.messagePlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  maxLength={DM_MESSAGE_MAX_LENGTH}
                  style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
                />
                {body.length > 1800 && <Text style={[styles.counter, { color: colors.textSecondary }]}>{body.length}/{DM_MESSAGE_MAX_LENGTH}</Text>}
              </View>
              <AnimatedPressable
                testID="dm-send"
                accessibilityRole="button"
                accessibilityLabel={t('community:dm.send')}
                accessibilityState={{ disabled: !body.trim() || sending, busy: sending }}
                disabled={!body.trim() || sending}
                onPress={() => void send()}
                style={[styles.send, { backgroundColor: colors.accent, opacity: !body.trim() || sending ? 0.45 : 1 }]}
              >
                {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Send size={19} color="#FFFFFF" />}
              </AnimatedPressable>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function MessageRow({ message, mine }: { message: DmMessage; mine: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.messageLine, mine ? styles.mineLine : styles.theirLine]}>
      {!mine && (message.sender.avatarUrl ? (
        <Image source={{ uri: message.sender.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: `${colors.accent}18` }]}><Text style={[styles.avatarText, { color: colors.accent }]}>{message.sender.displayName[0]?.toUpperCase() || 'E'}</Text></View>
      ))}
      <View style={[styles.bubble, { backgroundColor: mine ? colors.accent : colors.card }]}>
        <Text style={[styles.body, { color: mine ? '#FFFFFF' : colors.foreground }]}>{message.body}</Text>
        <Text style={[styles.time, { color: mine ? 'rgba(255,255,255,0.72)' : colors.textSecondary }]}>{formatTime(message.createdAt)}</Text>
      </View>
    </View>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  stateTitle: { fontSize: 21, fontWeight: '800', textAlign: 'center' },
  stateBody: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  retry: { minHeight: 46, minWidth: 140, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  headerAction: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  inlineError: { margin: 10, borderRadius: 12, padding: 10, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  messages: { paddingHorizontal: 14, paddingVertical: 16, gap: 7 },
  olderLoader: { marginVertical: 18 },
  messageLine: { maxWidth: '88%', flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
  mineLine: { alignSelf: 'flex-end' },
  theirLine: { alignSelf: 'flex-start' },
  avatar: { width: 28, height: 28, borderRadius: 10 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 11, fontWeight: '900' },
  bubble: { minWidth: 72, borderRadius: 18, borderCurve: 'continuous', paddingHorizontal: 12, paddingTop: 9, paddingBottom: 6 },
  body: { fontSize: 15, lineHeight: 21 },
  time: { marginTop: 3, alignSelf: 'flex-end', fontSize: 10 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'flex-end', gap: 9, paddingHorizontal: 12, paddingVertical: 10 },
  inputWrap: { flex: 1, gap: 3 },
  input: { maxHeight: 120, minHeight: 46, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 10, fontSize: 15, lineHeight: 20 },
  counter: { alignSelf: 'flex-end', marginRight: 8, fontSize: 10 },
  send: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  blockedDock: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14 },
  blockedText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  emptyMessages: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyMessagesTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptyMessagesBody: { marginTop: 6, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
