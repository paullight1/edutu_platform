import { useState, useEffect, useCallback } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { toSafeUUID } from '../utils/auth';

export type CreatorStatus = 'none' | 'pending' | 'approved' | 'rejected';

interface UseCreatorAccessReturn {
    status: CreatorStatus | null;
    isLoading: boolean;
    isApproved: boolean;
    isPending: boolean;
    isRejected: boolean;
    checkAccess: () => Promise<void>;
}

export function useCreatorAccess(supabase: SupabaseClient, userId: string | null): UseCreatorAccessReturn {
    const [status, setStatus] = useState<CreatorStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const checkAccess = useCallback(async () => {
        if (!userId) {
            setStatus(null);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const lookupIds = Array.from(new Set([userId, toSafeUUID(userId)]));
            const { data, error } = await supabase
                .from('profiles')
                .select('user_id, creator_status')
                .in('user_id', lookupIds);

            if (error) throw error;
            const profile = data?.find((row: any) => row.user_id === userId) || data?.[0];
            setStatus(profile?.creator_status || 'none');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to check creator access';
            console.error('Error checking creator access:', message);
            setStatus('none');
        } finally {
            setIsLoading(false);
        }
    }, [supabase, userId]);

    useEffect(() => {
        checkAccess();
    }, [checkAccess]);

    return {
        status,
        isLoading,
        isApproved: status === 'approved',
        isPending: status === 'pending',
        isRejected: status === 'rejected',
        checkAccess,
    };
}
