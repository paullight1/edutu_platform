import { SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_PROMPT_KEY = 'edutu_profile_prompt_dismissed';
const PROFILE_PROMPT_EXPIRY_KEY = 'edutu_profile_prompt_expiry';

export interface InAppNotification {
    id: string;
    title: string;
    body: string;
    kind: 'profile-incomplete' | 'opportunity-match' | 'goal-reminder' | 'feature-highlight';
    severity: 'info' | 'warning' | 'success';
    actionRoute?: string;
    actionLabel?: string;
    createdAt: string;
}

class InAppNotificationService {
    private supabase: SupabaseClient | null = null;

    initialize(supabase: SupabaseClient) {
        this.supabase = supabase;
    }

    async shouldShowProfilePrompt(userId: string): Promise<boolean> {
        try {
            const dismissed = await AsyncStorage.getItem(`${PROFILE_PROMPT_KEY}:${userId}`);
            const expiryRaw = await AsyncStorage.getItem(`${PROFILE_PROMPT_EXPIRY_KEY}:${userId}`);

            if (dismissed === 'true' && expiryRaw) {
                const expiry = new Date(expiryRaw);
                if (new Date() < expiry) {
                    return false;
                }
            }

            return true;
        } catch {
            return true;
        }
    }

    async dismissProfilePrompt(userId: string, durationDays: number = 7): Promise<void> {
        try {
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + durationDays);

            await AsyncStorage.setItem(`${PROFILE_PROMPT_KEY}:${userId}`, 'true');
            await AsyncStorage.setItem(`${PROFILE_PROMPT_EXPIRY_KEY}:${userId}`, expiry.toISOString());
        } catch (error) {
            console.error('Error dismissing profile prompt:', error);
        }
    }

    async createInAppNotification(
        userId: string,
        notification: Omit<InAppNotification, 'id' | 'createdAt'>
    ): Promise<boolean> {
        if (!this.supabase) return false;

        try {
            const { error } = await this.supabase
                .from('user_notifications')
                .insert({
                    user_id: userId,
                    title: notification.title,
                    body: notification.body,
                    kind: notification.kind,
                    severity: notification.severity,
                    action_route: notification.actionRoute || null,
                    action_label: notification.actionLabel || null,
                });

            if (error) {
                console.error('Error creating in-app notification:', error);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error creating in-app notification:', error);
            return false;
        }
    }

    async sendProfileUpdatePrompt(
        userId: string,
        missingFields: string[]
    ): Promise<boolean> {
        return false;
    }

    async sendOpportunityMatchNotification(
        userId: string,
        opportunityTitle: string,
        matchScore: number
    ): Promise<boolean> {
        const notification: Omit<InAppNotification, 'id' | 'createdAt'> = {
            title: `${matchScore}% Match Found!`,
            body: `"${opportunityTitle}" looks like a great fit based on your profile.`,
            kind: 'opportunity-match',
            severity: 'success',
            actionRoute: '/opportunities',
            actionLabel: 'View Opportunity',
        };

        return await this.createInAppNotification(userId, notification);
    }

    async sendFeatureHighlightNotification(
        userId: string,
        feature: string,
        description: string,
        route: string
    ): Promise<boolean> {
        const notification: Omit<InAppNotification, 'id' | 'createdAt'> = {
            title: `Try: ${feature}`,
            body: description,
            kind: 'feature-highlight',
            severity: 'info',
            actionRoute: route,
            actionLabel: 'Try Now',
        };

        return await this.createInAppNotification(userId, notification);
    }
}

export const inAppNotificationService = new InAppNotificationService();
