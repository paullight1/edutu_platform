import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { getStoredPushToken, notificationService, registerForPushNotificationsAsync } from '../lib/notifications';
import { bindAndroidAutoApplyPush, refreshAndroidAutoApplyProgress } from '../lib/autoApplyAndroidProgress';
import { refreshAutoApplyActivity } from '../lib/autoApplyActivity';

type TokenGetter = () => Promise<string | null | undefined>;

/** Recover from permissions changed in system settings and transient token/API failures. */
export function usePushRegistration(userId: string | null | undefined, getToken: TokenGetter) {
  const tokenGetter = useRef(getToken);
  useEffect(() => { tokenGetter.current = getToken; }, [getToken]);

  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;
    let disposed = false;
    let pending = false;
    let registered = false;
    let refreshingActivity = false;
    const activitySession = new AbortController();
    const auth = () => disposed ? Promise.resolve(null) : tokenGetter.current();
    const register = async () => {
      if (disposed || registered || pending || AppState.currentState !== 'active') return;
      pending = true;
      try {
        const settings = await notificationService.loadSettings();
        if (disposed || !settings.pushEnabled) return;
        const token = await registerForPushNotificationsAsync(userId, auth, { promptIfNeeded: false });
        if (token) registered = true;
      } catch (error) {
        // A failed attempt must not permanently disable recovery this session.
        if (__DEV__) console.warn('Push registration will retry:', error instanceof Error ? error.message : 'unknown error');
      } finally {
        pending = false;
      }
    };
    const onActive = () => {
      void register();
      if (Platform.OS === 'ios' && !refreshingActivity) {
        refreshingActivity = true;
        void refreshAutoApplyActivity(auth, activitySession.signal).finally(() => { refreshingActivity = false; });
      }
      if (Platform.OS === 'android' && !refreshingActivity) {
        refreshingActivity = true;
        void refreshAndroidAutoApplyProgress(auth, activitySession.signal).then(async () => {
          if (disposed || !registered) return;
          const token = await getStoredPushToken();
          if (token && !disposed) await bindAndroidAutoApplyPush(token, auth);
        }).finally(() => { refreshingActivity = false; });
      }
    };
    if (AppState.currentState === 'active') onActive();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') onActive();
    });
    // Slow, foreground-only recovery. The service also backs off API failures.
    const timer = setInterval(() => { void register(); }, 5 * 60 * 1000);
    return () => {
      disposed = true;
      activitySession.abort();
      clearInterval(timer);
      subscription.remove();
    };
  }, [userId]);
}
