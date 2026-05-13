import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

/** Clerk JWT getter - set by AuthProvider */
let _getToken: (() => Promise<string | null | undefined>) | null = null;

function createClientWithClerkAuth(): SupabaseClient<Database> {
    return createClient<Database>(supabaseUrl, supabaseAnonKey, {
        global: {
            fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
                const headers = new Headers(init?.headers);
                if (_getToken) {
                    const token = await _getToken();
                    if (token) {
                        headers.set('Authorization', `Bearer ${token}`);
                    }
                }
                return fetch(input, { ...init, headers });
            },
        },
    });
}

/**
 * Supabase client - uses Clerk JWT for auth when available,
 * otherwise falls back to anon key. This bridges Clerk auth
 * with Supabase Row Level Security policies.
 */
export const supabase = createClientWithClerkAuth();

/**
 * Set the Clerk token getter. Call this from AuthProvider.
 */
export function setClerkTokenGetter(getToken: () => Promise<string | null | undefined>) {
    _getToken = getToken;
}
