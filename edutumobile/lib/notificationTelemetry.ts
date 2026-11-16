import { getConfig } from './config';

/**
 * Reports that the user tapped a push notification.
 *
 * Distinct from marking it read: `read_at` only means the row was seen in the
 * inbox list, whereas `opened_at` means the notification itself earned a tap.
 * Per-kind open rate — and therefore the fatigue suppression that depends on
 * it — is computable only from the latter.
 *
 * The backend endpoint is deliberately unauthenticated (the web service worker
 * that also calls it has no session), so this sends no token. Fully
 * fire-and-forget: a user who tapped a notification must never see an error,
 * and navigation must never wait on telemetry.
 */
export function reportNotificationOpened(notificationId: unknown): void {
    if (typeof notificationId !== 'string' || !notificationId.trim()) return;

    const apiUrl = getConfig().apiBaseUrl?.replace(/\/$/, '');
    if (!apiUrl) return;

    void fetch(`${apiUrl}/notifications/${encodeURIComponent(notificationId)}/opened`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openedAt: new Date().toISOString() }),
    }).catch(() => undefined);
}
