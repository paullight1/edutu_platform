import { Lock, Sparkles } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBillingStatus } from '../hooks/useBillingStatus';

const FEATURE_LABELS: Record<string, string> = {
  ai_roadmap: 'AI roadmaps',
  ai_chat: 'Edutu AI chat',
  cv_builder: 'CV builder',
  premium_templates: 'premium templates',
  marketplace_premium: 'premium marketplace resources',
  creator_tools: 'creator tools',
};

interface PremiumGateProps {
  feature: string;
  children: React.ReactNode;
}

export function PremiumGate({ feature, children }: PremiumGateProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, loading, error } = useBillingStatus();
  const hasAccess = Boolean(status?.isPro || status?.featureAccess?.[feature]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  const label = FEATURE_LABELS[feature] || 'this premium feature';
  const billingUrl = `/billing?feature=${encodeURIComponent(feature)}&returnTo=${encodeURIComponent(location.pathname + location.search)}`;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <section className="w-full max-w-xl rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-950">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock size={22} />
        </div>
        <h1 className="text-2xl font-semibold text-gray-950 dark:text-white">
          Unlock {label}
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
          Subscribe to Edutu Pro to use this feature across the web app and mobile app.
        </p>
        {error && (
          <p className="mt-3 text-sm text-amber-600">
            Billing status could not be refreshed. You can still continue to checkout.
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => navigate(billingUrl)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90"
          >
            <Sparkles size={18} />
            View Pro plans
          </button>
        </div>
      </section>
    </div>
  );
}
