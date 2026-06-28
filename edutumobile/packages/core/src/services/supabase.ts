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

  return createClient(url, key, {
    accessToken: async () => accessTokenGetter?.() ?? null,
  } as any);
};
