import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useTheme } from '../context/ThemeContext';
import { createJourneyRequestKey, mutateOpportunityJourney } from '@edutu/core/src/services/opportunityJourney';

export default function PlanOpportunityActions({ opportunityId, onSignIn }: { opportunityId: string; onSignIn: () => void }) {
  const { userId, getToken } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const lock = useRef(false);
  const owner = useRef('');
  const ownerKey = `${userId}:${opportunityId}`;
  useEffect(() => { owner.current = ownerKey; return () => { owner.current = ''; }; }, [ownerKey]);
  const requests = useRef(new Map<string, string>());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async (action: 'pursue' | 'shortlist', submitted = false) => {
    if (!userId) { onSignIn(); return; }
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setError(null);
    const signature = `${userId}:${opportunityId}:${action}:${submitted}`;
    const idempotencyKey = requests.current.get(signature) ?? createJourneyRequestKey();
    requests.current.set(signature, idempotencyKey);
    try {
      const item = await mutateOpportunityJourney({ userId, getAuthToken: getToken, body: { opportunityId, action, idempotencyKey } });
      if (submitted && ['shortlisted', 'pursuing', 'preparing', 'ready_to_apply', 'application_opened'].includes(item.journey.state)) {
        await mutateOpportunityJourney({ userId, getAuthToken: getToken, journeyId: item.journey.id, action: 'application-confirmed',
          body: { expectedVersion: item.journey.version, idempotencyKey: `${idempotencyKey}:confirmed` } });
      }
      requests.current.delete(signature);
      if (owner.current !== ownerKey) return;
      router.push({ pathname: '/my-plan/[id]', params: { id: item.journey.id } });
    } catch (e) { if (owner.current === ownerKey) setError(e instanceof Error ? e.message : 'Unable to save to your plan. Please retry.'); }
    finally { lock.current = false; if (owner.current === ownerKey) setSaving(false); }
  };
  return <View style={styles.container}>
    <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '800' }}>Make it part of My Plan</Text>
    <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>Prepare with a checklist, track your deadline, and follow your application through to its outcome.</Text>
    {error && <Text accessibilityRole="alert" style={{ color: colors.foreground }}>{error}</Text>}
    {saving && <ActivityIndicator color={colors.accent} />}
    <View style={styles.row}>{(['pursue', 'shortlist'] as const).map(action => <Pressable key={action}
      accessibilityRole="button" disabled={saving} accessibilityState={{ disabled: saving }} onPress={() => { void add(action); }}
      style={[styles.button, { borderColor: colors.border, backgroundColor: action === 'pursue' ? colors.accent : colors.card, opacity: saving ? 0.5 : 1 }]}>
      <Text style={{ color: action === 'pursue' ? '#FFF' : colors.foreground, fontWeight: '700' }}>{action === 'pursue' ? 'Start pursuing' : 'Add to shortlist'}</Text>
    </Pressable>)}</View>
    <Pressable accessibilityRole="button" disabled={saving} style={styles.button}
      onPress={() => {
        if (!userId) { onSignIn(); return; }
        Alert.alert('Did you submit your application?', 'Only confirm after submitting it on the provider’s website.', [
          { text: 'Not yet', style: 'cancel' },
          { text: 'Yes, I submitted', onPress: () => { void add('shortlist', true); } },
        ]);
      }}>
      <Text style={{ color: colors.accent, fontWeight: '700' }}>Already submitted? Track my application</Text>
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({ container: { gap: 12, marginTop: 20, marginBottom: 12 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, button: { minHeight: 48, justifyContent: 'center', padding: 14, borderRadius: 14, borderWidth: 1 } });
