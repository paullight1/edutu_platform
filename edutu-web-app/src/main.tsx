import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// Initialize i18n before rendering
import './i18n';

import { ThemeProvider } from './hooks/useTheme';
import App from './App.tsx';
import { ToastProvider } from './components/ui/ToastProvider';
import ErrorBoundary from './components/ErrorBoundary';
import WhatsNewNotification from './components/WhatsNewNotification';
import { initSentry } from './lib/sentry';
import { SkipLink } from './lib/accessibility';

import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { AuthProvider } from './hooks/useAuth';
import { PaywallProvider } from './hooks/usePaywall';
import { PersonalizationProvider } from './hooks/usePersonalization';
import { GoalsProvider } from './hooks/useGoals';
import { NotificationsProvider } from './hooks/useNotifications';
import { AnalyticsProvider } from './hooks/useAnalytics';

// The production Clerk instance (clerk.edutu.org). Publishable keys are
// public by design — this ships in every browser bundle either way.
const PROD_CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsuZWR1dHUub3JnJA';

// Production guard: the Netlify dashboard once injected a dev-instance
// pk_test key into prod builds (dashboard env vars beat netlify.toml), which
// made the backend reject every session token ("Invalid or expired token").
// A dev key must never reach a production build, so prefer the pinned live
// key whenever the injected one isn't a pk_live. Dev builds keep using .env.
const envClerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkPubKey =
  import.meta.env.PROD && !envClerkKey?.startsWith('pk_live_')
    ? PROD_CLERK_PUBLISHABLE_KEY
    : envClerkKey;
if (!clerkPubKey) {
  throw new Error('Missing Clerk Publishable Key. Set VITE_CLERK_PUBLISHABLE_KEY in your .env');
}

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}

initSentry();

// ── Warm the auth-critical origins ──────────────────────────────────────────
// Sign-in / sign-up feel slow mostly because the FIRST request to Clerk (and
// the post-auth Supabase call) pays full DNS + TLS setup on a cold connection.
// Preconnecting here — before ClerkProvider mounts and fires anything — hides
// that setup cost so the actual auth round-trip starts warm.
function preconnect(origin: string | undefined | null) {
  if (!origin) return;
  try {
    const { origin: safeOrigin } = new URL(origin);
    if (document.head.querySelector(`link[rel="preconnect"][href="${safeOrigin}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = safeOrigin;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  } catch {
    // Ignore malformed origins.
  }
}

// Clerk encodes its Frontend API host in the publishable key: base64 of
// "<fapi-host>$". Decode it so the preconnect targets the right (env-specific)
// domain for both test and live keys.
function clerkFapiOrigin(pk: string): string | null {
  try {
    const encoded = pk.replace(/^pk_(test|live)_/, '');
    const host = atob(encoded).replace(/\$+$/, '');
    return host ? `https://${host}` : null;
  } catch {
    return null;
  }
}

preconnect(clerkFapiOrigin(clerkPubKey));
preconnect(import.meta.env.VITE_SUPABASE_URL);
// Clerk's Smart CAPTCHA (Turnstile) on sign-up loads from Cloudflare.
preconnect('https://challenges.cloudflare.com');

// Loading fallback for Suspense
const LoadingScreen = () => (
  <div className="min-h-screen bg-[#0c0f1a] flex items-center justify-center">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
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
          <BrowserRouter>
            <ToastProvider>
              <ThemeProvider>
                <AuthProvider>
                  <PaywallProvider>
                    <PersonalizationProvider>
                      <AnalyticsProvider>
                        <NotificationsProvider>
                          <GoalsProvider>
                            <App />
                            <WhatsNewNotification />
                          </GoalsProvider>
                        </NotificationsProvider>
                      </AnalyticsProvider>
                    </PersonalizationProvider>
                  </PaywallProvider>
                </AuthProvider>
              </ThemeProvider>
            </ToastProvider>
          </BrowserRouter>
        </ClerkProvider>
      </Suspense>
    </ErrorBoundary>
  </StrictMode>
);