import { supabase } from './supabase';
import {
  disableLocalAdminBypassForSession,
  isLocalAdminBypassEnabled,
} from './localAdmin';

export async function signOutAdmin(redirectTo = '/login'): Promise<void> {
  if (isLocalAdminBypassEnabled()) {
    disableLocalAdminBypassForSession();
    window.location.assign(redirectTo);
    return;
  }

  const { error } = await supabase.auth.signOut({ scope: 'local' });

  if (error) {
    console.error('[Auth] Sign out failed:', error);
  }

  window.location.assign(redirectTo);
}
