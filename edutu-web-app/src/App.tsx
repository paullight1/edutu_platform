import { useCallback, useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import AuthScreen from './components/AuthScreen';
import AuthCallback from './components/AuthCallback';
import OpportunitiesPage from './components/OpportunitiesPage';
import OpportunityDetailFetcher from './components/OpportunityDetailFetcher';
import OpportunitySharePage from './components/OpportunitySharePage';

const ADMIN_PORTAL_URL = import.meta.env.VITE_ADMIN_URL || 'https://admin.edutu.org';

export type Screen =
  | 'landing'
  | 'auth'
  | 'dashboard'
  | 'opportunities'
  | 'saved'
  | 'applied'
  | 'profile'
  | 'settings'
  | 'notifications'
  | 'privacy'
  | 'help'
  | 'cv-management'
  | 'personalization'
  | 'community-marketplace'
  | 'achievements'
  | 'creator-apply'
  | 'creator-dashboard'
  | 'creator-create'
  | 'deadlines'
  | 'about'
  | 'blog';

function ExternalAdminRedirect() {
  useEffect(() => {
    window.location.replace(ADMIN_PORTAL_URL);
  }, []);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-6 text-center text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-brand-500/25 border-t-brand-500" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Opening the admin portal</p>
      </div>
    </div>
  );
}

function App() {
  const navigate = useNavigate();

  const handleAuthSuccess = useCallback((_userData: unknown) => {
    navigate('/opportunities', { replace: true });
  }, [navigate]);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/opportunities" replace />} />
      <Route path="/opportunities" element={<OpportunitiesPage />} />
      <Route
        path="/opportunity/:id"
        element={<OpportunityDetailFetcher onBack={() => navigate('/opportunities')} />}
      />
      <Route path="/share/opportunity/:id" element={<OpportunitySharePage />} />
      <Route path="/auth" element={<AuthScreen onAuthSuccess={handleAuthSuccess} />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/login" element={<Navigate to="/auth?mode=sign-in" replace />} />
      <Route path="/signup" element={<Navigate to="/auth?signup=true" replace />} />
      <Route path="/admin/*" element={<ExternalAdminRedirect />} />
      <Route path="*" element={<Navigate to="/opportunities" replace />} />
    </Routes>
  );
}

export { App as default };
