import { Platform } from 'react-native';
import { displayIncomingCommunityCall } from './nativeCall';

let bootstrapped = false;
export async function bootstrapCommunityCallPush(): Promise<void> {
  if (bootstrapped || Platform.OS === 'web') return; bootstrapped = true;
  if (Platform.OS === 'android') {
    try {
      const module = await import('@react-native-firebase/messaging'); const messaging = module.default;
      messaging().setBackgroundMessageHandler(async (message: { data?: Record<string, string> }) => { if (message.data) await displayIncomingCommunityCall(message.data); });
      messaging().onMessage(async (message: { data?: Record<string, string> }) => { if (message.data) await displayIncomingCommunityCall(message.data); });
    } catch { /* Optional native module; Expo push routing remains available. */ }
  } else if (Platform.OS === 'ios') {
    try {
      const module = await import('react-native-voip-push-notification'); const voip = module.default ?? module;
      const handle = async (payload: object) => { const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {}; await displayIncomingCommunityCall(data); const uuid = [data.uuid, data.callId, data.call_id].find((value): value is string => typeof value === 'string'); if (uuid) voip.onVoipNotificationCompleted(uuid); };
      voip.addEventListener('notification', handle);
      voip.addEventListener('didLoadWithEvents', (events) => { for (const event of events ?? []) if (event?.name === 'RNVoipPushRemoteNotificationReceivedEvent' && event.data && typeof event.data === 'object') void handle(event.data); });
    } catch { /* Optional native module; Expo push routing remains available. */ }
  }
}

void bootstrapCommunityCallPush();
