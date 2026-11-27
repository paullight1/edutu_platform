import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ProductApiRequestError, requestProductApi, type GetAuthToken } from '@edutu/core/src/services/productApi';
import { autoApplyStatus, getAutoApplyActivityAction, getAutoApplyActivityStatus, type AutoApplyProgress } from '../components/opportunity/autoApplyStatus';

type State = keyof typeof autoApplyStatus;
type ProgressEntry = AutoApplyProgress & {
  legacyNotification?: boolean;
  notificationPending?: boolean;
  awaitingPermission?: boolean;
};
const activeKey = 'edutu-android-auto-apply-progress';
const channelId = 'auto-apply-progress';
const legacyNotificationId = 'edutu-auto-apply-current';
const terminal = new Set<State>(['submitted', 'failed', 'unconfirmed', 'cancelled']);
const registrationRefreshMs = 60 * 60 * 1000;
let updates = Promise.resolve();
let bindings = Promise.resolve();
let channelReady = false;
let boundDeviceToken: string | undefined;
const registeredAt = new Map<string, number>();

function identifier(entry: ProgressEntry) {
  return entry.legacyNotification ? legacyNotificationId : 'edutu-auto-apply-' + entry.id;
}

async function readProgress(): Promise<Map<string, ProgressEntry>> {
  const raw = await AsyncStorage.getItem(activeKey);
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw);
    const entries: ProgressEntry[] = Array.isArray(parsed)
      ? parsed : parsed?.id ? [{ ...parsed, legacyNotification: true }] : [];
    return new Map(entries
      .filter(entry => typeof entry?.id === 'string' &&
        typeof entry.state === 'string' && Object.hasOwn(autoApplyStatus, entry.state) &&
        Number.isSafeInteger(entry.version) && entry.version > 0 &&
        (entry.title === undefined || typeof entry.title === 'string'))
      .map(entry => [entry.id, entry]));
  } catch {
    return new Map();
  }
}

async function updateNotification(entry: ProgressEntry, finished: boolean) {
  const notificationId = identifier(entry);
  if (finished) {
    await Notifications.dismissNotificationAsync(notificationId);
    return true;
  }
  if (!(await Notifications.getPermissionsAsync()).granted) return false;
  if (!channelReady) {
    await Notifications.setNotificationChannelAsync(channelId, {
      name: 'Auto Apply progress', importance: Notifications.AndroidImportance.LOW,
      sound: null, enableVibrate: false,
    });
    channelReady = true;
  }
  await Notifications.scheduleNotificationAsync({
    identifier: notificationId,
    content: {
      title: entry.title || 'Edutu Auto Apply', body: getAutoApplyActivityStatus(entry.state, entry.activityAction), sticky: true,
      autoDismiss: false, sound: false,
      data: { source: 'auto-apply-progress', attemptId: entry.id, version: entry.version, url: '/auto-apply/' + entry.id },
    },
    trigger: { channelId },
  });
  return true;
}

export function showAutoApplyAndroidProgress(progress: AutoApplyProgress, local = false, signal?: AbortSignal) {
  const task = updates.then(async () => {
    if (signal?.aborted) return;
    const all = await readProgress();
    const current = all.get(progress.id);
    const title = progress.title?.trim().slice(0, 80) || current?.title;
    const activityAction = getAutoApplyActivityAction(progress.state, progress.activityAction)
      ?? (current?.version === progress.version
        ? getAutoApplyActivityAction(progress.state, current.activityAction)
        : undefined);
    if (signal?.aborted || (!local && !current) || (current && (current.version > progress.version ||
      (current.version === progress.version && current.activityAction === activityAction && current.title === title &&
        !current.notificationPending && !current.awaitingPermission)))) return;

    const finished = terminal.has(progress.state);
    if (finished && !current) return;
    const entry: ProgressEntry = {
      id: progress.id, state: progress.state, version: progress.version,
      title,
      activityAction,
      legacyNotification: current?.legacyNotification, notificationPending: true,
    };
    all.delete(progress.id);
    all.set(progress.id, entry);
    // Persist the desired state before touching Android so a missed display update can be replayed.
    await AsyncStorage.setItem(activeKey, JSON.stringify([...all.values()]));
    if (finished) registeredAt.delete(progress.id);
    if (signal?.aborted || !(await updateNotification(entry, finished).catch(() => false))) return;
    delete entry.notificationPending;
    const completed = [...all.values()].filter(row => terminal.has(row.state) && !row.notificationPending);
    for (const expired of completed.slice(0, Math.max(0, completed.length - 32))) all.delete(expired.id);
    await AsyncStorage.setItem(activeKey, JSON.stringify([...all.values()]));
  });
  updates = task.catch(() => {});
  return task;
}

