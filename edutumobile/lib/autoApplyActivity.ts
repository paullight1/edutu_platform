import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProductApiRequestError, requestProductApi, type GetAuthToken } from '@edutu/core/src/services/productApi';
import { autoApplyStatus, getAutoApplyActivityAction, getAutoApplyActivityStatus, type AutoApplyActivityAction, type AutoApplyProgress } from '../components/opportunity/autoApplyStatus';
import { hasWidgetsNativeModule } from './widgetsNative';

function getAutoApplyActivityFactory() {
  if (!hasWidgetsNativeModule()) return null;
  const widgets = require('../widgets/AutoApplyActivity') as typeof import('../widgets/AutoApplyActivity');
  return widgets.getAutoApplyActivityFactory();
}

type State = keyof typeof autoApplyStatus;
type ActivityRecord = { activityId: string; version: number; title?: string; activityAction?: AutoApplyActivityAction };
const storage = 'edutu-auto-apply-activity-v1';
const ownerKey = 'edutu-auto-apply-activity-owner';
const terminal = new Set<State>(['submitted', 'failed', 'cancelled', 'unconfirmed']);
let pending = Promise.resolve();
const tokenListeners = new Map<string, () => void>();
const endedVersions = new Map<string, number>();

async function readActivities(): Promise<Map<string, ActivityRecord>> {
  const raw = await AsyncStorage.getItem(storage);
  if (!raw) return new Map();
  if (!raw.startsWith('{')) {
    const [attemptId, activityId] = raw.split(':');
    return attemptId && activityId ? new Map([[attemptId, { activityId, version: 0 }]]) : new Map();
  }
  try {
    return new Map(Object.entries(JSON.parse(raw) as Record<string, ActivityRecord>)
      .filter(([, row]) => typeof row?.activityId === 'string' && Number.isSafeInteger(row.version) &&
        (row.title === undefined || typeof row.title === 'string')));
  } catch {
    return new Map();
  }
}

export function syncAutoApplyActivityOwner(owner: string | null) {
  pending = pending.then(async () => {
    const previous = await AsyncStorage.getItem(ownerKey);
    if (previous === owner && owner) return;
    if (previous || !owner) {
      for (const remove of tokenListeners.values()) remove();
      tokenListeners.clear();
      endedVersions.clear();
      const factory = getAutoApplyActivityFactory();
      const instances = factory?.getInstances() ?? [];
      await Promise.allSettled(instances.map(instance => instance.end('immediate')));
      await AsyncStorage.removeItem(storage);
    }
    if (owner) await AsyncStorage.setItem(ownerKey, owner);
    else await AsyncStorage.removeItem(ownerKey);
  }).catch(() => undefined);
  return pending;
}

