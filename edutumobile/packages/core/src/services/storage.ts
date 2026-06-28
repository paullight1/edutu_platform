import { SupabaseClient } from '@supabase/supabase-js';
import { toSafeUUID } from '../utils/auth';

export interface StorageUploadResult {
    url: string | null;
    path: string | null;
    error: Error | null;
}

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

        const { data, error } = await supabase.storage
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
