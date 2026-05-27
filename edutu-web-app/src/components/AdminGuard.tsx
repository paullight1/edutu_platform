import { useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';
import { authService } from '../lib/auth';
import { isAdminAccessAllowed } from '../lib/adminAccess';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [profileCheckedForUser, setProfileCheckedForUser] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) {
      setProfileRole(null);
      setProfileCheckedForUser(null);
      return;
    }

    let isActive = true;

    async function loadProfileRole() {
      try {
        const profile = await authService.getProfile(user!.id);
        if (!isActive) return;

        const role = typeof profile?.role === 'string' ? profile.role : null;
        setProfileRole(role);
      } catch (error) {
        console.error('Failed to verify admin profile role', error);
        if (isActive) setProfileRole(null);
      } finally {
        if (isActive) setProfileCheckedForUser(user!.id);
      }
    }

    void loadProfileRole();

    return () => {
      isActive = false;
    };
  }, [isLoaded, isSignedIn, user?.id]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-body">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/auth" replace />;
  }

  const publicRole = typeof user?.publicMetadata?.role === 'string' ? user.publicMetadata.role : null;
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const hasImmediateAdminAccess = isAdminAccessAllowed({ email, publicRole });
  const profileCheckComplete = profileCheckedForUser === user?.id;
  const hasAdminAccess = isAdminAccessAllowed({ email, publicRole, profileRole });

  if (!hasImmediateAdminAccess && !profileCheckComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-body">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return <Navigate to="/app/home" replace />;
  }

  return <>{children}</>;
}
