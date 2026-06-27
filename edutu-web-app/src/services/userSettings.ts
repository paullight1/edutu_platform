/**
 * User Settings Service
 * Manages member settings through the backend API.
 */

import { productApiRequest } from "./productApi";
import logger from "../lib/logger";

// ================================
// Types
// ================================

export interface PrivacySettings {
  profileVisibility: "public" | "friends" | "private";
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
  deletionRequested?: boolean;
  deletionRequestedAt?: string | null;
}

export interface UserSettings {
  privacy: PrivacySettings;
  security: SecuritySettings;
  updatedAt: string;
}

const DEFAULT_PRIVACY: PrivacySettings = {
  profileVisibility: "public",
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

function requireToken(token?: string | null): string {
  if (!token) {
    throw new Error("Sign in again to manage account settings.");
  }
  return token;
}

export async function getUserSettings(
  token?: string | null,
): Promise<UserSettings | null> {
  try {
    const data = await productApiRequest<UserSettings>(
      "/profile/settings",
      requireToken(token),
    );
    return {
      privacy: { ...DEFAULT_PRIVACY, ...(data.privacy || {}) },
      security: { ...DEFAULT_SECURITY, ...(data.security || {}) },
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
  } catch (error) {
    logger.error("Failed to fetch user settings:", error);
    return null;
  }
}

export async function savePrivacySettings(
  settings: Partial<PrivacySettings>,
  token?: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    await productApiRequest<UserSettings>(
      "/profile/settings",
      requireToken(token),
      {
        method: "PATCH",
        body: JSON.stringify({ privacy: settings }),
      },
    );

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to save privacy settings:", error);
    return { success: false, error: message };
  }
}

export async function saveSecuritySettings(
  settings: Partial<SecuritySettings>,
  token?: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    await productApiRequest<UserSettings>(
      "/profile/settings",
      requireToken(token),
      {
        method: "PATCH",
        body: JSON.stringify({ security: settings }),
      },
    );

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to save security settings:", error);
    return { success: false, error: message };
  }
}

// ================================
// Password Management
// ================================

export async function changePassword(
  userId: string,
  _currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!userId) {
      return { success: false, error: "User not authenticated" };
    }

    // Password updates must be done through Clerk's useUser() hook from a component
    // This service method is kept for compatibility but requires Clerk's user.update()
    // to be called from the component layer instead.
    return {
      success: false,
      error: "Password updates must be done through account settings.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

// ================================
// Two-Factor Authentication
// ================================

export async function toggleTwoFactor(
  enable: boolean,
  token?: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    await saveSecuritySettings(
      {
        twoFactorEnabled: enable,
      },
      token,
    );

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

// ================================
// Data Export
// ================================

export async function exportUserData(token?: string | null): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
  try {
    const exportData = await productApiRequest<Record<string, unknown>>(
      "/profile/export",
      requireToken(token),
      {
        method: "POST",
      },
    );
    return { success: true, data: exportData };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

// ================================
// Account Deletion
// ================================

export async function requestAccountDeletion(token?: string | null): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    await productApiRequest("/profile/deletion-request", requireToken(token), {
      method: "PATCH",
    });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
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
