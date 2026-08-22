import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { v4 as uuidv4 } from 'uuid';
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
import {
  createCheckout,
  isBachsCheckoutEnabled,
  type BillingInterval,
  type CheckoutResponse,
} from '../services/billing';
import { usePaywall } from '../hooks/usePaywall';
import {
  LITE_PLANS,
  PRO_PLANS,
  SCHOLAR_PLANS,
  PAYMENT_RENEWAL_DISCLOSURE,
  effectivePrice,
  formatMoney,
  useProPricing,
  type SubscriptionTier,
} from '../lib/proPricing';

// The full-page form of the upgrade surface. It shares its plan catalogue,
// price source and badge language with the compact UpgradeModal — both read
// ../lib/proPricing, so a price can never differ between the two.

interface PlanCard {
  tier: SubscriptionTier;
  plan: BillingInterval;
  productKey: string;
  label: string;
  cadence: string;
  price: string;
  /** Optional badge (e.g. "Best value" / promo label). */
  badge?: string;
  /** Short reassurance line under the price. */
  hint: string;
  renewalHint: string;
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
    a: 'Pro unlocks everything Edutu can do to help you win. In the Edutu mobile app, that means unlimited AI coaching on essays and applications, plus standout CV templates. Here on the web, it means seeing closed and expired opportunities and exporting your roadmap straight to your calendar. One purchase covers both while the pass is active.',
  },
  {
    q: 'How do I pay?',
    a: 'You can pay with your card, mobile money, or a bank transfer through Bachs. The current web plans are one-time access passes for the selected period; renew manually when access ends.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'The current web plans do not renew automatically. Access remains available for the purchased period, and you can purchase another pass when it ends.',
  },
  {
    q: 'Does it work on mobile too?',
    a: 'Yes — and that is where the AI coach and CV builder live. Pro follows your account across the web app and the Edutu mobile app, so the active pass works wherever you sign in. On the web, Pro unlocks closed-opportunity filters and roadmap calendar exports.',
  },
];

