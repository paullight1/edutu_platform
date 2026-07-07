import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { syncWidgetSuite } from './widgetSuiteSync';

/**
 * Keeps the home-screen widget fresh even while the app is never opened.
 *
 * The app already re-syncs the widget on foreground, but a countdown that
 * reads "3 days left" freezes once the app is backgrounded. iOS runs this
 * task opportunistically (a handful of times a day — the OS decides the exact
 * cadence) to rebuild the snapshot from the server-curated widget feed and the
 * cached opportunities, dropping expired items and recomputing deadline text.
 *
 * No auth token is needed: `syncAndUpdateOpportunityWidgetSnapshot` falls back
 * to the unauthenticated mobile-control feed and the on-device opportunity
 * cache, both of which work headless.
 *
 * NOTE: this only runs in a native build (dev client / TestFlight / App
 * Store). It is a no-op in Expo Go, and requires a rebuild after install.
 */
export const WIDGET_REFRESH_TASK = 'edutu-opportunity-widget-refresh';

// Minutes. Only a hint — iOS coalesces background work and enforces its own
// minimum; a few hours is plenty for a once-or-twice-daily opportunity widget.
const MINIMUM_INTERVAL_MINUTES = 6 * 60;

TaskManager.defineTask(WIDGET_REFRESH_TASK, async () => {
  try {
    // Headless-safe: opportunities fall back to the unauthenticated feed and
    // on-device cache, deadlines to their last synced list, trending to the
    // public API — no auth token required for any of them.
    await syncWidgetSuite({});
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Register the widget refresh task if the platform allows it. Safe to call on
 * every launch — it no-ops when already registered or when background work is
 * restricted (e.g. Low Power Mode, or the native module is unavailable).
 */
export async function registerWidgetBackgroundRefresh(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      return;
    }

    const alreadyRegistered =
      await TaskManager.isTaskRegisteredAsync(WIDGET_REFRESH_TASK);
    if (alreadyRegistered) {
      return;
    }

    await BackgroundTask.registerTaskAsync(WIDGET_REFRESH_TASK, {
      minimumInterval: MINIMUM_INTERVAL_MINUTES,
    });
  } catch {
    // Best-effort: the widget still refreshes on foreground even if the OS
    // won't grant background execution.
  }
}
