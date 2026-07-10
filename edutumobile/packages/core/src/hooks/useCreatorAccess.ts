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
    /** Set when the access lookup failed (network/timeout) rather than resolving. */
    error: string | null;
    checkAccess: () => Promise<void>;
}

/** Reject if a request outlives `ms` so a hung socket can't pin loading forever. */
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('Request timed out. Check your connection.')),
            ms,
        );
        Promise.resolve(promise).then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (err) => {
                clearTimeout(timer);
                reject(err);
            },
        );
    });
}

export function useCreatorAccess(supabase: SupabaseClient, userId: string | null): UseCreatorAccessReturn {
    const [status, setStatus] = useState<CreatorStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const checkAccess = useCallback(async () => {
        if (!userId) {
            setStatus(null);
            setError(null);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const lookupIds = Array.from(new Set([userId, toSafeUUID(userId)]));
            const { data, error: queryError } = await withTimeout(
                supabase
                    .from('profiles')
                    .select('user_id, creator_status')
                    .in('user_id', lookupIds),
                12000,
            );

            if (queryError) throw queryError;
            const profile = data?.find((row: any) => row.user_id === userId) || data?.[0];
            setStatus(profile?.creator_status || 'none');
            setError(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to check creator access';
            console.error('Error checking creator access:', message);
            // Surface the failure so callers can show a retryable error instead of
            // silently falling through to a "not a creator" screen on a flaky network.
            setError(message);
            setStatus(null);
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
        error,
        checkAccess,
    };
}