export function syncAutoApplyActivity(attempt: AutoApplyProgress, options?: { owner?: string; activityId?: string; signal?: AbortSignal }) {
  pending = pending.then(async () => {
    if (options?.signal?.aborted ||
        (options?.owner && await AsyncStorage.getItem(ownerKey) !== options.owner)) return;
    const factory = getAutoApplyActivityFactory();
    if (!factory) return;
    const activities = await readActivities();
    const record = activities.get(attempt.id);
    if ((record?.version ?? 0) > attempt.version || (endedVersions.get(attempt.id) ?? 0) >= attempt.version) return;
    const instances = new Map(factory.getInstances().map(instance => [instance.getId(), instance]));
    let existing = record && instances.get(record.activityId);
    if (options?.signal?.aborted || (options?.activityId && existing?.getId() !== options.activityId)) return;
    let cleaned = false;
    for (const [attemptId, activity] of activities) {
      if (!instances.has(activity.activityId)) {
        activities.delete(attemptId);
        cleaned = true;
      }
    }
    for (const [activityId, remove] of tokenListeners) {
      if (!instances.has(activityId)) {
        remove();
        tokenListeners.delete(activityId);
      }
    }
    const title = attempt.title?.trim().slice(0, 80) || record?.title;
    const activityAction = getAutoApplyActivityAction(attempt.state,
      attempt.activityAction ?? (record?.version === attempt.version ? record.activityAction : undefined));
    const props = {
      status: getAutoApplyActivityStatus(attempt.state, activityAction),
      actionRequired: ['needs_input', 'needs_review', 'unconfirmed'].includes(attempt.state),
      ...(title ? { title } : {}),
    };
    if (terminal.has(attempt.state)) {
      if (existing) {
        tokenListeners.get(existing.getId())?.();
        tokenListeners.delete(existing.getId());
        await existing.end('immediate', props);
      }
      activities.delete(attempt.id);
      endedVersions.set(attempt.id, attempt.version);
      if (endedVersions.size > 64) endedVersions.delete(endedVersions.keys().next().value!);
      if (record || cleaned) await AsyncStorage.setItem(storage, JSON.stringify(Object.fromEntries(activities)));
      return;
    }
    if (!existing) {
      existing = factory.start(props, 'edutu://auto-apply/' + encodeURIComponent(attempt.id));
    } else if (record?.version !== attempt.version || record.title !== title || record.activityAction !== activityAction) {
      await existing.update(props);
    }
    const activityId = existing.getId();
    if (cleaned || record?.activityId !== activityId || record.version !== attempt.version ||
        record.title !== title || record.activityAction !== activityAction) {
      activities.set(attempt.id, { activityId, version: attempt.version, title, activityAction });
      await AsyncStorage.setItem(storage, JSON.stringify(Object.fromEntries(activities)));
    }
    if (!tokenListeners.has(activityId)) {
      const subscription = existing.addPushTokenListener(event => {
        if (event.pushToken && tokenListeners.has(activityId)) {
          void registerActivityToken(attempt.id, activityId, event.pushToken).catch(() => {});
        }
      });
      tokenListeners.set(activityId, () => subscription.remove());
      void existing.getPushToken().then(token => {
        if (token && tokenListeners.has(activityId)) return registerActivityToken(attempt.id, activityId, token);
      }).catch(() => {});
    }
  }).catch(() => undefined);
  return pending;
}

export async function refreshAutoApplyActivity(getAuthToken: GetAuthToken, signal: AbortSignal) {
  try {
    await pending;
    if (signal.aborted) return;
    const factory = getAutoApplyActivityFactory();
    if (!factory) return;
    const activities = await readActivities();
    const activityIds = new Set(factory.getInstances().map(instance => instance.getId()));
    for (const [id, record] of activities) {
      if (signal.aborted) return;
      if (!activityIds.has(record.activityId)) continue;
      try {
        const progress = await requestProductApi<AutoApplyProgress>(
          '/me/auto-apply/attempts/' + encodeURIComponent(id), { signal }, getAuthToken, undefined, { throwOnError: true },
        );
        if (progress?.id === id && Object.hasOwn(autoApplyStatus, progress.state) &&
            Number.isSafeInteger(progress.version) && progress.version > 0) {
          await syncAutoApplyActivity(progress, { activityId: record.activityId, signal });
        }
      } catch (error) {
        if (error instanceof ProductApiRequestError && error.status === 404) {
          await dismissMissingActivity(id, record, signal);
        }
      }
    }
  } catch {
    // Live Activities are optional on this device.
  }
}

function dismissMissingActivity(id: string, expected: ActivityRecord, signal: AbortSignal) {
  pending = pending.then(async () => {
    if (signal.aborted) return;
    const activities = await readActivities();
    const current = activities.get(id);
    if (signal.aborted || current?.activityId !== expected.activityId || current.version !== expected.version) return;
    const instance = getAutoApplyActivityFactory()?.getInstances().find(item => item.getId() === expected.activityId);
    if (instance) await instance.end('immediate');
    tokenListeners.get(expected.activityId)?.();
    tokenListeners.delete(expected.activityId);
    activities.delete(id);
    await AsyncStorage.setItem(storage, JSON.stringify(Object.fromEntries(activities)));
  }).catch(() => undefined);
  return pending;
}

async function registerActivityToken(attemptId: string, activityId: string, token: string) {
  const result = await requestProductApi<{ updated: boolean; progress?: AutoApplyProgress }>('/me/auto-apply/attempts/' + encodeURIComponent(attemptId) + '/activity', {
    method: 'PUT', body: JSON.stringify({ activityId, token }),
  });
  const progress = result?.progress;
  if (progress?.id === attemptId && terminal.has(progress.state) &&
      Number.isSafeInteger(progress.version) && progress.version > 0 && tokenListeners.has(activityId)) {
    await syncAutoApplyActivity(progress);
  }
}
