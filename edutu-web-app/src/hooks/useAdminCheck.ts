import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';

interface AdminCheckState {
  isAdmin: boolean;
  loading: boolean;
  userEmail: string | null;
}

const DEFAULT_ADMIN_EMAILS = ['admin@edutu.ai', 'founder@edutu.ai'];

const isWhitelistedAdmin = (email: string | null | undefined) => {
  if (!email) {
    return false;
  }

  return DEFAULT_ADMIN_EMAILS.some(
    (adminEmail) => adminEmail.trim().toLowerCase() === email.trim().toLowerCase()
  );
};

export function useAdminCheck(): AdminCheckState {
  const { user, isLoaded } = useUser();
  const [state, setState] = useState<AdminCheckState>({
    isAdmin: false,
    loading: true,
    userEmail: null
  });

  useEffect(() => {
    if (!isLoaded) return;

    const email = user?.primaryEmailAddress?.emailAddress ?? null;
    const publicRole = typeof user?.publicMetadata?.role === 'string' ? user.publicMetadata.role : null;
    const isAdminRole = ['super_admin', 'admin', 'moderator', 'support_agent'].includes(publicRole ?? '');
    const isAdmin = isAdminRole || isWhitelistedAdmin(email);

    setState({
      userEmail: email,
      loading: false,
      isAdmin
    });
  }, [isLoaded, user]);

  return state;
}

export function setAdminOverride(value: boolean) {
  console.warn('setAdminOverride is disabled. Admin access must come from Clerk metadata or server-side role checks.');
}
