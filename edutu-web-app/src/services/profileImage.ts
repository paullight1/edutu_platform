/**
 * Profile Image Service
 * Handles profile image upload, storage, and retrieval using Supabase Storage
 */

import { supabase } from '../lib/supabaseClient';
import { authService } from '../lib/auth';

const BUCKET_NAME = 'avatars';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// ================================
// Image Upload
// ================================

export async function uploadProfileImage(
    userId: string,
    file: File
): Promise<{ success: boolean; url?: string; error?: string }> {
    if (!userId) {
        return { success: false, error: 'Not authenticated' };
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
        return {
            success: false,
            error: 'Invalid file type. Please use JPEG, PNG, GIF, or WebP.',
        };
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        return {
            success: false,
            error: 'File is too large. Maximum size is 5MB.',
        };
    }

    try {
        // Generate unique filename
        const fileExt = file.name.split('.').pop() || 'jpg';
        const fileName = `${userId}/avatar-${Date.now()}.${fileExt}`;

        // Delete existing avatar if any
        const { data: existingFiles } = await supabase.storage
            .from(BUCKET_NAME)
            .list(userId);

        if (existingFiles && existingFiles.length > 0) {
            const filesToDelete = existingFiles.map((f) => `${userId}/${f.name}`);
            await supabase.storage.from(BUCKET_NAME).remove(filesToDelete);
        }

        // Upload new image
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: true,
            });

        if (error) {
            throw error;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(data.path);

        const publicUrl = urlData.publicUrl;

        // Update profile with new avatar URL
        await saveProfileImageUrl(userId, publicUrl);

        return { success: true, url: publicUrl };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to upload profile image:', error);
        return { success: false, error: message };
    }
}

// ================================
// Image URL Management
// ================================

export async function saveProfileImageUrl(userId: string, url: string): Promise<void> {
    if (!userId) return;

    try {
        // Update the profile with the new avatar URL
        const profile = await authService.getProfile(userId);
        const existingPrefs = (profile?.preferences || {}) as Record<string, unknown>;

        await authService.upsertProfile({
            user_id: userId,
            avatar_url: url,
            preferences: {
                ...existingPrefs,
                avatarUrl: url,
                avatarUpdatedAt: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to save profile image URL:', error);
        throw error;
    }
}

export async function getProfileImageUrl(userId: string): Promise<string | null> {
    if (!userId) return null;

    try {
        const profile = await authService.getProfile(userId);

        // Check various places where avatar URL might be stored
        const avatarUrl =
            profile?.avatar_url ||
            (profile?.preferences as Record<string, unknown>)?.avatarUrl as string ||
            null;

        return avatarUrl;
    } catch (error) {
        console.error('Failed to get profile image URL:', error);
        return null;
    }
}

export async function deleteProfileImage(userId: string): Promise<{ success: boolean; error?: string }> {
    if (!userId) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        // Delete from storage
        const { data: existingFiles } = await supabase.storage
            .from(BUCKET_NAME)
            .list(userId);

        if (existingFiles && existingFiles.length > 0) {
            const filesToDelete = existingFiles.map((f) => `${userId}/${f.name}`);
            await supabase.storage.from(BUCKET_NAME).remove(filesToDelete);
        }

        // Clear avatar URL from profile
        const profile = await authService.getProfile(userId);
        const existingPrefs = (profile?.preferences || {}) as Record<string, unknown>;
        delete existingPrefs.avatarUrl;

        await authService.upsertProfile({
            user_id: userId,
            avatar_url: undefined,
            preferences: existingPrefs,
            updated_at: new Date().toISOString(),
        });

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to delete profile image:', error);
        return { success: false, error: message };
    }
}

// ================================
// Image Processing Utilities
// ================================

export function resizeImage(
    file: File,
    maxWidth: number = 400,
    maxHeight: number = 400,
    quality: number = 0.8
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                // Calculate new dimensions
                if (width > height) {
                    if (width > maxWidth) {
                        height = (height * maxWidth) / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = (width * maxHeight) / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to create blob'));
                        }
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

export async function uploadResizedProfileImage(
    userId: string,
    file: File
): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
        // Resize the image before uploading
        const resizedBlob = await resizeImage(file);
        const resizedFile = new File([resizedBlob], file.name, {
            type: 'image/jpeg',
        });

        return uploadProfileImage(userId, resizedFile);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

export default {
    uploadProfileImage,
    uploadResizedProfileImage,
    saveProfileImageUrl,
    getProfileImageUrl,
    deleteProfileImage,
    resizeImage,
};
