import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStoredPushToken } from './notifications';
import { bindAndroidAutoApplyPush, clearAutoApplyAndroidProgress, showAutoApplyAndroidProgress } from './autoApplyAndroidProgress';
import type { AutoApplyProgress } from '../components/opportunity/autoApplyStatus';
export { refreshAndroidAutoApplyProgress as refreshAutoApplyActivity } from './autoApplyAndroidProgress';

const ownerKey = 'edutu-auto-apply-activity-owner';
let ownerReady = Promise.resolve();

export function syncAutoApplyActivityOwner(owner: string | null) {
  ownerReady = ownerReady.then(async () => {
    const previous = await AsyncStorage.getItem(ownerKey);
    if (previous === owner && owner) return;
    if (previous || !owner) await clearAutoApplyAndroidProgress();
    if (owner) await AsyncStorage.setItem(ownerKey, owner);
    else await AsyncStorage.removeItem(ownerKey);
  }).catch(() => undefined);
  return ownerReady;
}

export async function syncAutoApplyActivity(attempt: AutoApplyProgress, options?: { owner?: string }) {
  try {
    const currentOwner = ownerReady;
    await currentOwner;
    if (options?.owner && (await AsyncStorage.getItem(ownerKey) !== options.owner || ownerReady !== currentOwner)) return;
    await showAutoApplyAndroidProgress(attempt, true);
    const token = await getStoredPushToken();
    if (token) await bindAndroidAutoApplyPush(token, undefined, attempt.id);
  } catch {
    // The in-app tracker remains available if the system suppresses progress notifications.
  }
}
