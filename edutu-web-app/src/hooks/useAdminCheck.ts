import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';

interface AdminCheckState {
  isAdmin: boolean;
  loading: boolean;
  userEmail: string | null;
}

const DEFAULT_ADMIN_EMAILS = ['admin@edutu.ai', 'founder@edutu.ai'];
const LOCAL_OVERRIDE_KEY = 'edutu.admin.override';

const hasAdminOverride = () => {
  try {
    return localStorage.getItem(LOCAL_OVERRIDE_KEY) === 'true';
  } catch {
    return false;
  }
};

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
    const override = hasAdminOverride();
    const isAdmin = override || isWhitelistedAdmin(email);

    setState({
      userEmail: email,
      loading: false,
      isAdmin
    });
  }, [isLoaded, user]);

  return state;
}

export function setAdminOverride(value: boolean) {
  try {
    localStorage.setItem(LOCAL_OVERRIDE_KEY, value ? 'true' : 'false');
  } catch {
    // no-op
  }
}
