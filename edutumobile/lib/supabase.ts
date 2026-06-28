import { createSupabaseClient } from "../packages/core/src/services/supabase";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);