const UpgradePage: React.FC = () => {
  const { getToken, isSignedIn } = useAuth();
  const { isPro, planTier } = usePaywall();
  const { loading: pricingLoading, displayPricing: pricing } = useProPricing();
  const showPrices = !pricingLoading;
  const [pendingPlan, setPendingPlan] = useState<BillingInterval | null>(null);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('pro');
  const [checkoutToConfirm, setCheckoutToConfirm] = useState<CheckoutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionKeys = useRef<Record<string, string>>({});
  const checkoutEnabled = isBachsCheckoutEnabled();

  const yearlySavingPct = useMemo(() => {
    const priceOptions = { applyPromo: !checkoutEnabled };
    const monthlyForYear = effectivePrice(pricing, 'monthly', selectedTier, priceOptions) * 12;
    const yearly = effectivePrice(pricing, 'yearly', selectedTier, priceOptions);
    if (monthlyForYear <= 0 || yearly <= 0 || yearly >= monthlyForYear) return 0;
    return Math.round((1 - yearly / monthlyForYear) * 100);
  }, [checkoutEnabled, pricing, selectedTier]);

  const plans = useMemo<PlanCard[]>(() => {
    const promoLabel = !checkoutEnabled && pricing.promo?.active && pricing.promo.label
      ? pricing.promo.label
      : undefined;
    const tierPlans = selectedTier === 'lite' ? LITE_PLANS : selectedTier === 'scholar' ? SCHOLAR_PLANS : PRO_PLANS;
    return tierPlans.map((meta) => {
      const savingBadge = showPrices && meta.plan === 'yearly' && yearlySavingPct > 0 ? `Best value · save ${yearlySavingPct}%` : meta.defaultBadge;
      return {
        plan: meta.plan,
        tier: meta.tier,
        productKey: meta.productKey,
        label: meta.longLabel,
        cadence: meta.cadence,
        price: formatMoney(effectivePrice(pricing, meta.plan, meta.tier, { applyPromo: !checkoutEnabled }), pricing.currency),
        badge: promoLabel ?? savingBadge,
        hint: showPrices && meta.plan === 'yearly' && yearlySavingPct > 0 ? `A full year of ${meta.tier === 'lite' ? 'Lite' : meta.tier === 'scholar' ? 'Scholar' : 'Pro'} for roughly ${yearlySavingPct}% less than paying monthly.` : meta.hint,
        renewalHint: meta.renewalHint,
        highlighted: meta.highlighted,
      };
    });
  }, [checkoutEnabled, pricing, yearlySavingPct, showPrices, selectedTier]);

  const startCheckout = async (card: Pick<PlanCard, 'plan' | 'productKey'>) => {
    if (!checkoutEnabled || pendingPlan || checkoutToConfirm) return;
    const { plan, productKey } = card;
    setPendingPlan(plan);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError('Please sign in to continue to checkout.');
        return;
      }
      const actionKey = `${selectedTier}-${plan}`;
      const idempotencyKey = actionKeys.current[actionKey] ?? uuidv4();
      actionKeys.current[actionKey] = idempotencyKey;
      const checkout = await createCheckout(token, { productKey, returnSurface: 'web', idempotencyKey });
      delete actionKeys.current[actionKey];
      setCheckoutToConfirm(checkout);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to start checkout.');
    } finally {
      setPendingPlan(null);
    }
  };

  const continueToCheckout = () => {
    if (!checkoutToConfirm) return;
    window.location.assign(checkoutToConfirm.checkoutUrl);
  };

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
      <Seo title="Edutu Pro — AI coaching, CV tools and smarter tracking" description="Go Pro on Edutu for unlimited AI coaching and CV tools in the Edutu mobile app, plus closed-opportunity filters and calendar exports on the web. Current web plans provide bounded one-time access." path="/upgrade" />
      <PublicHeader />
      <main className="relative z-10">
        <section className="relative px-4 pt-32 pb-16 sm:px-6 sm:pt-40 sm:pb-20">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[560px]" style={{ background: 'radial-gradient(56% 60% at 50% 0%, rgb(var(--color-brand-500) / 0.16), transparent 72%)' }} />
          <div className="relative mx-auto flex w-full max-w-[860px] flex-col items-center text-center">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-4 py-1.5"><Sparkles size={14} className="text-brand" aria-hidden="true" /><span className="text-2xs font-semibold uppercase tracking-[0.2em] text-brand">Edutu Pro</span></span>
            <h1 className="font-display text-[clamp(2.4rem,6.5vw,4rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-balance text-text-primary">Stop scrolling.{' '}<span className="text-brand">Start winning.</span></h1>
            <p className="mt-6 max-w-[620px] text-base leading-relaxed text-text-secondary sm:text-lg">Edutu Pro unlocks unlimited AI coaching and CV tools in the mobile app, plus access to closed and expired opportunities and calendar export here on the web. One scholarship or job is worth far more than a whole year of Pro.</p>
          </div>
        </section>
        {isPro && planTier !== 'lite' ? (
          <section className="px-4 pb-28 sm:px-6"><div className="mx-auto max-w-[640px] rounded-[32px] border border-subtle bg-surface-layer p-10 text-center shadow-soft sm:p-14"><div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10"><Trophy size={30} className="text-brand" aria-hidden="true" /></div><h2 className="font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">You&rsquo;re on Edutu Pro 🎉</h2><p className="mx-auto mt-4 max-w-[440px] text-base leading-relaxed text-text-secondary">Everything is unlocked — unlimited AI coaching and CV tools on mobile, plus closed-opportunity filters and calendar exports here on the web. Go make the most of it.</p><Link to="/dashboard" className="group mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-8 py-4 text-base font-semibold text-white no-underline shadow-elevated transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700">Go to your dashboard<ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" /></Link></div></section>
        ) : (
          <>
            <section className="px-4 pb-8 sm:px-6">
              <div className="mx-auto mb-8 flex max-w-[420px] rounded-2xl border border-subtle bg-surface-layer p-1.5">{(['lite', 'pro', 'scholar'] as const).map((tier) => <button key={tier} type="button" onClick={() => setSelectedTier(tier)} className={`flex-1 rounded-xl px-5 py-3 text-sm font-semibold transition-colors ${selectedTier === tier ? 'bg-brand text-white shadow-soft' : 'text-text-secondary hover:text-text-primary'}`}>{tier === 'lite' ? 'Lite — essentials' : tier === 'pro' ? 'Pro — 10× usage' : 'Scholar — maximum'}</button>)}</div>
              <div className="mx-auto grid max-w-[1080px] gap-5 md:grid-cols-3">{plans.map((card) => { const isPending = pendingPlan === card.plan; return <div key={card.plan} className={`relative flex flex-col rounded-3xl border p-7 shadow-soft transition-all duration-200 ${card.highlighted ? 'border-brand bg-surface-layer ring-1 ring-brand/40 md:-translate-y-2' : 'border-subtle bg-surface-layer hover:border-brand/40'}`}>{card.badge ? <span className={`mb-4 inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-2xs font-bold uppercase tracking-[0.12em] ${card.highlighted ? 'bg-brand text-white' : 'bg-brand/10 text-brand'}`}>{card.badge}</span> : null}<h3 className="font-display text-xl font-semibold text-text-primary">{selectedTier === 'lite' ? 'Lite' : selectedTier === 'pro' ? 'Pro' : 'Scholar'} {card.label}</h3><div className="mt-3 flex items-baseline gap-1.5">{showPrices ? <span className="font-display text-4xl font-semibold leading-none text-text-primary">{card.price}</span> : <span aria-label="Loading price" className="block h-9 w-32 animate-pulse rounded-lg bg-surface-elevated" />}<span className="text-sm font-medium text-text-muted">{card.cadence}</span></div><p className="mt-3 text-sm leading-relaxed text-text-secondary">{card.hint}</p><p className="mt-2 text-xs leading-relaxed text-text-muted">{card.renewalHint}</p>{isSignedIn ? <button type="button" disabled={!checkoutEnabled || pendingPlan !== null || checkoutToConfirm !== null} onClick={() => void startCheckout(card)} className={`group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold no-underline transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${card.highlighted ? 'bg-brand text-white shadow-elevated hover:-translate-y-0.5 hover:bg-brand-700' : 'border border-subtle bg-surface-body text-text-primary hover:border-brand/50 hover:text-brand'}`}>{isPending ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" />Starting checkout…</> : <>Continue to secure checkout<ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" /></>}</button> : <Link to={`/auth?mode=sign-up&redirect=${encodeURIComponent('/upgrade')}`} className={`group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold no-underline transition-all duration-200 ${card.highlighted ? 'bg-brand text-white shadow-elevated hover:-translate-y-0.5 hover:bg-brand-700' : 'border border-subtle bg-surface-body text-text-primary hover:border-brand/50 hover:text-brand'}`}>Sign in to continue<ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" /></Link>}</div>; })}</div>
              {error ? <p role="alert" className="mx-auto mt-6 max-w-[1080px] rounded-xl border border-subtle bg-surface-elevated px-4 py-3 text-center text-sm text-text-secondary">{error}</p> : null}
              {checkoutToConfirm ? <section className="mx-auto mt-6 max-w-[720px] rounded-2xl border border-brand/40 bg-brand/5 p-5 text-center" aria-live="polite"><h2 className="font-display text-xl font-semibold text-text-primary">Review your renewal terms</h2><p className="mt-2 text-sm leading-relaxed text-text-secondary">{checkoutToConfirm.renewalMode === 'recurring' ? 'This card purchase renews automatically until you cancel.' : `This is one-time access${checkoutToConfirm.accessUntil ? ` until ${new Date(checkoutToConfirm.accessUntil).toLocaleDateString()}` : ''}; renew manually when it ends.`}</p><button type="button" onClick={continueToCheckout} className="mt-4 inline-flex items-center justify-center rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white">Continue to secure checkout</button></section> : null}
              <p className="mx-auto mt-6 flex max-w-[1080px] items-center justify-center gap-2 text-center text-sm text-text-muted"><ShieldCheck size={15} className="text-brand" aria-hidden="true" />{checkoutEnabled ? `Processed securely by Bachs. ${PAYMENT_RENEWAL_DISCLOSURE}` : 'Payments are not available yet.'}</p>
            </section>
            <section className="px-4 py-20 sm:px-6 sm:py-24"><div className="mx-auto max-w-[1000px]"><div className="max-w-2xl"><span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">What you unlock</span><h2 className="mt-4 font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-semibold leading-[1.08] tracking-tight text-text-primary">Built to help you actually{' '}<span className="text-brand">win the opportunity.</span></h2><p className="mt-4 text-base leading-relaxed text-text-secondary">A single scholarship, grant or job offer is worth far more than a whole year of Pro. Everything here is designed to get you across the finish line.</p></div><div className="mt-10 grid gap-4 sm:grid-cols-2">{BENEFITS.map((benefit) => <div key={benefit} className="flex items-start gap-3 rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10"><Check size={14} className="text-brand" aria-hidden="true" /></span><span className="text-base leading-snug text-text-primary">{benefit}</span></div>)}</div></div></section>
            <section className="border-t border-subtle bg-surface-elevated px-4 py-20 sm:px-6 sm:py-24"><div className="mx-auto max-w-[820px]"><span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Questions</span><h2 className="mt-4 font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-semibold leading-[1.08] tracking-tight text-text-primary">Everything you might ask</h2><dl className="mt-10 space-y-6">{FAQ.map((item) => <div key={item.q} className="rounded-2xl border border-subtle bg-surface-layer p-6 shadow-soft"><dt className="font-display text-lg font-semibold text-text-primary">{item.q}</dt><dd className="mt-2 text-base leading-relaxed text-text-secondary">{item.a}</dd></div>)}</dl></div></section>
            <section className="px-4 py-24 sm:px-6"><div className="mx-auto max-w-[900px] overflow-hidden rounded-[32px] bg-gradient-to-br from-brand-500 to-brand-700 p-10 text-center shadow-elevated sm:p-14"><div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15"><CreditCard size={26} className="text-white" aria-hidden="true" /></div><h2 className="mx-auto max-w-[620px] font-display text-3xl font-semibold text-white sm:text-4xl">Your next opportunity is worth it.</h2><p className="mx-auto mt-4 max-w-[480px] text-base leading-relaxed text-white/85 sm:text-lg">Go Pro today and give every application your best shot. Card, mobile money or bank transfer — secure checkout via Bachs. Current web plans are bounded one-time access and renew manually.</p>{isSignedIn ? <button type="button" disabled={!checkoutEnabled || pendingPlan !== null || checkoutToConfirm !== null} onClick={() => void startCheckout({ plan: 'yearly', productKey: 'pro_yearly_pass' })} className="group mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-semibold text-brand no-underline shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated disabled:cursor-not-allowed disabled:opacity-60">{pendingPlan === 'yearly' ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" />Starting checkout…</> : <>Get Pro yearly<ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" /></>}</button> : <Link to={`/auth?mode=sign-up&redirect=${encodeURIComponent('/upgrade')}`} className="group mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-semibold text-brand no-underline shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated">Sign in to go Pro<ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" /></Link>}</div></section>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default UpgradePage;
