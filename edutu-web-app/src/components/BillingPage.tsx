import { useAuth } from '@clerk/clerk-react';
import { Check, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createCheckout, type BillingInterval } from '../services/billing';

const plans: Array<{
  id: BillingInterval;
  name: string;
  price: string;
  note: string;
}> = [
  { id: 'monthly', name: 'Monthly', price: 'NGN 10,000', note: 'Flexible monthly access' },
  { id: 'yearly', name: 'Yearly', price: 'NGN 72,000', note: 'Best value for committed users' },
];

export default function BillingPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [selectedPlan, setSelectedPlan] = useState<BillingInterval>('monthly');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const feature = params.get('feature');
  const returnTo = params.get('returnTo') || '/app/home';

  const benefits = useMemo(
    () => [
      'AI roadmaps and opportunity planning',
      'Premium CV tools and templates',
      'AI chat and advanced guidance',
      'Access synced across web and mobile',
    ],
    [],
  );

  const handleCheckout = async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      navigate('/auth', { state: { from: { pathname: '/billing', search: window.location.search } } });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Unable to read auth token');

      const checkout = await createCheckout(token, {
        plan: selectedPlan,
        feature,
        returnTo,
      });

      if (!checkout.configured) {
        setMessage(checkout.message || 'Payment gateway is not configured yet.');
        return;
      }

      if (!checkout.authorizationUrl) {
        throw new Error('Checkout did not return a payment URL');
      }

      window.location.assign(checkout.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start checkout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-surface-body px-4 py-10 text-strong">
      <div className="mx-auto max-w-5xl">
        <button
          type="button"
          onClick={() => navigate(returnTo)}
          className="mb-8 text-sm font-medium text-primary hover:underline"
        >
          Back
        </button>

        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h1 className="text-4xl font-bold tracking-normal text-gray-950 dark:text-white">
              Edutu Pro
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600 dark:text-gray-300">
              Subscribe once and unlock premium access across Edutu web and mobile after payment confirmation.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`rounded-lg border p-5 text-left transition ${
                    selectedPlan === plan.id
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 bg-white hover:border-primary/50 dark:border-gray-800 dark:bg-gray-950'
                  }`}
                >
                  <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">{plan.name}</span>
                  <span className="mt-2 block text-2xl font-bold text-gray-950 dark:text-white">{plan.price}</span>
                  <span className="mt-1 block text-sm text-gray-600 dark:text-gray-300">{plan.note}</span>
                </button>
              ))}
            </div>
          </div>

          <aside className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950">
            <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Premium access</h2>
            <ul className="mt-5 space-y-3">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
                  <Check size={18} className="mt-0.5 text-primary" />
                  {benefit}
                </li>
              ))}
            </ul>

            {message && (
              <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {message}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleCheckout()}
              disabled={loading}
              className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <Loader2 size={18} className="animate-spin" />}
              Continue to secure payment
            </button>
          </aside>
        </section>
      </div>
    </main>
  );
}