export function receiveAutoApplyAndroidProgress(payload: Record<string, unknown>) {
  const { attemptId, state, version } = payload;
  if (payload.source !== 'auto-apply-progress' || typeof attemptId !== 'string' ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(attemptId) ||
      typeof state !== 'string' || !Object.hasOwn(autoApplyStatus, state) ||
      typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) return;
  return showAutoApplyAndroidProgress({
    id: attemptId, state: state as State, version,
    activityAction: getAutoApplyActivityAction(state as State, payload.activityAction),
  });
}

export function clearAutoApplyAndroidProgress() {
  const task = updates.then(async () => {
    const entries = await readProgress();
    registeredAt.clear();
    boundDeviceToken = undefined;
    channelReady = false;
    await AsyncStorage.removeItem(activeKey);
    const nativeIds = new Set([...entries.values()].map(identifier));
    nativeIds.add(legacyNotificationId);
    await Promise.allSettled([...nativeIds].map(id => Notifications.dismissNotificationAsync(id)));
  });
  updates = task.catch(() => {});
  return task;
}

export function bindAndroidAutoApplyPush(token: string, getAuthToken?: GetAuthToken, attemptId?: string) {
  const task = bindings.then(async () => {
    await updates;
    if (boundDeviceToken !== token) {
      registeredAt.clear();
      boundDeviceToken = token;
    }
    const current = await readProgress();
    for (const entry of current.values()) {
      if ((attemptId && entry.id !== attemptId) || terminal.has(entry.state) ||
          Date.now() - (registeredAt.get(entry.id) ?? -Infinity) < registrationRefreshMs) continue;
      const result = await requestProductApi<{ updated: boolean; progress?: AutoApplyProgress }>('/me/auto-apply/attempts/' + encodeURIComponent(entry.id) + '/activity', {
        method: 'PUT', body: JSON.stringify({ activityId: 'android', token, platform: 'android' }),
      }, getAuthToken);
      if (boundDeviceToken !== token) return;
      if (result?.updated) registeredAt.set(entry.id, Date.now());
      const progress = result?.progress;
      if (progress?.id === entry.id && terminal.has(progress.state) &&
          Number.isSafeInteger(progress.version) && progress.version > 0) {
        await showAutoApplyAndroidProgress(progress);
      }
    }
  });
  bindings = task.catch(() => {});
  return bindings;
}

export async function refreshAndroidAutoApplyProgress(getAuthToken: GetAuthToken, signal?: AbortSignal) {
  const current = await readProgress().catch(() => new Map<string, ProgressEntry>());
  for (const entry of current.values()) {
    if (signal?.aborted) return;
    if (terminal.has(entry.state)) {
      if (entry.notificationPending) await showAutoApplyAndroidProgress(entry, false, signal);
      continue;
    }
    try {
      const result = await requestProductApi<AutoApplyProgress>(
        '/me/auto-apply/attempts/' + encodeURIComponent(entry.id), { signal }, getAuthToken, undefined, { throwOnError: true },
      );
      if (signal?.aborted) return;
      if (result?.id === entry.id && Object.hasOwn(autoApplyStatus, result.state) &&
          Number.isSafeInteger(result.version) && result.version > 0) {
        await showAutoApplyAndroidProgress(result, false, signal);
      }
    } catch (error) {
      if (error instanceof ProductApiRequestError && error.status === 404) {
        const task = updates.then(async () => {
          if (signal?.aborted) return;
          const all = await readProgress();
          const saved = all.get(entry.id);
          if (signal?.aborted || saved?.version !== entry.version || saved.state !== entry.state) return;
          const dismissed = await Notifications.dismissNotificationAsync(identifier(saved)).then(() => true, () => false);
          if (!dismissed) return;
          registeredAt.delete(entry.id);
          all.delete(entry.id);
          await AsyncStorage.setItem(activeKey, JSON.stringify([...all.values()]));
        });
        updates = task.catch(() => {});
        await updates;
      }
    }
  }
}
