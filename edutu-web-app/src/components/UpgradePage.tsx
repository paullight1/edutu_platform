import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  ArrowRight,
  Check,
  CreditCard,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';
import Seo from './Seo';
import { createCheckout, type BillingInterval } from '../services/billing';
import { type RemotePricing } from '../services/mobileControl';
import { usePaywall } from '../hooks/usePaywall';
import {
  FALLBACK_PRICING,
  effectivePrice,
  formatMoney,
  loadRemotePricing,
} from '../lib/proPricing';

interface PlanCard {
  plan: BillingInterval;
  label: string;
  cadence: string;
  price: string;
  /** Optional badge (e.g. "Best value" / promo label). */
  badge?: string;
  /** Short reassurance line under the price. */
  hint: string;
  highlighted: boolean;
}

/* Outcome-based benefits — this audience is African youth chasing scholarships,
 * so we sell outcomes, not features. Every claim here must be true on the web
 * app specifically: the AI coach and CV builder are mobile-app-only (the web
 * /coach and /cv routes redirect to the dashboard), so they're labelled as
 * such. The web-only items (closed-opportunity filter, roadmap calendar
 * export) are real Pro gates — see ProGate.tsx / OpportunitiesPage.tsx /
 * RoadmapsPage.tsx. */
const BENEFITS: string[] = [
  'See closed and expired opportunities too — not just what is still open',
  'Add your roadmap milestones straight to your calendar, so deadlines never sneak up on you',
  'Unlimited AI coaching on essays, applications and interview prep — in the Edutu mobile app',
  'Standout CV templates and instant AI-polished CVs — in the Edutu mobile app',
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'What is Edutu Pro?',
    a: 'Pro unlocks everything Edutu can do to help you win. In the Edutu mobile app, that means unlimited AI coaching on essays and applications, plus standout CV templates. Here on the web, it means seeing closed and expired opportunities and exporting your roadmap straight to your calendar. One subscription covers both.',
  },
  {
    q: 'How do I pay?',
    a: 'You can pay with your card, mobile money, or a bank transfer — all processed securely by Paystack. You will be redirected to a secure checkout to complete your purchase, then brought straight back to Edutu.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Pro is a simple subscription — you keep access for the period you paid for, and you are never locked in. Cancel whenever you like and you will not be charged again.',
  },
  {
    q: 'Does it work on mobile too?',
    a: 'Yes — and that is where the AI coach and CV builder live. Pro follows your account across the web app and the Edutu mobile app, so paying once activates it wherever you sign in. On the web, Pro unlocks closed-opportunity filters and roadmap calendar exports.',
  },
];

