import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Whether the Supabase-backed (optional) features can be used at all. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/** Clerk JWT getter - set by AuthProvider */
let _getToken: (() => Promise<string | null | undefined>) | null = null;
let _client: SupabaseClient | null = null;

function createClientWithClerkAuth(): SupabaseClient {
    return createClient(supabaseUrl as string, supabaseAnonKey as string, {
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

function getClient(): SupabaseClient {
    if (_client) return _client;
    if (!isSupabaseConfigured) {
        // Only the optional Supabase-backed features (analytics, CV, community)
        // depend on this — auth is Clerk and the core feed is the Product API.
        // Throwing here (rather than at module import) keeps a missing env var
        // from taking down the whole app; the callers below all guard/catch.
        throw new Error(
            'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
        );
    }
    _client = createClientWithClerkAuth();
    return _client;
}

/**
 * Supabase client - uses Clerk JWT for auth when available, otherwise falls
 * back to anon key. This bridges Clerk auth with Supabase Row Level Security.
 *
 * Lazily initialised via a proxy: the underlying client is created on first
 * use, so importing this module never crashes when Supabase env vars are
 * absent — only actually touching a Supabase feature does, where it's caught.
 */
export const supabase = new Proxy({} as SupabaseClient, {
    get(_target, prop, receiver) {
        const client = getClient();
        const value = Reflect.get(client as object, prop, receiver);
        return typeof value === 'function' ? value.bind(client) : value;
    },
});

/**
 * Set the Clerk token getter. Call this from AuthProvider.
 */
export function setClerkTokenGetter(getToken: () => Promise<string | null | undefined>) {
    _getToken = getToken;
}
