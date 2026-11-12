import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../components/context/ThemeContext';
import { saveOpportunityFromWidget } from '../packages/core/src/services/bookmarks';

/** App-opening widget action: authenticate normally and show only server-confirmed success. */
export default function WidgetSaveScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const opportunityId = typeof id === 'string' ? id : '';
  const { isLoaded, userId, getToken } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const owner = useRef(userId);
  const tokenGetter = useRef(getToken);
  useEffect(() => { owner.current = userId; tokenGetter.current = getToken; }, [userId, getToken]);
  const [attempt, setAttempt] = useState(0);
  const key = `${userId}:${opportunityId}:${attempt}`;
  const [result, setResult] = useState({ key: '', status: 'saving', message: '' });
  const current = result.key === key ? result : { status: 'saving', message: '' };
  useEffect(() => {
    let active = true;
    if (!isLoaded || !userId || !opportunityId) return;
    const capturedUser = userId;
    void saveOpportunityFromWidget(capturedUser, opportunityId, async () => {
      const token = await tokenGetter.current();
      return owner.current === capturedUser ? token : null;
    }).then(() => {
      if (active && owner.current === capturedUser) setResult({ key, status: 'saved', message: 'Added to your saved opportunities.' });
    }).catch(error => {
      if (active && owner.current === capturedUser) setResult({ key, status: 'error', message: error instanceof Error ? error.message : 'Unable to save. Try again.' });
    });
    return () => { active = false; };
  }, [key, isLoaded, userId, opportunityId]);
  const signedOut = isLoaded && !userId;
  const invalid = !opportunityId;
  const busy = !signedOut && !invalid && current.status === 'saving';
  const title = invalid ? 'Choose an opportunity' : signedOut ? 'Sign in to save' : current.status === 'saved' ? 'Opportunity saved' : current.status === 'error' ? 'Save not confirmed' : 'Saving your opportunity';
  return <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
    <Image source={require('../assets/mascot/edutu-guide.png')} style={styles.mascot} accessibilityIgnoresInvertColors />
    <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{title}</Text>
    <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.textSecondary }]}>{invalid ? 'Open Top Matches and select an opportunity.' : signedOut ? 'Sign in, then return here to save this opportunity to your account.' : current.message || 'Waiting for confirmation from Edutu…'}</Text>
    {busy && <ActivityIndicator size="large" color={colors.accent} accessibilityLabel="Saving opportunity" />}
    {!busy && <Pressable accessibilityRole="button" style={[styles.button, { backgroundColor: colors.accent }]} onPress={() => {
      if (signedOut) router.push('/(auth)/sign-in');
      else if (current.status === 'error') setAttempt(value => value + 1);
      else router.replace('/(app)/saved');
    }}><Text style={styles.buttonText}>{signedOut ? 'Sign in' : current.status === 'error' ? 'Try again' : 'View saved opportunities'}</Text></Pressable>}
    <Pressable accessibilityRole="button" style={styles.button} onPress={() => router.replace('/(app)')}><Text style={{ color: colors.foreground }}>Back to Edutu</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 28, justifyContent: 'center', alignItems: 'center', gap: 20 },
  mascot: { width: 144, height: 144, resizeMode: 'contain' },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 24, textAlign: 'center' },
  button: { minHeight: 48, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
