import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface AdminAuthState {
    session: any;
    user: any;
    isAdmin: boolean;
    loading: boolean;
    error: string | null;
}

/**
 * Hook to check if current user has admin privileges
 * Verifies both authentication AND admin role
 */
export function useAdminAuth() {
    const [state, setState] = useState<AdminAuthState>({
        session: null,
        user: null,
        isAdmin: false,
        loading: true,
        error: null
    });

    const checkAdminRole = useCallback(async (userId: string): Promise<boolean> => {
        try {
            // Admin role must come from server-controlled profile data.
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('user_id', userId)
                .single();

            if (profile?.role === 'admin') {
                return true;
            }

            return false;
        } catch (error) {
            console.error('Error checking admin role:', error);
            return false;
        }
    }, []);

    useEffect(() => {
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
            } catch (error: any) {
                if (mounted) {
                    setState(prev => ({
                        ...prev,
                        loading: false,
                        error: error.message
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
    }, [checkAdminRole]);

    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
    }, []);

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

    const requireAdmin = useCallback(<T extends (...args: any[]) => any>(
        action: T,
        errorMessage: string = 'Admin privileges required'
    ): T => {
        return ((...args: Parameters<T>): ReturnType<T> | void => {
            if (!isAdmin) {
                throw new Error(errorMessage);
            }
            return action(...args);
        }) as T;
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
export function withAdminCheck<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    options?: { errorMessage?: string }
): T {
    return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            throw new Error('Authentication required');
        }

        // Admin role must come from server-controlled profile data.
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('user_id', user.id)
            .single();

        if (profile?.role !== 'admin') {
            throw new Error(options?.errorMessage || 'Admin privileges required');
        }

        return fn(...args);
    }) as T;
}
