/**
 * User Settings Service
 * Manages user settings (privacy, security) with Supabase persistence
 */

import { supabase } from '../lib/supabaseClient';
import { authService } from '../lib/auth';

// ================================
// Types
// ================================

export interface PrivacySettings {
    profileVisibility: 'public' | 'friends' | 'private';
    dataSharing: boolean;
    analyticsTracking: boolean;
    personalizedAds: boolean;
    activityStatus: boolean;
    searchVisibility: boolean;
}

export interface SecuritySettings {
    twoFactorEnabled: boolean;
    lastPasswordUpdate: string | null;
    lastDataDownload: string | null;
}

export interface UserSettings {
    privacy: PrivacySettings;
    security: SecuritySettings;
    updatedAt: string;
}

const DEFAULT_PRIVACY: PrivacySettings = {
    profileVisibility: 'public',
    dataSharing: false,
    analyticsTracking: true,
    personalizedAds: false,
    activityStatus: true,
    searchVisibility: true,
};

const DEFAULT_SECURITY: SecuritySettings = {
    twoFactorEnabled: false,
    lastPasswordUpdate: null,
    lastDataDownload: null,
};

// ================================
// Settings CRUD
// ================================

export async function getUserSettings(): Promise<UserSettings | null> {
    const user = await authService.getCurrentUser();
    if (!user) return null;

    try {
        const profile = await authService.getProfile(user.id);
        if (!profile?.preferences) {
            return {
                privacy: DEFAULT_PRIVACY,
                security: DEFAULT_SECURITY,
                updatedAt: new Date().toISOString(),
            };
        }

        const prefs = profile.preferences as Record<string, unknown>;

        return {
            privacy: {
                ...DEFAULT_PRIVACY,
                ...(prefs.privacy as Partial<PrivacySettings> || {}),
            },
            security: {
                ...DEFAULT_SECURITY,
                ...(prefs.security as Partial<SecuritySettings> || {}),
            },
            updatedAt: (prefs.settingsUpdatedAt as string) || new Date().toISOString(),
        };
    } catch (error) {
        console.error('Failed to fetch user settings:', error);
        return null;
    }
}

export async function savePrivacySettings(
    settings: Partial<PrivacySettings>
): Promise<{ success: boolean; error?: string }> {
    const user = await authService.getCurrentUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
        const currentSettings = await getUserSettings();
        const updatedPrivacy = {
            ...DEFAULT_PRIVACY,
            ...currentSettings?.privacy,
            ...settings,
        };

        const profile = await authService.getProfile(user.id);
        const existingPrefs = (profile?.preferences || {}) as Record<string, unknown>;

        await authService.upsertProfile({
            user_id: user.id,
            preferences: {
                ...existingPrefs,
                privacy: updatedPrivacy,
                settingsUpdatedAt: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
        });

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to save privacy settings:', error);
        return { success: false, error: message };
    }
}

export async function saveSecuritySettings(
    settings: Partial<SecuritySettings>
): Promise<{ success: boolean; error?: string }> {
    const user = await authService.getCurrentUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
        const currentSettings = await getUserSettings();
        const updatedSecurity = {
            ...DEFAULT_SECURITY,
            ...currentSettings?.security,
            ...settings,
        };

        const profile = await authService.getProfile(user.id);
        const existingPrefs = (profile?.preferences || {}) as Record<string, unknown>;

        await authService.upsertProfile({
            user_id: user.id,
            preferences: {
                ...existingPrefs,
                security: updatedSecurity,
                settingsUpdatedAt: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
        });

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to save security settings:', error);
        return { success: false, error: message };
    }
}

// ================================
// Password Management
// ================================

export async function changePassword(
    userId: string,
    _currentPassword: string,
    newPassword: string
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!userId) {
            return { success: false, error: 'User not authenticated' };
        }

        // Password updates must be done through Clerk's useUser() hook from a component
        // This service method is kept for compatibility but requires Clerk's user.update()
        // to be called from the component layer instead.
        return { success: false, error: 'Password updates must be done through account settings.' };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

// ================================
// Two-Factor Authentication
// ================================

export async function toggleTwoFactor(
    enable: boolean
): Promise<{ success: boolean; error?: string }> {
    try {
        // Note: Supabase handles 2FA through their MFA API
        // For now, we'll just track the preference
        await saveSecuritySettings({
            twoFactorEnabled: enable,
        });

        // TODO: Integrate with Supabase MFA when ready
        // const { data, error } = await supabase.auth.mfa.enroll({
        //   factorType: 'totp',
        // });

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

// ================================
// Data Export
// ================================

export async function exportUserData(): Promise<{
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
}> {
    const user = await authService.getCurrentUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
        // Fetch all user data from various tables
        const [
            profileResult,
            goalsResult,
            analyticsResult,
            notificationsResult,
        ] = await Promise.all([
            supabase.from('profiles').select('*').eq('user_id', user.id).single(),
            supabase.from('goals').select('*').eq('user_id', user.id),
            supabase.from('analytics').select('*').eq('user_id', user.id),
            supabase.from('notifications').select('*').eq('user_id', user.id),
        ]);

        const exportData = {
            exportedAt: new Date().toISOString(),
            user: {
                id: user.id,
                email: user.email,
                name: user.name || 'Unknown',
            },
            profile: profileResult.data || null,
            goals: goalsResult.data || [],
            analytics: analyticsResult.data || [],
            notifications: notificationsResult.data || [],
        };

        // Update last download timestamp
        await saveSecuritySettings({
            lastDataDownload: new Date().toISOString(),
        });

        return { success: true, data: exportData };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

// ================================
// Account Deletion
// ================================

export async function requestAccountDeletion(): Promise<{
    success: boolean;
    error?: string;
}> {
    const user = await authService.getCurrentUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
        // Create a support ticket for account deletion using RPC or direct table insert
        // Note: The schema might not have support_tickets table yet
        // For now, we'll just mark the profile for deletion

        // Mark the account for deletion in preferences
        const profile = await authService.getProfile(user.id);
        const existingPrefs = (profile?.preferences || {}) as Record<string, unknown>;

        await authService.upsertProfile({
            user_id: user.id,
            preferences: {
                ...existingPrefs,
                deletionRequested: true,
                deletionRequestedAt: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
        });

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

export default {
    getUserSettings,
    savePrivacySettings,
    saveSecuritySettings,
    changePassword,
    toggleTwoFactor,
    exportUserData,
    requestAccountDeletion,
};
