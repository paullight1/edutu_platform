import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getConfig } from './config';
import { registerNotificationCategoriesAsync } from './notificationCategories';
import { registerNotificationActionTask } from './notificationActionTask';
import i18n from './i18n';

const PUSH_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const PUSH_TOKEN_KEY = '@edutu_expo_push_token';

let lastPushSyncKey: string | null = null;
let pushSyncInFlight: Promise<void> | null = null;
let pushSyncDisabledUntil = 0;
let hasLoggedPushSyncError = false;

/**
 * The Expo token last registered from this device, kept so the settings screen
 * can unregister it server-side when push is turned off. Survives restarts:
 * the token is stable per install, but re-deriving it requires the permission
 * prompt, which we must not trigger just to delete it.
 */
export async function getStoredPushToken(): Promise<string | null> {
    try {
        return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    } catch {
        return null;
    }
}

/**
 * Clears the in-memory sync dedupe so the next register re-POSTs the token.
 * Without this, toggling push off (which deletes the token server-side) and
 * back on would be a no-op — the key still matches the last successful sync.
 */
export async function resetPushTokenSync(): Promise<void> {
    lastPushSyncKey = null;
    pushSyncDisabledUntil = 0;
    try {
        await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    } catch {
        // Best-effort: a stale key only costs one redundant POST.
    }
}

function isNetworkError(error: unknown): boolean {
    return error instanceof TypeError && error.message === 'Network request failed';
}

type AuthTokenGetter = () => Promise<string | null | undefined>;

