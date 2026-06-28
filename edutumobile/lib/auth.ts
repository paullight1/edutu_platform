import { SupabaseClient } from '@supabase/supabase-js';

export async function fetchUserRole(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return typeof data?.role === 'string' ? data.role : null;
}

export async function isAdminUser(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<boolean> {
  return (await fetchUserRole(supabase, userId)) === 'admin';
}
