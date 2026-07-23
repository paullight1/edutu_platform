import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js';

let accessTokenGetter: (() => Promise<string | null>) | null = null;

export function setSupabaseAccessTokenGetter(getter: (() => Promise<string | null>) | null) {
  accessTokenGetter = getter;
}

export const createSupabaseClient = (url: string, key: string) => {
  if (!url || !key) {
    throw new Error('Missing Supabase URL or anon key');
  }

  // supabase-js quirk: .rpc() requests go out with the ANON KEY as the
  // Authorization bearer (the builder's preset header wins over the
  // `accessToken` hook), while .from() requests correctly carry the Clerk
  // JWT. Server-side that means rpc calls run with no auth.jwt() claims —
  // every jwt-scoped RPC (referrals, credits, …) fails with 42501/"Not
  // authenticated". This wrapper is the innermost fetch, so it sees the
  // final headers: whenever a /rest/v1/ request is about to leave with the
  // anon key (or nothing) as bearer, swap in the real user token.
  const authFetch: typeof fetch = async (input: any, init?: any) => {
    try {
      const u = typeof input === 'string' ? input : input?.url || '';
      if (u.includes('/rest/v1/')) {
        const h = new Headers(init?.headers || (typeof input === 'object' ? input?.headers : undefined));
        const auth = h.get('Authorization') || '';
        const isAnon = !auth || auth === `Bearer ${key}`;
        if (isAnon && accessTokenGetter) {
          const token = await accessTokenGetter().catch(() => null);
          if (token) {
            h.set('Authorization', `Bearer ${token}`);
            init = { ...(init || {}), headers: h };
          }
        }
        if (__DEV__) {
          const finalAuth = h.get('Authorization') || '';
          if (!finalAuth || finalAuth === `Bearer ${key}`) {
            // Signed-out is legitimately anon; signed-in requests reaching the
            // server as anon are the bug this wrapper exists to prevent.
            console.warn('[supabase-req] request leaving WITHOUT user JWT:', (init?.method || 'GET'), u.split('/rest/v1/')[1]?.split('?')[0]);
          }
        }
      }
    } catch { /* never break requests for auth patching/logging */ }
    return fetch(input, init);
  };

  return createClient(url, key, {
    accessToken: async () => accessTokenGetter?.() ?? null,
    global: { fetch: authFetch },
  } as any);
};
