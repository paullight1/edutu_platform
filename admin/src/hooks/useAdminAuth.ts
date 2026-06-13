import { useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getLocalAdminEmail, getLocalAdminUserId, isLocalAdminBypassEnabled } from '../lib/localAdmin';

interface AdminAuthState {
    session: Session | null;
    user: User | null;
    isAdmin: boolean;
    loading: boolean;
    error: string | null;
}

/**
 * Hook to check if current user has admin privileges
 * Verifies both authentication AND admin role
 */
export function useAdminAuth() {
    const localBypassEnabled = isLocalAdminBypassEnabled();
    const localEmail = getLocalAdminEmail();
    const localUserId = getLocalAdminUserId();

    const [state, setState] = useState<AdminAuthState>({
        session: localBypassEnabled
            ? ({ access_token: 'local-dev-token', user: { id: localUserId, email: localEmail } } as Session)
            : null,
        user: localBypassEnabled
            ? ({ id: localUserId, email: localEmail } as User)
            : null,
        isAdmin: localBypassEnabled,
        loading: !localBypassEnabled,
        error: null,
    });

    const checkAdminRole = useCallback(async (userId: string): Promise<boolean> => {
        if (localBypassEnabled) {
            return true;
        }

        try {
            // Admin role must come from server-controlled profile data.
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('user_id', userId)
                .maybeSingle();

            if (profile?.role === 'admin') {
                return true;
            }

            return false;
        } catch (error) {
            console.error('Error checking admin role:', error);
            return false;
        }
    }, [localBypassEnabled]);

    useEffect(() => {
        if (localBypassEnabled) {
            return () => undefined;
        }

        let mounted = true;

        async function initAuth() {
            try {
                // Get initial session
                const { data: { session } } = await supabase.auth.getSession();

                if (!session?.user) {
                    if (mounted) {
                        setState({
                            session: null,
                            user: null,
                            isAdmin: false,
                            loading: false,
                            error: null
                        });
                    }
                    return;
                }

                // Check admin role
                const isAdmin = await checkAdminRole(session.user.id);

                if (mounted) {
                    setState({
                        session,
                        user: session.user,
                        isAdmin,
                        loading: false,
                        error: isAdmin ? null : 'Unauthorized: Admin access required'
                    });
                }
            } catch (error: unknown) {
                if (mounted) {
                    setState(prev => ({
                        ...prev,
                        loading: false,
                        error: error instanceof Error ? error.message : 'Failed to initialize admin auth'
                    }));
                }
            }
        }

        initAuth();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                if (!session?.user) {
                    if (mounted) {
                        setState({
                            session: null,
                            user: null,
                            isAdmin: false,
                            loading: false,
                            error: null
                        });
                    }
                    return;
                }

                const isAdmin = await checkAdminRole(session.user.id);

                if (mounted) {
                    setState({
                        session,
                        user: session.user,
                        isAdmin,
                        loading: false,
                        error: isAdmin ? null : 'Unauthorized: Admin access required'
                    });
                }
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [checkAdminRole, localBypassEnabled]);

    const signOut = useCallback(async () => {
        if (localBypassEnabled) {
            window.location.assign('/login');
            return;
        }

        await supabase.auth.signOut();
    }, [localBypassEnabled]);

    return {
        ...state,
        signOut
    };
}

/**
 * Hook for protected admin actions
 * Returns a wrapper that checks admin status before executing
 */
export function useAdminAction() {
    const { isAdmin, loading } = useAdminAuth();

    const requireAdmin = useCallback(<A extends unknown[], R>(
        action: (...args: A) => R,
        errorMessage: string = 'Admin privileges required'
    ): ((...args: A) => R) => {
        return (...args: A) => {
            if (!isAdmin) {
                throw new Error(errorMessage);
            }

            return action(...args);
        };
    }, [isAdmin]);

    return {
        isAdmin,
        loading,
        requireAdmin
    };
}

/**
 * Higher-order function to wrap async operations with admin check
 */
export function withAdminCheck<T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T,
    options?: { errorMessage?: string }
): T {
    if (isLocalAdminBypassEnabled()) {
        return (async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => (
            await fn(...args)
        ) as Awaited<ReturnType<T>>) as T;
    }

    return (async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            throw new Error('Authentication required');
        }

        // Admin role must come from server-controlled profile data.
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('user_id', user.id)
            .maybeSingle();

        if (profile?.role !== 'admin') {
            throw new Error(options?.errorMessage || 'Admin privileges required');
        }

        return (await fn(...args)) as Awaited<ReturnType<T>>;
    }) as T;
}
