import { CheckCircle, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBillingStatus } from '../hooks/useBillingStatus';

export default function BillingSuccessPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo') || '/app/home';
  const { status, loading, refresh } = useBillingStatus();

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (status?.isPro) {
      const timer = window.setTimeout(() => navigate(returnTo, { replace: true }), 1200);
      return () => window.clearTimeout(timer);
    }
  }, [navigate, returnTo, status?.isPro]);

  return (
    <main className="min-h-screen bg-surface-body px-4 py-16 text-strong">
      <section className="mx-auto max-w-lg rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-950">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {status?.isPro ? <CheckCircle size={24} /> : <Loader2 size={24} className="animate-spin" />}
        </div>
        <h1 className="text-2xl font-semibold text-gray-950 dark:text-white">
          {status?.isPro ? 'Subscription active' : 'Confirming your payment'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
          {status?.isPro
            ? 'Your premium access is now available across Edutu.'
            : 'We are waiting for the payment gateway webhook to activate your access.'}
        </p>
        <button
          type="button"
          onClick={() => (status?.isPro ? navigate(returnTo) : void refresh())}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90"
        >
          {loading && !status?.isPro ? 'Checking...' : status?.isPro ? 'Continue' : 'Check again'}
        </button>
      </section>
    </main>
  );
}
