import AsyncStorage from '@react-native-async-storage/async-storage';

export type OfflineActionType = 'bookmark' | 'unbookmark' | 'create_goal' | 'update_goal' | 'delete_goal';

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: Record<string, any>;
  createdAt: string;
  retryCount: number;
}

const STORAGE_KEY = '@edutu_offline_actions';
const MAX_RETRIES = 3;

// ─── Queue Management ────────────────────────────────────────────────────────

export async function getOfflineActions(): Promise<OfflineAction[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

async function saveActions(actions: OfflineAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
  } catch (error) {
    console.error('Failed to save offline actions:', error);
  }
}

// ─── Add Actions ─────────────────────────────────────────────────────────────

export async function enqueueAction(
  type: OfflineActionType,
  payload: Record<string, any>
): Promise<OfflineAction> {
  const action: OfflineAction = {
    id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };

  const actions = await getOfflineActions();
  actions.push(action);
  await saveActions(actions);

  return action;
}

// ─── Sync Actions ────────────────────────────────────────────────────────────

export interface ActionHandler {
  bookmark: (payload: { userId: string; opportunityId: string }) => Promise<boolean>;
  unbookmark: (payload: { userId: string; opportunityId: string }) => Promise<boolean>;
  create_goal: (payload: Record<string, any>) => Promise<boolean>;
  update_goal: (payload: { id: string; updates: Record<string, any> }) => Promise<boolean>;
  delete_goal: (payload: { id: string }) => Promise<boolean>;
}

export async function syncOfflineActions(
  handlers: ActionHandler
): Promise<{ synced: number; failed: number }> {
  let actions = await getOfflineActions();
  if (actions.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  const remaining: OfflineAction[] = [];

  for (const action of actions) {
    try {
      const handler = handlers[action.type];
      if (!handler) {
        if (__DEV__) {
          console.warn(`No handler for action type: ${action.type}`);
        }
        remaining.push(action);
        continue;
      }

      const success = await handler(action.payload as any);

      if (success) {
        synced++;
      } else {
        if (action.retryCount < MAX_RETRIES) {
          action.retryCount++;
          remaining.push(action);
        } else {
          failed++;
        }
      }
    } catch (error) {
      console.error(`Failed to sync action ${action.id}:`, error);
      if (action.retryCount < MAX_RETRIES) {
        action.retryCount++;
        remaining.push(action);
      } else {
        failed++;
      }
    }
  }

  await saveActions(remaining);

  return { synced, failed };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

export async function clearOfflineActions(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export async function getPendingActionCount(): Promise<number> {
  const actions = await getOfflineActions();
  return actions.length;
}
