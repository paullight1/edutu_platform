import { useAuth, useUser } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';

const ADMIN_EMAILS = [
  'admin@edutu.ai',
  'founder@edutu.ai',
  'nwosupaul3@gmail.com',
  'nwouspaul3@gmail.com',
];

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

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

  const isAdmin = user?.primaryEmailAddress?.emailAddress &&
    ADMIN_EMAILS.includes(user.primaryEmailAddress.emailAddress.toLowerCase());

  if (!isAdmin) {
    return <Navigate to="/app/home" replace />;
  }

  return <>{children}</>;
}