async function syncPushToken(userId: string, getAuthToken: AuthTokenGetter, token: string): Promise<void> {
    const apiUrl = getConfig().apiBaseUrl.replace(/\/$/, '');
    if (!apiUrl) return;

    const syncKey = `${userId}:${token}`;
    if (lastPushSyncKey === syncKey || Date.now() < pushSyncDisabledUntil) return;
    if (pushSyncInFlight) return pushSyncInFlight;

    pushSyncInFlight = (async () => {
        try {
            // Fetch the Clerk token FRESH here, immediately before the request.
            // Clerk default session tokens live ~60s, and the permission prompt
            // + getExpoPushTokenAsync() network round-trip that precede this can
            // easily burn most of that window — a token captured earlier was
            // often already expired by the time we posted it, yielding a 401.
            const authToken = await getAuthToken();
            if (!authToken) return;

            const response = await fetch(`${apiUrl}/notifications/push-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                    token,
                    provider: 'expo',
                    device: {
                        platform: Platform.OS,
                    },
                }),
            });

            if (!response.ok) {
                throw new Error(`Push token sync failed with ${response.status}`);
            }

            lastPushSyncKey = syncKey;
            hasLoggedPushSyncError = false;
        } catch (error) {
            // Push-token sync is best-effort background work. Any failure
            // (offline, 401/auth, endpoint unavailable) must degrade quietly —
            // never surface as a fatal error. Back off and warn once in dev.
            pushSyncDisabledUntil = Date.now() + PUSH_SYNC_COOLDOWN_MS;
            if (__DEV__ && !hasLoggedPushSyncError) {
                const reason = isNetworkError(error)
                    ? 'API is not reachable'
                    : error instanceof Error
                        ? error.message
                        : String(error);
                console.warn(`Push token sync skipped: ${reason}`);
                hasLoggedPushSyncError = true;
            }
        } finally {
            pushSyncInFlight = null;
        }
    })();

    return pushSyncInFlight;
}

export interface RegisterPushOptions {
    /**
     * Whether a missing permission may raise the OS prompt. Launch-time
     * registration passes `false`: the system prompt is a one-shot resource on
     * iOS and firing it on a cold start — before the user has any reason to
     * say yes — is how you lose it permanently. Contextual opt-ins and the
     * settings toggle pass `true` (the default).
     */
    promptIfNeeded?: boolean;
}

export async function registerForPushNotificationsAsync(
    userId?: string,
    getAuthToken?: AuthTokenGetter,
    options: RegisterPushOptions = {},
): Promise<string | null> {
    const { promptIfNeeded = true } = options;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        if (!promptIfNeeded) return null;
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        return null;
    }

    // Must precede the token fetch: a notification whose categoryId isn't
    // registered on the device arrives with no action buttons at all.
    await registerNotificationCategoriesAsync();
    await registerNotificationActionTask();

    const token = (await Notifications.getExpoPushTokenAsync({
        projectId: '97c7d577-7e08-4f3c-a199-d1ca149ebee9',
    }));

    if (token?.data) {
        await AsyncStorage.setItem(PUSH_TOKEN_KEY, token.data).catch(() => undefined);
    }

    if (userId && token) {
        if (__DEV__) {
            console.log('Push token registered for user:', userId);
        }
        if (getAuthToken) {
            await syncPushToken(userId, getAuthToken, token.data);
        }
    }

    if (Platform.OS === 'android') {
        Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#171a4f',
        });
        // Server pushes target these via the payload channelId, so users can
        // tune opportunity alerts and deadline reminders independently in
        // Android settings.
        Notifications.setNotificationChannelAsync('opportunities', {
            name: 'Opportunity alerts',
            description: 'New opportunities matched to your interests',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#171a4f',
        });
        Notifications.setNotificationChannelAsync('deadlines', {
            name: 'Deadline reminders',
            description: 'Reminders before saved opportunities close',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#171a4f',
        });
        Notifications.setNotificationChannelAsync('community', {
            name: 'Community messages',
            description: 'Direct messages, group activity and invitations',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 180, 120, 180],
            lightColor: '#146EF5',
        });
    }

    return token.data;
}

// Notification settings interface
export interface NotificationSettings {
    pushEnabled: boolean;
    emailEnabled: boolean;
    hapticsEnabled: boolean;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
}

// Mirrors the server's `notification_preferences` column defaults, including
// quiet hours being ON at 22:00–08:00: the backend defers pushes in that window
// for users who have never saved a preference, so showing the switch as off
// would misreport what actually happens.
const DEFAULT_SETTINGS: NotificationSettings = {
    pushEnabled: true,
    emailEnabled: false,
    hapticsEnabled: true,
    quietHoursEnabled: true,
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
};

const SETTINGS_KEY = '@edutu_notification_settings';

// Configure how notifications are handled when the app is foregrounded
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

class NotificationService {
    private settings: NotificationSettings = DEFAULT_SETTINGS;

    constructor() {
        this.loadSettings();
    }

    // Load settings from storage
    async loadSettings(): Promise<NotificationSettings> {
        try {
            const stored = await AsyncStorage.getItem(SETTINGS_KEY);
            if (stored) {
                this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
            }
        } catch (error) {
            console.error('Error loading notification settings:', error);
        }
        return this.settings;
    }

    // Save settings to storage
    async saveSettings(settings: Partial<NotificationSettings>): Promise<void> {
        this.settings = { ...this.settings, ...settings };
        try {
            await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
        } catch (error) {
            console.error('Error saving notification settings:', error);
        }
    }

    // Get current settings
    getSettings(): NotificationSettings {
        return this.settings;
    }

    async requestPermissions() {
        if (Platform.OS === 'web') return false;
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        return finalStatus === 'granted';
    }

    /** Minutes past midnight for a local Date. */
    private minutesOf(date: Date): number {
        return date.getHours() * 60 + date.getMinutes();
    }

    /** Whether a local time falls inside the configured quiet-hours window. */
    private isInQuietHours(at: Date = new Date()): boolean {
        if (!this.settings.quietHoursEnabled) return false;

        const currentTime = this.minutesOf(at);

        const [startHour, startMin] = this.settings.quietHoursStart.split(':').map(Number);
        const [endHour, endMin] = this.settings.quietHoursEnd.split(':').map(Number);

        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;
        // A zero-length window means quiet hours are off (see QUIET_HOURS_OFF).
        if (startTime === endTime) return false;

        if (startTime < endTime) {
            return currentTime >= startTime && currentTime < endTime;
        }
        return currentTime >= startTime || currentTime < endTime; // wraps midnight
    }

    /**
     * Moves a scheduled local notification to the end of the quiet-hours window
     * when it would otherwise fire inside it, mirroring what the backend does
     * for server pushes. Times outside the window are returned untouched.
     */
    private shiftOutOfQuietHours(target: Date): Date {
        if (!this.isInQuietHours(target)) return target;

        const [endHour, endMin] = this.settings.quietHoursEnd.split(':').map(Number);
        const shifted = new Date(target);
        shifted.setHours(endHour, endMin, 0, 0);
        // A window that wraps midnight ends on the following day.
        if (shifted.getTime() <= target.getTime()) {
            shifted.setDate(shifted.getDate() + 1);
        }
        return shifted;
    }

    // Trigger haptic feedback.
    //
    // Deliberately NOT gated on quiet hours: this fires for taps the user just
    // made, and quiet hours mute alerts, not the interface responding to touch.
    async triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light'): Promise<void> {
        if (!this.settings.hapticsEnabled) {
            return;
        }

        try {
            switch (type) {
                case 'light':
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    break;
                case 'medium':
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    break;
                case 'heavy':
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    break;
                case 'success':
                    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    break;
                case 'warning':
                    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    break;
                case 'error':
                    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    break;
            }
        } catch (error) {
            console.error('Error triggering haptic:', error);
        }
    }

    // Schedule local notifications for a goal/deadline
    async scheduleGoalReminder(goalId: string, title: string, deadline: string): Promise<string | null> {
        if (!this.settings.pushEnabled) return null;

        const targetDate = new Date(deadline);
        // Set to 9 AM
        targetDate.setHours(9, 0, 0, 0);

        if (targetDate.getTime() < Date.now()) return null;

        const ids: string[] = [];

        // Every fire time is pushed past the user's quiet-hours window, so a
        // reminder never buzzes while they've asked for silence.
        const schedule = async (
            at: Date,
            content: Notifications.NotificationContentInput,
        ) => {
            const fireAt = this.shiftOutOfQuietHours(at);
            if (fireAt.getTime() <= Date.now()) return;
            ids.push(
                await Notifications.scheduleNotificationAsync({
                    content,
                    trigger: { date: fireAt } as Notifications.NotificationTriggerInput,
                }),
            );
        };

        try {
            // Schedule Day Of
            await schedule(targetDate, {
                title: i18n.t('misc:notifications.goalDeadlineToday.title'),
                body: i18n.t('misc:notifications.goalDeadlineToday.body', { title }),
                data: { goalId, type: 'goal_deadline' },
            });

            // Schedule 1 Day Before
            await schedule(new Date(targetDate.getTime() - (24 * 60 * 60 * 1000)), {
                title: i18n.t('misc:notifications.deadlineTomorrow.title'),
                body: i18n.t('misc:notifications.deadlineTomorrow.body', { title }),
                data: { goalId, type: 'goal_deadline_reminder' },
            });

            // Schedule 3 Days Before
            await schedule(new Date(targetDate.getTime() - (3 * 24 * 60 * 60 * 1000)), {
                title: i18n.t('misc:notifications.deadlineApproaching.title'),
                body: i18n.t('misc:notifications.deadlineApproaching.body', { title }),
                data: { goalId, type: 'goal_deadline_reminder' },
            });

            return ids.length > 0 ? ids.join(',') : null;
        } catch (error) {
            console.error('Error scheduling notification:', error);
            // Return whatever ids we managed to schedule
            return ids.length > 0 ? ids.join(',') : null;
        }
    }

    async cancelNotification(notificationIds: string) {
        if (!notificationIds) return;
        const ids = notificationIds.split(',');
        for (const id of ids) {
            if (id) {
                try {
                    await Notifications.cancelScheduledNotificationAsync(id);
                } catch (error) {
                    console.error('Error cancelling notification:', error);
                }
            }
        }
    }

    // Notify with haptics
    async notify(options: {
        haptic?: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';
    } = {}): Promise<void> {
        const { haptic = 'light' } = options;
        await this.triggerHaptic(haptic);
    }

    // Success notification
    async notifySuccess(): Promise<void> {
        await this.notify({ haptic: 'success' });
    }

    // Error notification
    async notifyError(): Promise<void> {
        await this.notify({ haptic: 'error' });
    }

    // Warning notification
    async notifyWarning(): Promise<void> {
        await this.notify({ haptic: 'warning' });
    }
}

// Export singleton instance
export const notificationService = new NotificationService();
