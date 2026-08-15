import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@clerk/clerk-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './Dialog';
import {
  createCheckout,
  isBachsCheckoutEnabled,
  type CheckoutResponse,
} from '../../services/billing';
import {
  PAYMENT_RENEWAL_DISCLOSURE,
  LITE_PLANS,
  PRO_PLANS,
  SCHOLAR_PLANS,
  SEASON_PASS_PRODUCT_KEY,
  effectivePrice,
  formatMoney,
  useProPricing,
  type SubscriptionTier,
} from '../../lib/proPricing';

// This modal is the COMPACT form of the /upgrade page: same plan catalogue,
// same price source, same badge/highlight language (see ../../lib/proPricing).
// It intentionally holds NO prices of its own — a hardcoded amount here could
// disagree with the server-owned catalogue, so while the shared
// pricing loads we render a skeleton instead of a number.

export interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional context line, e.g. the message from a 402/429 response. */
  reason?: string | null;
}

const PriceSkeleton: React.FC = () => (
  <span
    aria-label="Loading price"
    className="mt-0.5 block h-5 w-16 animate-pulse rounded bg-surface-elevated"
  />
);

const UpgradeModal: React.FC<UpgradeModalProps> = ({ open, onClose, reason }) => {
  const { getToken } = useAuth();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('pro');
  const [checkoutToConfirm, setCheckoutToConfirm] = useState<CheckoutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionKeys = useRef<Record<string, string>>({});
  const checkoutEnabled = isBachsCheckoutEnabled();

  // Only fetch while the dialog is actually open; the shared session cache means
  // reopening it (or visiting /upgrade) never refetches.
  const { pricing, loading, displayPricing } = useProPricing(open);
  const showPrices = !loading;

  const plans = useMemo(
    () =>
      (selectedTier === 'lite' ? LITE_PLANS : selectedTier === 'scholar' ? SCHOLAR_PLANS : PRO_PLANS).map((meta) => ({
        ...meta,
        badge:
          !checkoutEnabled && displayPricing.promo?.active && displayPricing.promo.label
            ? displayPricing.promo.label
            : meta.defaultBadge,
        price: formatMoney(
          effectivePrice(displayPricing, meta.plan, meta.tier, { applyPromo: !checkoutEnabled }),
          displayPricing.currency,
        ),
      })),
    [checkoutEnabled, displayPricing, selectedTier],
  );

  const seasonPass = pricing?.seasonPass?.enabled ? pricing.seasonPass : null;

  const startCheckout = async (
    key: string,
    productKey: string,
  ) => {
    if (!checkoutEnabled || pendingKey || checkoutToConfirm) return;
    setPendingKey(key);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in to upgrade.');
      const idempotencyKey = actionKeys.current[key] ?? uuidv4();
      actionKeys.current[key] = idempotencyKey;
      const checkout = await createCheckout(token, {
        productKey,
        returnSurface: 'web',
        idempotencyKey,
      });
      delete actionKeys.current[key];
      setCheckoutToConfirm(checkout);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to start checkout.');
    } finally {
      setPendingKey(null);
    }
  };

  const continueToCheckout = () => {
    if (!checkoutToConfirm) return;
    window.location.assign(checkoutToConfirm.checkoutUrl);
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
            {reason || 'Choose the plan that matches how much AI coaching and voice you need.'}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-5 space-y-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {selectedTier === 'lite' ? 'Edutu Lite' : selectedTier === 'pro' ? 'Edutu Pro' : 'Edutu Scholar'}
            </h3>
            <div className="mt-2 flex rounded-xl border border-subtle bg-surface-layer p-1">
              {(['lite', 'pro', 'scholar'] as const).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setSelectedTier(tier)}
                  className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold ${selectedTier === tier ? 'bg-brand text-white' : 'text-text-secondary'}`}
                >
                  {tier === 'lite' ? 'Lite' : tier === 'pro' ? 'Pro · 10×' : 'Scholar · max'}
                </button>
              ))}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {plans.map(({ plan, productKey, label, cadence, price, badge, highlighted, renewalHint }) => (
                <button
                  key={plan}
                  type="button"
                  disabled={!checkoutEnabled || pendingKey !== null || checkoutToConfirm !== null}
                  onClick={() => void startCheckout(`plan-${plan}`, productKey)}
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
                  <span className="text-2xs leading-snug text-text-secondary">{renewalHint}</span>
                  {badge ? <span className="text-xs text-text-secondary">{badge}</span> : null}
                </button>
              ))}
            </div>
          </section>

          {seasonPass ? (
            <section>
                <button
                  type="button"
                  disabled={!checkoutEnabled || pendingKey !== null || checkoutToConfirm !== null}
                  onClick={() => void startCheckout('season-pass', SEASON_PASS_PRODUCT_KEY)}
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

          {error ? (
            <p role="alert" className="rounded-lg border border-subtle bg-surface-elevated px-3 py-2 text-sm text-text-secondary">
              {error}
            </p>
          ) : null}

          {checkoutToConfirm ? (
            <section className="rounded-xl border border-brand/40 bg-brand/5 p-3" aria-live="polite">
              <p className="text-sm font-semibold text-text-primary">
                {checkoutToConfirm.renewalMode === 'recurring'
                  ? 'This card purchase renews automatically until you cancel.'
                  : `This is one-time access${checkoutToConfirm.accessUntil ? ` until ${new Date(checkoutToConfirm.accessUntil).toLocaleDateString()}` : ''}; renew manually when it ends.`}
              </p>
              <button
                type="button"
                onClick={continueToCheckout}
                className="mt-3 inline-flex items-center rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white"
              >
                Continue to secure checkout
              </button>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-secondary">
              {checkoutEnabled
                ? `Payments are processed securely by Bachs. ${PAYMENT_RENEWAL_DISCLOSURE}`
                : 'Payments are not available yet.'}
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
