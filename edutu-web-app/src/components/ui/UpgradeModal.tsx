import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Loader2, Sparkles, Zap } from 'lucide-react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './Dialog';
import { broadcastBillingInvalidation, createCheckout } from '../../services/billing';
import {
  FALLBACK_CREDIT_PACKS,
  PRO_PLANS,
  effectivePrice,
  formatMoney,
  useProPricing,
} from '../../lib/proPricing';

// This modal is the COMPACT form of the /upgrade page: same plan catalogue,
// same price source, same badge/highlight language (see ../../lib/proPricing).
// It intentionally holds NO prices of its own — a hardcoded amount here could
// disagree with what pay.edutu.org actually charges, so while the shared
// pricing loads we render a skeleton instead of a number.

export interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional context line, e.g. the message from a 402/429 response. */
  reason?: string | null;
  /** Path to return to after checkout completes. */
  returnTo?: string;
}

const PriceSkeleton: React.FC = () => (
  <span
    aria-label="Loading price"
    className="mt-0.5 block h-5 w-16 animate-pulse rounded bg-surface-elevated"
  />
);

const UpgradeModal: React.FC<UpgradeModalProps> = ({ open, onClose, reason, returnTo }) => {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only fetch while the dialog is actually open; the shared session cache means
  // reopening it (or visiting /upgrade) never refetches.
  const { pricing, loading, displayPricing } = useProPricing(open);
  const showPrices = !loading;

  const proPlans = useMemo(
    () =>
      PRO_PLANS.map((meta) => ({
        ...meta,
        badge:
          displayPricing.promo?.active && displayPricing.promo.label
            ? displayPricing.promo.label
            : meta.defaultBadge,
        price: formatMoney(effectivePrice(displayPricing, meta.plan), displayPricing.currency),
      })),
    [displayPricing],
  );

  const creditPacks = useMemo(() => {
    const packs = pricing?.creditPacks?.filter(
      (pack) => typeof pack.credits === 'number' && typeof pack.price === 'number',
    );
    const resolved = packs?.length ? packs.slice(0, 3) : FALLBACK_CREDIT_PACKS;
    return resolved.map((pack) => ({
      credits: pack.credits,
      price: formatMoney(pack.price, displayPricing.currency),
    }));
  }, [pricing, displayPricing]);

  // One-off Season Pass — admin-configured and only offered when signed in (an
  // empty uid must never reach the hosted checkout). Unlike the recurring plans
  // (which go through the backend billing checkout), the season pass is a direct
  // pay.edutu.org one-off link (`plan=season`), the only surface that mints it.
  const seasonPass = pricing?.seasonPass?.enabled && user?.id ? pricing.seasonPass : null;

  const openSeasonCheckout = () => {
    if (!seasonPass || !user?.id || pendingKey) return;
    const base = (pricing?.checkoutBaseUrl || 'https://pay.edutu.org').replace(/\/$/, '');
    const params = new URLSearchParams({ uid: user.id, plan: 'season', ref: 'edutu-web', platform: 'web' });
    const email = user.primaryEmailAddress?.emailAddress;
    if (email) params.set('email', email);
    window.location.assign(`${base}/checkout?${params.toString()}`);
  };

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
        // Plan checkouts go to pay.edutu.org, which identifies the buyer from
        // these; credit top-ups ignore them and use the bearer token.
        uid: user?.id,
        email: user?.primaryEmailAddress?.emailAddress,
        pricing,
      });
      if (checkout.configured === false || !checkout.authorizationUrl) {
        setError(checkout.message || 'Payments are not configured yet. Please try again later or contact support.');
        return;
      }
      broadcastBillingInvalidation();
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
              {proPlans.map(({ plan, label, cadence, price, badge, highlighted }) => (
                <button
                  key={plan}
                  type="button"
                  disabled={pendingKey !== null}
                  onClick={() => void startCheckout(`plan-${plan}`, { plan })}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    highlighted
                      ? 'border-brand bg-surface-layer ring-1 ring-brand/40'
                      : 'border-subtle bg-surface-layer hover:border-brand hover:bg-surface-elevated'
                  }`}
                >
                  <span className="text-sm font-medium text-text-primary">{label}</span>
                  {pendingKey === `plan-${plan}` ? (
                    <Loader2 className="h-4 w-4 animate-spin text-brand" aria-label="Starting checkout" />
                  ) : showPrices ? (
                    <span className="text-base font-semibold text-brand">{price}</span>
                  ) : (
                    <PriceSkeleton />
                  )}
                  <span className="text-2xs text-text-muted">{cadence}</span>
                  {badge ? <span className="text-xs text-text-secondary">{badge}</span> : null}
                </button>
              ))}
            </div>
          </section>

          {seasonPass ? (
            <section>
              <button
                type="button"
                disabled={pendingKey !== null}
                onClick={openSeasonCheckout}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-brand/40 bg-surface-layer p-3 text-left transition-colors hover:border-brand hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-text-primary">{seasonPass.label}</span>
                  <span className="text-xs text-text-secondary">
                    {seasonPass.durationDays}-day Pro access · one-off
                  </span>
                </span>
                <span className="text-base font-semibold text-brand">
                  {formatMoney(seasonPass.price, pricing?.currency ?? 'NGN')}
                </span>
              </button>
            </section>
          ) : null}

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
                  {pendingKey === `credits-${credits}` ? (
                    <Loader2 className="h-4 w-4 animate-spin text-brand" aria-label="Starting checkout" />
                  ) : showPrices ? (
                    <span className="text-base font-semibold text-brand">{price}</span>
                  ) : (
                    <PriceSkeleton />
                  )}
                </button>
              ))}
            </div>
          </section>

          {error ? (
            <p role="alert" className="rounded-lg border border-subtle bg-surface-elevated px-3 py-2 text-sm text-text-secondary">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-secondary">
              Payments are processed securely by Paystack. You will be redirected to complete your purchase.
            </p>
            <Link
              to="/upgrade"
              onClick={onClose}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand no-underline hover:underline"
            >
              Compare plans
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeModal;
