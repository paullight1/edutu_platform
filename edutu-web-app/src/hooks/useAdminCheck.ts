import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { authService } from '../lib/auth';
import { isAdminAccessAllowed } from '../lib/adminAccess';

interface AdminCheckState {
  isAdmin: boolean;
  loading: boolean;
  userEmail: string | null;
}

export function useAdminCheck(): AdminCheckState {
  const { user, isLoaded } = useUser();
  const [state, setState] = useState<AdminCheckState>({
    isAdmin: false,
    loading: true,
    userEmail: null
  });

  useEffect(() => {
    if (!isLoaded) return;

    let isActive = true;

    async function evaluateAdminAccess() {
      const email = user?.primaryEmailAddress?.emailAddress ?? null;
      const publicRole = typeof user?.publicMetadata?.role === 'string' ? user.publicMetadata.role : null;
      let profileRole: string | null = null;

      if (user?.id) {
        try {
          const profile = await authService.getProfile(user.id);
          profileRole = typeof profile?.role === 'string' ? profile.role : null;
        } catch (error) {
          console.error('Failed to load admin profile role', error);
        }
      }

      if (!isActive) return;

      setState({
        userEmail: email,
        loading: false,
        isAdmin: isAdminAccessAllowed({ email, publicRole, profileRole })
      });
    }

    void evaluateAdminAccess();

    return () => {
      isActive = false;
    };
  }, [isLoaded, user]);

  return state;
}

export function setAdminOverride(value: boolean) {
  console.warn('setAdminOverride is disabled. Admin access must come from Clerk metadata or server-side role checks.');
}
