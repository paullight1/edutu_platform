import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// Initialize i18n before rendering
import './i18n';

import { ThemeProvider } from './hooks/useTheme';
import App from './App.tsx';
import { ToastProvider } from './components/ui/ToastProvider';
import ErrorBoundary from './components/ErrorBoundary';
import { initSentry } from './lib/sentry';
import { SkipLink } from './lib/accessibility';

import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { AuthProvider } from './hooks/useAuth';
import { GoalsProvider } from './hooks/useGoals';
import { NotificationsProvider } from './hooks/useNotifications';
import { AnalyticsProvider } from './hooks/useAnalytics';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!clerkPubKey) {
  throw new Error('Missing Clerk Publishable Key. Set VITE_CLERK_PUBLISHABLE_KEY in your .env');
}

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}

initSentry();

// Loading fallback for Suspense
const LoadingScreen = () => (
  <div className="min-h-screen bg-[#0c0f1a] flex items-center justify-center">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
      <p className="text-white/60">Loading opportunities...</p>
    </div>
  </div>
);

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <SkipLink />
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        <ClerkProvider publishableKey={clerkPubKey}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <ToastProvider>
              <ThemeProvider>
                <AuthProvider>
                  <AnalyticsProvider>
                    <NotificationsProvider>
                      <GoalsProvider>
                        <App />
                      </GoalsProvider>
                    </NotificationsProvider>
                  </AnalyticsProvider>
                </AuthProvider>
              </ThemeProvider>
            </ToastProvider>
          </BrowserRouter>
        </ClerkProvider>
      </Suspense>
    </ErrorBoundary>
  </StrictMode>
);
