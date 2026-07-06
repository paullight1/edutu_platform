/**
 * Thin wrapper around the Web Notifications API used for on-device deadline
 * reminders. Kept framework-free so both the settings toggle and the reminder
 * engine can share it. Native (Capacitor/FCM) push can register alongside this
 * later — see registerPushToken in services/notifications.ts.
 */

export type NotificationPermissionState =
  | "default"
  | "granted"
  | "denied"
  | "unsupported";

/** localStorage flag toggled from Settings; the engine only runs when true. */
export const REMINDERS_ENABLED_KEY = "edutu.reminders.enabled";
/** Fired when the toggle changes so the engine can re-evaluate immediately. */
export const REMINDERS_CHANGED_EVENT = "edutu:reminders-changed";

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission as NotificationPermissionState;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return "unsupported";
  try {
    const result = await Notification.requestPermission();
    return result as NotificationPermissionState;
  } catch {
    return getNotificationPermission();
  }
}

export function areRemindersEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(REMINDERS_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function setRemindersEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REMINDERS_ENABLED_KEY, String(enabled));
    window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
  } catch {
    // ignore storage failures — reminders simply stay off
  }
}

export interface LocalNotificationOptions {
  title: string;
  body: string;
  /** In-app path opened when the notification is tapped. */
  url?: string;
  /** Collapse key so repeat reminders replace rather than stack. */
  tag?: string;
}

/**
 * Show a local notification. Prefers the active service worker registration
 * (so taps are routed by sw-custom.js even after the tab is backgrounded);
 * falls back to a page-context Notification (e.g. in dev, where no SW runs).
 * Returns true if a notification was shown.
 */
export async function showLocalNotification(
  options: LocalNotificationOptions,
): Promise<boolean> {
  if (getNotificationPermission() !== "granted") return false;

  const url = options.url ?? "/dashboard";
  const notificationOptions: NotificationOptions & { data: { url: string } } = {
    body: options.body,
    tag: options.tag,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    data: { url },
  };

  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(options.title, notificationOptions);
        return true;
      }
    }

    const notification = new Notification(options.title, notificationOptions);
    notification.onclick = () => {
      window.focus();
      window.location.assign(url);
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}
