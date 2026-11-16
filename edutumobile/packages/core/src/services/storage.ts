import { SupabaseClient } from '@supabase/supabase-js';
import { toSafeUUID } from '../utils/auth';

export interface StorageUploadResult {
    url: string | null;
    path: string | null;
    error: Error | null;
}

type LegacyFileSystem = {
    FileSystemUploadType: { BINARY_CONTENT: number };
    createUploadTask: (
        url: string,
        fileUri: string,
        options: Record<string, unknown>,
        callback?: (progress: {
            totalBytesSent: number;
            totalBytesExpectedToSend: number;
        }) => void,
    ) => { uploadAsync: () => Promise<{ status: number } | null | undefined> };
};

/**
 * Upload a Community message asset through the backend-issued signed PUT URL.
 * This path never calls `getPublicUrl`; the persisted message points to the
 * membership-gated API resource URL returned alongside the reservation.
 */
export async function uploadPrivateCommunityAsset(
    uploadUrl: string,
    file: { uri: string; type: string },
    onProgress?: (fraction: number) => void,
): Promise<void> {
    let parsed: URL;
    try {
        parsed = new URL(uploadUrl);
    } catch {
        throw new Error('The secure upload link is invalid.');
    }
    if (parsed.protocol !== 'https:') {
        throw new Error('The secure upload link must use HTTPS.');
    }

    const { createUploadTask, FileSystemUploadType } = require('expo-file-system/legacy') as LegacyFileSystem;
    onProgress?.(0);
    const task = createUploadTask(
        uploadUrl,
        file.uri,
        {
            httpMethod: 'PUT',
            uploadType: FileSystemUploadType.BINARY_CONTENT,
            headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
        },
        ({ totalBytesSent, totalBytesExpectedToSend }) => {
            if (totalBytesExpectedToSend > 0) {
                onProgress?.(
                    Math.max(0, Math.min(1, totalBytesSent / totalBytesExpectedToSend)),
                );
            }
        },
    );
    const result = await task.uploadAsync();
    if (!result || result.status < 200 || result.status >= 300) {
        throw new Error('Uploading the attachment failed. Please try again.');
    }
    onProgress?.(1);
}

/** Legacy public creator-resource upload; Community messages must not use it. */
export const uploadCommunityAsset = async (
    supabase: SupabaseClient,
    file: { uri: string; name: string; type?: string },
    userId: string
): Promise<StorageUploadResult> => {
    try {
        const fileExt = file.name.split('.').pop();
        const safeUserId = toSafeUUID(userId);
        const fileName = `${safeUserId}/${Date.now()}.${fileExt}`;
        const filePath = `resources/${fileName}`;

        // For React Native, we need to fetch the blob from the URI
        const response = await fetch(file.uri);
        const blob = await response.blob();

        const { error } = await supabase.storage
            .from('community-assets')
            .upload(filePath, blob, {
                contentType: file.type || 'application/octet-stream',
                upsert: true
            });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
            .from('community-assets')
            .getPublicUrl(filePath);

        return {
            url: publicUrl,
            path: filePath,
            error: null
        };
    } catch (error: any) {
        console.error('Storage upload error:', error);
        return {
            url: null,
            path: null,
            error
        };
    }
};
