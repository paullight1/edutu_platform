import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Mail, MessageCircle, ShieldOff } from 'lucide-react-native';
import {
  createDmRequest,
  DM_MESSAGE_MAX_LENGTH,
  fetchDmRelationship,
  isCommunityDmApiError,
  type DmRelationship,
} from '@edutu/core/src/services/communityDms';
import { useTheme } from '../../../../components/context/ThemeContext';
import { AnimatedPressable } from '../../../../components/ui/AnimatedPressable';
import { ScreenHeader } from '../../../../components/ui/ScreenHeader';

export default function NewDirectMessageScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ userId?: string | string[]; name?: string | string[] }>();
  const recipientId = firstParam(params.userId);
  const name = firstParam(params.name) || 'this member';
  const [relationship, setRelationship] = useState<DmRelationship | null | undefined>(undefined);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRelationship = useCallback(async () => {
    if (!recipientId) {
      setError('This community member is unavailable.');
      setRelationship(null);
      return;
    }
    try {
      const result = await fetchDmRelationship(recipientId, getToken);
      if (result?.status === 'accepted' && result.conversationId) {
        router.replace(`/discussions/dm/${result.conversationId}` as never);
        return;
      }
      setRelationship(result);
    } catch (caught) {
      setError(isCommunityDmApiError(caught) ? caught.message : 'Messages are unavailable right now.');
      setRelationship(null);
    }
  }, [getToken, recipientId, router]);

  useEffect(() => {
    void Promise.resolve().then(loadRelationship);
  }, [loadRelationship]);

  const send = useCallback(async () => {
    const message = body.trim();
    if (!recipientId || !message || sending) return;
    setSending(true);
    setError(null);
    try {
      await createDmRequest(recipientId, message, getToken);
      router.replace('/discussions/chats' as never);
    } catch (caught) {
      setError(isCommunityDmApiError(caught) ? caught.message : 'Your request could not be sent.');
    } finally {
      setSending(false);
    }
  }, [body, getToken, recipientId, router, sending]);

  const pending = relationship?.status === 'pending';
  const unavailable = relationship?.blocked || relationship?.status === 'declined';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <ScreenHeader title={`Message ${name}`} showBack />
      {relationship === undefined ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : pending || unavailable ? (
        <View style={styles.centerState}>
          {unavailable ? <ShieldOff size={34} color={colors.textSecondary} /> : <Mail size={34} color={colors.accent} />}
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>
            {unavailable ? 'Private messages unavailable' : relationship?.direction === 'outgoing' ? 'Request sent' : 'Review their request first'}
          </Text>
          <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
            {unavailable
              ? `You can’t start a private conversation with ${name}.`
              : relationship?.direction === 'outgoing'
                ? `${name} needs to accept your first message before you can send another.`
                : `${name} already sent you a request. Accept or decline it from Chats.`}
          </Text>
          {!unavailable && relationship?.direction === 'incoming' && (
            <AnimatedPressable onPress={() => router.replace('/discussions/chats' as never)} style={[styles.primary, { backgroundColor: colors.accent }]}>
              <Text style={styles.primaryText}>Open Chats</Text>
            </AnimatedPressable>
          )}
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.content}>
            <View style={[styles.notice, { backgroundColor: colors.muted }]}>
              <MessageCircle size={21} color={colors.accent} />
              <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
                Your first message is a request. You can send more only after {name} accepts it.
              </Text>
            </View>
            <Text style={[styles.label, { color: colors.foreground }]}>First message</Text>
            <TextInput
              testID="dm-request-input"
              value={body}
              onChangeText={setBody}
              placeholder="Introduce yourself and say why you’re reaching out"
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={DM_MESSAGE_MAX_LENGTH}
              textAlignVertical="top"
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: error ? colors.error : colors.border }]}
            />
            <View style={styles.metaRow}>
              <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.error }]}>{error}</Text>
              <Text style={[styles.counter, { color: colors.textSecondary }]}>{body.length}/{DM_MESSAGE_MAX_LENGTH}</Text>
            </View>
          </View>
          <View style={[styles.dock, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
            <AnimatedPressable
              testID="dm-request-send"
              accessibilityRole="button"
              accessibilityLabel="Send message request"
              accessibilityState={{ disabled: !body.trim() || sending, busy: sending }}
              disabled={!body.trim() || sending}
              onPress={() => void send()}
              style={[styles.primary, { backgroundColor: colors.accent, opacity: !body.trim() || sending ? 0.5 : 1 }]}
            >
              {sending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Send request</Text>}
            </AnimatedPressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function firstParam(value?: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  stateTitle: { fontSize: 21, fontWeight: '800', textAlign: 'center' },
  stateBody: { maxWidth: 420, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  content: { flex: 1, padding: 18, gap: 12 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 16, padding: 14 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
  label: { marginTop: 6, fontSize: 15, fontWeight: '800' },
  input: { minHeight: 170, borderWidth: 1, borderRadius: 18, padding: 15, fontSize: 15, lineHeight: 22 },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  error: { flex: 1, minHeight: 18, fontSize: 12, lineHeight: 18 },
  counter: { fontSize: 12 },
  dock: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14 },
  primary: { minHeight: 50, minWidth: 180, borderRadius: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
