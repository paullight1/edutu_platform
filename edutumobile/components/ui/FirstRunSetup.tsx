import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { saveNotificationPreferences } from '@edutu/core/src/services/notificationPreferences';
import { notificationService, registerForPushNotificationsAsync } from '../../lib/notifications';
import { markPushOptInAsked } from '../../lib/pushOptIn';
import { useWelcomeModalActive } from '../../lib/welcomeModalStore';
import { useTheme } from '../context/ThemeContext';
import { LoginOfferModal } from './LoginOfferModal';
import { WelcomeHintSystem } from './WelcomeHintSystem';

interface Props {
  userId?: string | null;
  enabled: boolean;
  isDark: boolean;
  showLoginOffer: boolean;
}

/** Greeting → tour → notification choice → optional offer, one overlay at a time. */
export function FirstRunSetup({ userId, enabled, isDark, showLoginOffer }: Props) {
  const { getToken } = useAuth();
  const router = useRouter();
  const { t } = useTranslation('common');
  const { colors } = useTheme();
  const welcomeActive = useWelcomeModalActive();
  const [state, setState] = useState({ owner: '', loaded: false, tourDone: false, setupDone: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const storageKey = `edutu:notification-setup:v1:${userId}`;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void Promise.all([
      AsyncStorage.getItem(`edutu:welcome-hints:v1:${userId}`),
      AsyncStorage.getItem(storageKey),
    ]).then(([tour, setup]) => {
      if (!cancelled) setState({ owner: userId, loaded: true, tourDone: tour === 'done', setupDone: setup === 'done' });
    }).catch(() => {
      if (!cancelled) setState({ owner: userId, loaded: true, tourDone: false, setupDone: false });
    });
    return () => { cancelled = true; };
  }, [storageKey, userId]);

  const owned = state.owner === userId;
  const native = Platform.OS !== 'web';
  const visible = Boolean(native && enabled && userId && owned && state.loaded && state.tourDone && !state.setupDone && !welcomeActive);

  const finish = async () => {
    await AsyncStorage.setItem(storageKey, 'done').catch(() => undefined);
    await markPushOptInAsked();
    setState(previous => previous.owner === userId ? { ...previous, setupDone: true } : previous);
  };

  const enable = async () => {
    if (busy || !userId) return;
    setBusy(true);
    setError(false);
    try {
      const token = await registerForPushNotificationsAsync(userId, getToken, { requireServerSync: true });
      if (!token) {
        Alert.alert(
          t('notificationSetup.permissionTitle', { defaultValue: 'Allow notifications' }),
          t('notificationSetup.permissionBody', { defaultValue: 'You can allow Edutu notifications in your phone settings, then return here to try again.' }),
          [
            { text: t('actions.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
            { text: t('notificationSetup.openSettings', { defaultValue: 'Open phone settings' }), onPress: () => { void Linking.openSettings(); } },
          ],
        );
        return;
      }
      await saveNotificationPreferences(getToken, { pushNotifications: true });
      await notificationService.saveSettings({ pushEnabled: true });
      await finish();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const later = () => { if (!busy) void finish(); };
  const review = async () => {
    if (busy) return;
    await finish();
    router.push('/profile/settings' as never);
  };

  return <>
    <WelcomeHintSystem userId={userId} enabled={enabled} isDark={isDark}
      onComplete={() => setState(previous => ({ ...previous, owner: userId || '', loaded: true, tourDone: true }))} />
    <Modal visible={visible} transparent animationType="fade" onRequestClose={later}>
      <View style={styles.scrim}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={[styles.card, { backgroundColor: colors.card }]} accessibilityViewIsModal>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>
              {t('notificationSetup.title', { defaultValue: 'Stay on top of your applications' })}
            </Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              {t('notificationSetup.body', { defaultValue: 'Get application check-ins and deadline reminders. Review your notification topics, quiet hours and email preferences in Settings whenever you like.' })}
            </Text>
            {error && <Text accessibilityRole="alert" style={[styles.body, { color: colors.foreground }]}>
              {t('notificationSetup.failed', { defaultValue: 'We could not connect notifications. Check your connection and try again.' })}
            </Text>}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy}
              onPress={() => { void enable(); }} style={[styles.primary, { backgroundColor: colors.accent }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>
                {t('notificationSetup.enable', { defaultValue: 'Enable notifications' })}
              </Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void review(); }} style={styles.secondary}>
              <Text style={{ color: colors.foreground }}>{t('notificationSetup.review', { defaultValue: 'Review settings' })}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={later} style={styles.secondary}>
              <Text style={{ color: colors.textSecondary }}>{t('notificationSetup.later', { defaultValue: 'Not now' })}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
    {showLoginOffer && (!native || (owned && state.loaded && state.tourDone && state.setupDone)) && <LoginOfferModal />}
  </>;
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', borderRadius: 24, padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24 },
  primary: { minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', padding: 14 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
