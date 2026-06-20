import { useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { verifyAdminAccess } from '../lib/adminAccess';

interface AdminCheckState {
  isAdmin: boolean;
  loading: boolean;
  userEmail: string | null;
  error: string | null;
}

export function useAdminCheck(): AdminCheckState {
  const { user, isLoaded } = useUser();
  const { getToken, isSignedIn } = useAuth();
  const [state, setState] = useState<AdminCheckState>({
    isAdmin: false,
    loading: true,
    userEmail: null,
    error: null
  });

  useEffect(() => {
    if (!isLoaded) return;

    let isActive = true;

    async function evaluateAdminAccess() {
      const email = user?.primaryEmailAddress?.emailAddress ?? null;

      if (!isSignedIn) {
        if (!isActive) return;
        setState({
          isAdmin: false,
          loading: false,
          userEmail: email,
          error: null,
        });
        return;
      }

      try {
        const token = await getToken();

        if (!token) {
          throw new Error('Missing authenticated session token');
        }

        const result = await verifyAdminAccess(token);

        if (!isActive) return;

        setState({
          userEmail: result.email ?? email,
          loading: false,
          isAdmin: result.allowed === true,
          error: null,
        });
      } catch (error) {
        if (!isActive) return;

        setState({
          isAdmin: false,
          loading: false,
          userEmail: email,
          error: error instanceof Error ? error.message : 'Unable to verify admin access',
        });
      }
    }

    void evaluateAdminAccess();

    return () => {
      isActive = false;
    };
  }, [getToken, isLoaded, isSignedIn, user]);

  return state;
}

export function setAdminOverride(value: boolean) {
  console.warn('setAdminOverride is disabled. Admin access must come from Clerk metadata or server-side role checks.');
}
