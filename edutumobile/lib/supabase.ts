import { createSupabaseClient } from "../packages/core/src/services/supabase";
import { getConfig } from "./config";

// This module loads from index.js (via notificationActionTask) BEFORE any
// React tree exists, so it must never throw: a throw here crashes straight
// to the launcher and bypasses the ConfigErrorScreen in app/_layout.tsx.
// Resolving through getConfig() also picks up the Constants.expoConfig.extra
// fallback, which bare process.env reads miss.
function resolveSupabaseCredentials(): { url: string; key: string } {
  try {
    const { supabaseUrl, supabaseAnonKey } = getConfig();
    if (supabaseUrl && supabaseAnonKey) {
      return { url: supabaseUrl, key: supabaseAnonKey };
    }
  } catch {
    // getConfig() throws when ANY required var is missing (e.g. only the
    // Clerk key) — the Supabase pair may still be usable on its own. The
    // missing config itself is reported by ConfigErrorScreen once the app
    // mounts.
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
    if (url && key) {
      return { url, key };
    }
  }
  console.error(
    "[supabase] Missing EXPO_PUBLIC_SUPABASE_URL/ANON_KEY — client created " +
      "with placeholder credentials; every Supabase request will fail.",
  );
  return { url: "https://config-missing.invalid", key: "config-missing" };
}

const { url, key } = resolveSupabaseCredentials();

export const supabase = createSupabaseClient(url, key);