const UpgradePage: React.FC = () => {
  const { getToken, isSignedIn } = useAuth();
  const { isPro } = usePaywall();

  const [pricing, setPricing] = useState<RemotePricing>(FALLBACK_PRICING);
  const [pendingPlan, setPendingPlan] = useState<BillingInterval | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pull the latest admin pricing (shared session cache). Billing status is
  // owned by useBillingStatus under PaywallProvider, which already refetches on
  // mount and on tab focus — so returning from Paystack re-checks Pro without a
  // duplicate request here.
  useEffect(() => {
    let cancelled = false;
    void loadRemotePricing().then((remote) => {
      if (!cancelled && remote) setPricing(remote);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Yearly vs. paying monthly for a year — leaned into as the headline saving.
  const yearlySavingPct = useMemo(() => {
    const monthlyForYear = effectivePrice(pricing, 'monthly') * 12;
    const yearly = effectivePrice(pricing, 'yearly');
    if (monthlyForYear <= 0 || yearly <= 0 || yearly >= monthlyForYear) return 0;
    return Math.round((1 - yearly / monthlyForYear) * 100);
  }, [pricing]);

  const plans = useMemo<PlanCard[]>(() => {
    const promoLabel = pricing.promo?.active && pricing.promo.label ? pricing.promo.label : undefined;
    return [
      {
        plan: 'weekly',
        label: 'Weekly',
        cadence: 'per week',
        price: formatMoney(effectivePrice(pricing, 'weekly'), pricing.currency),
        badge: promoLabel,
        hint: 'Try Pro for a big week — perfect around a deadline.',
        highlighted: false,
      },
      {
        plan: 'monthly',
        label: 'Monthly',
        cadence: 'per month',
        price: formatMoney(effectivePrice(pricing, 'monthly'), pricing.currency),
        badge: promoLabel ?? 'Most popular',
        hint: 'Full access, month to month. Cancel anytime.',
        highlighted: false,
      },
      {
        plan: 'yearly',
        label: 'Yearly',
        cadence: 'per year',
        price: formatMoney(effectivePrice(pricing, 'yearly'), pricing.currency),
        badge: promoLabel ?? (yearlySavingPct > 0 ? `Best value · save ${yearlySavingPct}%` : 'Best value'),
        hint:
          yearlySavingPct > 0
            ? `A full year of Pro for roughly ${yearlySavingPct}% less than paying monthly.`
            : 'A full year of Pro at our best price.',
        highlighted: true,
      },
    ];
  }, [pricing, yearlySavingPct]);

  const startCheckout = async (plan: BillingInterval) => {
    if (pendingPlan) return;
    setPendingPlan(plan);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError('Please sign in to continue to checkout.');
        return;
      }
      const checkout = await createCheckout(token, { plan, returnTo: '/upgrade' });
      if (checkout.configured === false || !checkout.authorizationUrl) {
        setError(
          checkout.message ||
            'Payments are not configured yet. Please try again later or contact support.',
        );
        return;
      }
      window.location.assign(checkout.authorizationUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to start checkout.');
    } finally {
      setPendingPlan(null);
    }
  };

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
      <Seo
        title="Edutu Pro — AI coaching, CV tools and smarter tracking"
        description="Go Pro on Edutu for unlimited AI coaching and CV tools in the Edutu mobile app, plus closed-opportunity filters and calendar exports on the web. One scholarship is worth far more than the subscription. Pay by card, mobile money, or bank transfer via Paystack."
        path="/upgrade"
      />
      <PublicHeader />

      <main className="relative z-10">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="relative px-4 pt-32 pb-16 sm:px-6 sm:pt-40 sm:pb-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
            style={{
              background:
                'radial-gradient(56% 60% at 50% 0%, rgb(var(--color-brand-500) / 0.16), transparent 72%)',
            }}
          />
          <div className="relative mx-auto flex w-full max-w-[860px] flex-col items-center text-center">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-4 py-1.5">
              <Sparkles size={14} className="text-brand" aria-hidden="true" />
              <span className="text-2xs font-semibold uppercase tracking-[0.2em] text-brand">
                Edutu Pro
              </span>
            </span>
            <h1 className="font-display text-[clamp(2.4rem,6.5vw,4rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-balance text-text-primary">
              Stop scrolling.{' '}
              <span className="text-brand">Start winning.</span>
            </h1>
            <p className="mt-6 max-w-[620px] text-base leading-relaxed text-text-secondary sm:text-lg">
              Edutu Pro unlocks unlimited AI coaching and CV tools in the mobile app, plus access to
              closed and expired opportunities and calendar export here on the web. One scholarship
              or job is worth far more than a whole year of Pro.
            </p>
          </div>
        </section>

        {isPro ? (
          /* ── Already Pro ────────────────────────────────────── */
          <section className="px-4 pb-28 sm:px-6">
            <div className="mx-auto max-w-[640px] rounded-[32px] border border-subtle bg-surface-layer p-10 text-center shadow-soft sm:p-14">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10">
                <Trophy size={30} className="text-brand" aria-hidden="true" />
              </div>
              <h2 className="font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
                You&rsquo;re on Edutu Pro 🎉
              </h2>
              <p className="mx-auto mt-4 max-w-[440px] text-base leading-relaxed text-text-secondary">
                Everything is unlocked — unlimited AI coaching and CV tools on mobile, plus
                closed-opportunity filters and calendar exports here on the web. Go make the most
                of it.
              </p>
              <Link
                to="/dashboard"
                className="group mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-8 py-4 text-base font-semibold text-white no-underline shadow-elevated transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700"
              >
                Go to your dashboard
                <ArrowRight
                  size={16}
                  className="transition-transform duration-200 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </section>
        ) : (
          <>
            {/* ── Plans ──────────────────────────────────────────── */}
            <section className="px-4 pb-8 sm:px-6">
              <div className="mx-auto grid max-w-[1080px] gap-5 md:grid-cols-3">
                {plans.map((card) => {
                  const isPending = pendingPlan === card.plan;
                  return (
                    <div
                      key={card.plan}
                      className={`relative flex flex-col rounded-3xl border p-7 shadow-soft transition-all duration-200 ${
                        card.highlighted
                          ? 'border-brand bg-surface-layer ring-1 ring-brand/40 md:-translate-y-2'
                          : 'border-subtle bg-surface-layer hover:border-brand/40'
                      }`}
                    >
                      {card.badge ? (
                        <span
                          className={`mb-4 inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-2xs font-bold uppercase tracking-[0.12em] ${
                            card.highlighted
                              ? 'bg-brand text-white'
                              : 'bg-brand/10 text-brand'
                          }`}
                        >
                          {card.badge}
                        </span>
                      ) : null}
                      <h3 className="font-display text-xl font-semibold text-text-primary">
                        {card.label}
                      </h3>
                      <div className="mt-3 flex items-baseline gap-1.5">
                        <span className="font-display text-4xl font-semibold leading-none text-text-primary">
                          {card.price}
                        </span>
                        <span className="text-sm font-medium text-text-muted">
                          {card.cadence}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                        {card.hint}
                      </p>

                      {isSignedIn ? (
                        <button
                          type="button"
                          disabled={pendingPlan !== null}
                          onClick={() => void startCheckout(card.plan)}
                          className={`group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold no-underline transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                            card.highlighted
                              ? 'bg-brand text-white shadow-elevated hover:-translate-y-0.5 hover:bg-brand-700'
                              : 'border border-subtle bg-surface-body text-text-primary hover:border-brand/50 hover:text-brand'
                          }`}
                        >
                          {isPending ? (
                            <>
                              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                              Starting checkout…
                            </>
                          ) : (
                            <>
                              Continue to secure checkout
                              <ArrowRight
                                size={16}
                                className="transition-transform duration-200 group-hover:translate-x-1"
                                aria-hidden="true"
                              />
                            </>
                          )}
                        </button>
                      ) : (
                        <Link
                          to={`/auth?mode=sign-up&redirect=${encodeURIComponent('/upgrade')}`}
                          className={`group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold no-underline transition-all duration-200 ${
                            card.highlighted
                              ? 'bg-brand text-white shadow-elevated hover:-translate-y-0.5 hover:bg-brand-700'
                              : 'border border-subtle bg-surface-body text-text-primary hover:border-brand/50 hover:text-brand'
                          }`}
                        >
                          Sign in to continue
                          <ArrowRight
                            size={16}
                            className="transition-transform duration-200 group-hover:translate-x-1"
                            aria-hidden="true"
                          />
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>

              {error ? (
                <p
                  role="alert"
                  className="mx-auto mt-6 max-w-[1080px] rounded-xl border border-subtle bg-surface-elevated px-4 py-3 text-center text-sm text-text-secondary"
                >
                  {error}
                </p>
              ) : null}

              <p className="mx-auto mt-6 flex max-w-[1080px] items-center justify-center gap-2 text-center text-sm text-text-muted">
                <ShieldCheck size={15} className="text-brand" aria-hidden="true" />
                Pay by card, mobile money, or bank transfer — processed securely by Paystack.
              </p>
            </section>

            {/* ── Benefits ───────────────────────────────────────── */}
            <section className="px-4 py-20 sm:px-6 sm:py-24">
              <div className="mx-auto max-w-[1000px]">
                <div className="max-w-2xl">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                    What you unlock
                  </span>
                  <h2 className="mt-4 font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-semibold leading-[1.08] tracking-tight text-text-primary">
                    Built to help you actually{' '}
                    <span className="text-brand">win the opportunity.</span>
                  </h2>
                  <p className="mt-4 text-base leading-relaxed text-text-secondary">
                    A single scholarship, grant or job offer is worth far more than a whole year of
                    Pro. Everything here is designed to get you across the finish line.
                  </p>
                </div>

                <div className="mt-10 grid gap-4 sm:grid-cols-2">
                  {BENEFITS.map((benefit) => (
                    <div
                      key={benefit}
                      className="flex items-start gap-3 rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft"
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10">
                        <Check size={14} className="text-brand" aria-hidden="true" />
                      </span>
                      <span className="text-base leading-snug text-text-primary">
                        {benefit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── FAQ ────────────────────────────────────────────── */}
            <section className="border-t border-subtle bg-surface-elevated px-4 py-20 sm:px-6 sm:py-24">
              <div className="mx-auto max-w-[820px]">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                  Questions
                </span>
                <h2 className="mt-4 font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-semibold leading-[1.08] tracking-tight text-text-primary">
                  Everything you might ask
                </h2>

                <dl className="mt-10 space-y-6">
                  {FAQ.map((item) => (
                    <div
                      key={item.q}
                      className="rounded-2xl border border-subtle bg-surface-layer p-6 shadow-soft"
                    >
                      <dt className="font-display text-lg font-semibold text-text-primary">
                        {item.q}
                      </dt>
                      <dd className="mt-2 text-base leading-relaxed text-text-secondary">
                        {item.a}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </section>

            {/* ── Close ──────────────────────────────────────────── */}
            <section className="px-4 py-24 sm:px-6">
              <div className="mx-auto max-w-[900px] overflow-hidden rounded-[32px] bg-gradient-to-br from-brand-500 to-brand-700 p-10 text-center shadow-elevated sm:p-14">
                <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                  <CreditCard size={26} className="text-white" aria-hidden="true" />
                </div>
                <h2 className="mx-auto max-w-[620px] font-display text-3xl font-semibold text-white sm:text-4xl">
                  Your next opportunity is worth it.
                </h2>
                <p className="mx-auto mt-4 max-w-[480px] text-base leading-relaxed text-white/85 sm:text-lg">
                  Go Pro today and give every application your best shot. Card, mobile money or bank
                  transfer — secure checkout via Paystack.
                </p>
                {isSignedIn ? (
                  <button
                    type="button"
                    disabled={pendingPlan !== null}
                    onClick={() => void startCheckout('yearly')}
                    className="group mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-semibold text-brand no-underline shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingPlan === 'yearly' ? (
                      <>
                        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                        Starting checkout…
                      </>
                    ) : (
                      <>
                        Get Pro yearly
                        <ArrowRight
                          size={16}
                          className="transition-transform duration-200 group-hover:translate-x-1"
                          aria-hidden="true"
                        />
                      </>
                    )}
                  </button>
                ) : (
                  <Link
                    to={`/auth?mode=sign-up&redirect=${encodeURIComponent('/upgrade')}`}
                    className="group mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-semibold text-brand no-underline shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated"
                  >
                    Sign in to go Pro
                    <ArrowRight
                      size={16}
                      className="transition-transform duration-200 group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </Link>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
};

export default UpgradePage;
