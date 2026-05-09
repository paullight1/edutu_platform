import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// Initialize i18n before rendering
import './i18n';

import { GoalsProvider } from './hooks/useGoals';
import { AnalyticsProvider } from './hooks/useAnalytics';
import { NotificationsProvider } from './hooks/useNotifications';
import { ThemeProvider } from './hooks/useTheme';
import App from './App.tsx';
import { ToastProvider } from './components/ui/ToastProvider';
import ErrorBoundary from './components/ErrorBoundary';

import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { AuthProvider } from './hooks/useAuth';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!clerkPubKey) {
  throw new Error('Missing Clerk Publishable Key. Set VITE_CLERK_PUBLISHABLE_KEY in your .env');
}

// Loading fallback for Suspense
const LoadingScreen = () => (
  <div className="min-h-screen bg-[#0c0f1a] flex items-center justify-center">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
      <p className="text-white/60">Loading...</p>
    </div>
  </div>
);

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        <ClerkProvider publishableKey={clerkPubKey}>
          <BrowserRouter>
            <ToastProvider>
              <ThemeProvider>
                <NotificationsProvider>
                  <AuthProvider>
                    <GoalsProvider>
                      <AnalyticsProvider>
                        <App />
                      </AnalyticsProvider>
                    </GoalsProvider>
                  </AuthProvider>
                </NotificationsProvider>
              </ThemeProvider>
            </ToastProvider>
          </BrowserRouter>
        </ClerkProvider>
      </Suspense>
    </ErrorBoundary>
  </StrictMode>
);
