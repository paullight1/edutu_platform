import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './env';

let client: SupabaseClient | null = null;

/**
 * Service-role Supabase client. Used ONLY on the server to grant entitlements
 * and record payments — it bypasses RLS, so it must never be imported into a
 * client component.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl(), config.supabaseServiceRole(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
