import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Zap } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './Dialog';
import { createCheckout } from '../../services/billing';
import { type RemotePricing } from '../../services/mobileControl';
import { effectivePrice, formatMoney, loadRemotePricing } from '../../lib/proPricing';

// Modal-specific display labels; amounts/currency come from admin config (see
// ../../lib/proPricing). These strings only show while that config loads.
const FALLBACK_PLANS: Array<{ plan: 'weekly' | 'monthly' | 'yearly'; label: string; price: string; note?: string }> = [
  { plan: 'weekly', label: 'Pro Weekly', price: '₦2,000' },
  { plan: 'monthly', label: 'Pro Monthly', price: '₦6,500', note: 'Most popular' },
  { plan: 'yearly', label: 'Pro Yearly', price: '₦60,000', note: 'Best value' },
];

const FALLBACK_PACKS: Array<{ credits: number; price: string }> = [
  { credits: 100, price: '₦1,500' },
  { credits: 250, price: '₦3,000' },
  { credits: 700, price: '₦7,000' },
];

export interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional context line, e.g. the message from a 402/429 response. */
  reason?: string | null;
  /** Path to return to after Paystack checkout completes. */
  returnTo?: string;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ open, onClose, reason, returnTo }) => {
  const { getToken } = useAuth();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pricing, setPricing] = useState<RemotePricing | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadRemotePricing().then((remote) => {
      if (!cancelled && remote) setPricing(remote);
    });
    return () => { cancelled = true; };
  }, [open]);

  const proPlans = useMemo(() => {
    if (!pricing) return FALLBACK_PLANS;
    return FALLBACK_PLANS.map(({ plan, label, note }) => ({
      plan,
      label,
      note: pricing.promo?.active && pricing.promo.label ? pricing.promo.label : note,
      price: formatMoney(effectivePrice(pricing, plan), pricing.currency),
    }));
  }, [pricing]);

  const creditPacks = useMemo(() => {
    const packs = pricing?.creditPacks?.filter(
      (pack) => typeof pack.credits === 'number' && typeof pack.price === 'number',
    );
    if (!packs?.length || !pricing) return FALLBACK_PACKS;
    return packs.slice(0, 3).map((pack) => ({
      credits: pack.credits,
      price: formatMoney(pack.price, pricing.currency),
    }));
  }, [pricing]);

  const startCheckout = async (
    key: string,
    input: { plan?: 'weekly' | 'monthly' | 'yearly'; feature?: string; credits?: number },
  ) => {
    if (pendingKey) return;
    setPendingKey(key);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in to upgrade.');
      const checkout = await createCheckout(token, {
        ...input,
        returnTo: returnTo ?? window.location.pathname,
      });
      if (checkout.configured === false || !checkout.authorizationUrl) {
        setError(checkout.message || 'Payments are not configured yet. Please try again later or contact support.');
        return;
      }
      window.location.assign(checkout.authorizationUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to start checkout.');
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent ariaLabel="Upgrade to Edutu Pro" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand" aria-hidden="true" />
            Upgrade to keep going
          </DialogTitle>
          <DialogDescription>
            {reason || 'That is a Pro feature. Go Pro to unlock it, or top up credits.'}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-5 space-y-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Edutu Pro</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {proPlans.map(({ plan, label, price, note }) => (
                <button
                  key={plan}
                  type="button"
                  disabled={pendingKey !== null}
                  onClick={() => void startCheckout(`plan-${plan}`, { plan })}
                  className="flex flex-col items-start gap-1 rounded-xl border border-subtle bg-surface-layer p-3 text-left transition-colors hover:border-brand hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="text-sm font-medium text-text-primary">{label}</span>
                  <span className="text-base font-semibold text-brand">
                    {pendingKey === `plan-${plan}` ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Starting checkout" /> : price}
                  </span>
                  {note ? <span className="text-xs text-text-secondary">{note}</span> : null}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              Credit packs
            </h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {creditPacks.map(({ credits, price }) => (
                <button
                  key={credits}
                  type="button"
                  disabled={pendingKey !== null}
                  onClick={() => void startCheckout(`credits-${credits}`, { feature: 'credits', credits })}
                  className="flex flex-col items-start gap-1 rounded-xl border border-subtle bg-surface-layer p-3 text-left transition-colors hover:border-brand hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="text-sm font-medium text-text-primary">{credits} credits</span>
                  <span className="text-base font-semibold text-brand">
                    {pendingKey === `credits-${credits}` ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Starting checkout" /> : price}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {error ? (
            <p role="alert" className="rounded-lg border border-subtle bg-surface-elevated px-3 py-2 text-sm text-text-secondary">
              {error}
            </p>
          ) : null}

          <p className="text-xs text-text-secondary">
            Payments are processed securely by Paystack. You will be redirected to complete your purchase.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeModal;
