import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase URL or Anon Key is missing. Check your .env file.');
}

// DEBUG: Log key info (safely)
console.log('Supabase Client Init:', {
    url: supabaseUrl,
    keyPrefix: supabaseAnonKey.substring(0, 10) + '...',
    keyLength: supabaseAnonKey.length
});

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
