import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getConfig } from './config';

const PUSH_SYNC_COOLDOWN_MS = 5 * 60 * 1000;

let lastPushSyncKey: string | null = null;
let pushSyncInFlight: Promise<void> | null = null;
let pushSyncDisabledUntil = 0;
let hasLoggedPushSyncNetworkError = false;

function isNetworkError(error: unknown): boolean {
    return error instanceof TypeError && error.message === 'Network request failed';
}

async function syncPushToken(userId: string, authToken: string, token: string): Promise<void> {
    const apiUrl = getConfig().apiBaseUrl.replace(/\/$/, '');
    if (!apiUrl || !authToken) return;

    const syncKey = `${userId}:${token}`;
    if (lastPushSyncKey === syncKey || Date.now() < pushSyncDisabledUntil) return;
    if (pushSyncInFlight) return pushSyncInFlight;

    pushSyncInFlight = (async () => {
        try {
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
            hasLoggedPushSyncNetworkError = false;
        } catch (error) {
            pushSyncDisabledUntil = Date.now() + PUSH_SYNC_COOLDOWN_MS;
            if (isNetworkError(error)) {
                if (__DEV__ && !hasLoggedPushSyncNetworkError) {
                    console.warn('Push token sync skipped: API is not reachable');
                    hasLoggedPushSyncNetworkError = true;
                }
                return;
            }
            console.error('Error syncing push token:', error);
        } finally {
            pushSyncInFlight = null;
        }
    })();

    return pushSyncInFlight;
}

export async function registerForPushNotificationsAsync(userId?: string, authToken?: string | null): Promise<string | null> {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        return null;
    }

    const token = (await Notifications.getExpoPushTokenAsync({
        projectId: '97c7d577-7e08-4f3c-a199-d1ca149ebee9',
    }));

    if (userId && token) {
        if (__DEV__) {
            console.log('Push token registered for user:', userId);
        }
        if (authToken) {
            await syncPushToken(userId, authToken, token.data);
        }
    }

    if (Platform.OS === 'android') {
        Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#171a4f',
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

const DEFAULT_SETTINGS: NotificationSettings = {
    pushEnabled: true,
    emailEnabled: false,
    hapticsEnabled: true,
    quietHoursEnabled: false,
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

    // Check if in quiet hours
    private isInQuietHours(): boolean {
        if (!this.settings.quietHoursEnabled) return false;

        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        const [startHour, startMin] = this.settings.quietHoursStart.split(':').map(Number);
        const [endHour, endMin] = this.settings.quietHoursEnd.split(':').map(Number);

        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;

        if (startTime <= endTime) {
            return currentTime >= startTime && currentTime <= endTime;
        } else {
            return currentTime >= startTime || currentTime <= endTime;
        }
    }

    // Trigger haptic feedback
    async triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light'): Promise<void> {
        if (!this.settings.hapticsEnabled || this.isInQuietHours()) {
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

        try {
            // Schedule Day Of
            const idDayOf = await Notifications.scheduleNotificationAsync({
                content: {
                    title: "Goal Deadline Today! 🎯",
                    body: `Don't forget: ${title}`,
                    data: { goalId, type: 'goal_deadline' },
                },
                trigger: {
                    date: targetDate,
                } as Notifications.NotificationTriggerInput,
            });
            ids.push(idDayOf);

            // Schedule 1 Day Before
            const oneDayBefore = new Date(targetDate.getTime() - (24 * 60 * 60 * 1000));
            if (oneDayBefore.getTime() > Date.now()) {
                const id1 = await Notifications.scheduleNotificationAsync({
                    content: {
                        title: "Deadline Tomorrow! ⏱️",
                        body: `Upcoming: ${title}`,
                        data: { goalId, type: 'goal_deadline_reminder' },
                    },
                    trigger: { date: oneDayBefore } as Notifications.NotificationTriggerInput,
                });
                ids.push(id1);
            }

            // Schedule 3 Days Before
            const threeDaysBefore = new Date(targetDate.getTime() - (3 * 24 * 60 * 60 * 1000));
            if (threeDaysBefore.getTime() > Date.now()) {
                const id3 = await Notifications.scheduleNotificationAsync({
                    content: {
                        title: "Deadline Approaching 🗓️",
                        body: `3 days left for: ${title}`,
                        data: { goalId, type: 'goal_deadline_reminder' },
                    },
                    trigger: { date: threeDaysBefore } as Notifications.NotificationTriggerInput,
                });
                ids.push(id3);
            }

            return ids.join(',');
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
