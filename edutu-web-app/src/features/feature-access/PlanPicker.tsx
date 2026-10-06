import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import {
  createCheckout,
  isBachsCheckoutEnabled,
  type CheckoutResponse,
} from "../../services/billing";
import { productApiRequest } from "../../services/productApi";
import { effectivePrice, formatMoney, useProPricing } from "../../lib/proPricing";
interface Product {
  productKey: string;
  amountMinor: number;
  currency: string;
  renewalMode: string;
  validityDays: number | null;
  cadence: string | null;
  fulfillmentKind: string;
  creditQuantity: number | null;
}
interface Catalog {
  products: Product[];
  checkoutEnabled: boolean;
}
const title = (key: string) =>
  key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
function price(product: Product) {
  const format = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: product.currency,
  });
  return format.format(
    product.amountMinor /
      10 ** (format.resolvedOptions().maximumFractionDigits ?? 2),
  );
}

function isNetworkFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    /failed to fetch|networkerror|load failed|network.*unavailable|unreachable/i.test(
      error.message,
    )
  );
}

function readableBillingError(error: unknown, fallback: string): string {
  if (isNetworkFailure(error)) {
    return "We couldn’t reach Edutu just now. Check your connection and try again.";
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function PlanAvailabilityIllustration() {
  return (
    <svg aria-hidden="true" viewBox="0 0 88 72" className="mb-3 h-16 w-20 text-brand" fill="none">
      <path d="M8 57.5 22 43l10 8 17-21 10 9 19-24" stroke="currentColor" strokeOpacity=".18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="12" y="10" width="64" height="48" rx="12" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeOpacity=".28" />
      <path d="M31 37v-4a7 7 0 0 1 14 0v4m-17 0h20v13H28V37Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="38" cy="43" r="1.5" fill="currentColor" />
    </svg>
  );
}

export default function PlanPicker({
  active = true,
  compact = false,
  docked = false,
}: {
  active?: boolean;
  compact?: boolean;
  docked?: boolean;
}) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWalletLink, setShowWalletLink] = useState(false);
  const [tier, setTier] = useState<"lite" | "pro" | "scholar">("pro");
  const [cadence, setCadence] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [selectedProductKey, setSelectedProductKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<
    (CheckoutResponse & { productKey: string }) | null
  >(null);
  const keys = useRef<Record<string, string>>({});
  const priceState = useProPricing(active);
  const owner = useRef(userId);
  owner.current = userId;
  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      setShowWalletLink(false);
      try {
        const token = await getToken();
        if (!token) throw new Error("Sign in to view available plans.");
        const result = await productApiRequest<Catalog>(
          "/billing/user-catalog",
          token,
          { signal },
        );
        if (!signal.aborted) setCatalog(result);
      } catch (e) {
        if (!signal.aborted) {
          setError(readableBillingError(e, "Plans are unavailable right now."));
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [getToken],
  );
  useEffect(() => {
    setCatalog(null);
    setCheckout(null);
    setBusy(null);
    keys.current = {};
    const c = new AbortController();
    if (active && isLoaded && isSignedIn) void load(c.signal);
    else setLoading(false);
    return () => c.abort();
  }, [active, isLoaded, isSignedIn, userId, load]);
  async function begin(product: Product) {
    if (
      busy ||
      checkout ||
      !catalog?.checkoutEnabled ||
      !isBachsCheckoutEnabled()
    )
      return;
    const account = userId;
    setBusy(product.productKey);
    setError(null);
    setShowWalletLink(false);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in to continue.");
      if (owner.current !== account) return;
      let recovered: {
        productKey?: string;
        idempotencyKey?: string;
        intentId?: string;
      } | null = null;
      try {
        const raw = localStorage.getItem(`edutu.checkout.${account}`);
        recovered = raw ? JSON.parse(raw) : null;
      } catch {
        /* storage may be unavailable */
      }
      if (
        recovered?.intentId ||
        (recovered?.productKey && recovered.productKey !== product.productKey)
      )
        throw new Error(
          "You have a pending checkout. Open your wallet to confirm or clear it before starting another.",
        );
      const recoveredKey =
        recovered?.idempotencyKey &&
        /^[a-f0-9-]{36}$/i.test(recovered.idempotencyKey)
          ? recovered.idempotencyKey
          : undefined;
      const key = (keys.current[product.productKey] ||=
        recoveredKey || crypto.randomUUID());
      try {
        localStorage.setItem(
          `edutu.checkout.${account}`,
          JSON.stringify({
            productKey: product.productKey,
            idempotencyKey: key,
          }),
        );
      } catch {
        /* keep the action key in memory */
      }
      const result = await createCheckout(
        token,
        {
          productKey: product.productKey,
          returnSurface: "web",
          idempotencyKey: key,
        },
        "consumer",
      );
      if (owner.current !== account) return;
      // Only reconciliation metadata is retained. The single-use code stays in memory.
      try {
        localStorage.setItem(
          `edutu.checkout.${account}`,
          JSON.stringify({
            productKey: product.productKey,
            idempotencyKey: key,
            intentId: result.intentId,
            expiresAt: result.expiresAt,
          }),
        );
      } catch {
        /* reconciliation also lives in the payment shell */
      }
      setCheckout({ ...result, productKey: product.productKey });
      delete keys.current[product.productKey];
    } catch (e) {
      if (owner.current === account) {
        setError(readableBillingError(e, "Checkout could not start."));
        setShowWalletLink(
          e instanceof Error &&
            (/pending checkout|payment and resume checkout/i.test(e.message) ||
              isNetworkFailure(e)),
        );
      }
    } finally {
      if (owner.current === account) setBusy(null);
    }
  }
  if (!isLoaded || loading)
    return (
      <div role="status" aria-live="polite" className="plan-picker-loading">
        <div className="plan-picker-loading-tabs" aria-hidden="true"><span /><span /><span /></div>
        <div className="plan-picker-loading-periods" aria-hidden="true">
          {[0, 1, 2].map((item) => <div key={item}><span /><span /><span /></div>)}
        </div>
        {docked && <div className="upgrade-docked-action"><button className="upgrade-docked-button" disabled>Loading plans…</button></div>}
        <p className="flex items-center justify-center gap-2 text-sm text-text-secondary">
          <Loader2 className="animate-spin" size={16} aria-hidden="true" /> Loading available plans…
        </p>
      </div>
    );
  const products =
    catalog?.products.filter(
      (p) =>
        p.productKey.startsWith(`${tier}_`) ||
        (tier === "pro" && p.productKey === "season_pass"),
    ) || [];
  const selectedProduct = products.find((p) => p.productKey === selectedProductKey) || products.find((p) => p.cadence === cadence) || products[0];
  const enabled = !!catalog?.checkoutEnabled && isBachsCheckoutEnabled();
  // Learner web checkout is settled against the Bachs billing catalog, whose
  // current plan rows are denominated in USD. The mobile-control feed still
  // serves legacy NGN display values for native/Paystack surfaces, so do not
  // let that display currency relabel these USD plan amounts.
  const configuredPricing = priceState.pricing
    ? { ...priceState.pricing, currency: "USD" }
    : null;
  const allowance = configuredPricing?.[tier === "lite" ? "liteFairUse" : tier === "pro" ? "proFairUse" : "scholarFairUse"];
  const tierSummary = {
    lite: "A focused starting point for occasional applications.",
    pro: "More room for regular coaching and application preparation.",
    scholar: "Our highest allowance for intensive scholarship and career work.",
  }[tier];
  return (
    <div className="plan-picker space-y-5">
      <p className="plan-picker-step">Plan</p>
      <div
        className="flex gap-1 rounded-xl border border-subtle bg-surface-layer p-1"
        aria-label="Choose a plan tier"
      >
        {(["lite", "pro", "scholar"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={tier === value}
            disabled={!!busy || !!checkout}
            onClick={() => setTier(value)}
            className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold capitalize ${tier === value ? "bg-brand text-white" : "text-text-secondary"}`}
          >
            {value}
          </button>
        ))}
      </div>
      <p className="text-sm text-text-secondary">
        {tierSummary}
      </p>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm"
        >
          <p>{error}</p>
          {showWalletLink && (
            <Link
              to="/app/wallet"
              className="mt-3 inline-block font-semibold text-brand"
            >
              Open wallet and check pending payments
            </Link>
          )}
          {!catalog && (
            <button
              className="mt-3 underline"
              onClick={() => void load(new AbortController().signal)}
            >
              Try again
            </button>
          )}
        </div>
      )}
      {!enabled && catalog && products.length > 0 && (
        <p role="status" className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-text-secondary">
          Checkout is being set up. These plans are not available to purchase yet.
        </p>
      )}
      {docked && products.length > 0 ? (
        <div className="plan-picker-periods" aria-label="Choose a billing period">
          {products.map((product) => (
            <button key={product.productKey} type="button" aria-pressed={product.productKey === selectedProduct?.productKey} disabled={!!busy || !!checkout} onClick={() => setSelectedProductKey(product.productKey)} className="plan-product-choice">
              <span className="plan-period-mark" aria-hidden="true">{product.productKey === selectedProduct?.productKey && <Check size={13} />}</span>
              {product.cadence === "monthly" || product.cadence === "yearly" ? <span className="plan-period-badge">{product.cadence === "yearly" ? (products.some((monthly) => monthly.cadence === "monthly" && monthly.currency === product.currency && product.amountMinor < monthly.amountMinor * 12) ? "Best value" : "Year-round") : "Hot"}</span> : null}
              <span className="plan-period-name capitalize">{product.cadence || title(product.productKey)}</span>
              <span className="plan-period-price">{price(product)}</span>
            </button>
          ))}
        </div>
      ) : <div
        className={`plan-picker-products grid gap-3 ${compact ? "sm:grid-cols-3" : "md:grid-cols-3"}`}
      >
        {products.map((product) => (
          <article
            key={product.productKey}
            className={`flex flex-col rounded-2xl border bg-surface-layer ${compact ? "p-4" : "p-6"} ${product.cadence === "monthly" ? "border-brand shadow-soft" : "border-subtle"}`}
          >
            <h3 className="text-sm font-semibold">
              {title(product.productKey).replace(/ Pass$/, " ")}
            </h3>
            <p
              className={`my-4 font-display font-semibold tracking-tight ${compact ? "text-xl" : "text-3xl"}`}
            >
              {price(product)}
            </p>
            <p className="mb-5 text-xs leading-relaxed text-text-muted">
              {product.renewalMode === "recurring"
                ? `Renews ${product.cadence || "automatically"}. Manage renewal from your wallet.`
                : `One payment${product.validityDays ? ` for ${product.validityDays} days of access` : ""}. No automatic renewal.`}
            </p>
            <ul className="mb-6 space-y-2 text-xs text-text-secondary">
              {[
                "Opportunity fit checks and next steps",
                "AI Coach and voice",
                "Copilot, plans and document tools",
              ].map((v) => (
                <li key={v} className="flex gap-2">
                  <Check size={14} className="shrink-0 text-brand" />
                  {v}
                </li>
              ))}
            </ul>
            <button
              className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-3 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!enabled || !!busy || !!checkout}
              onClick={() => void begin(product)}
            >
              {busy === product.productKey ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Starting…
                </>
              ) : (
                "Choose plan"
              )}
            </button>
          </article>
        ))}
      </div>}
      {!products.length && (catalog || !isSignedIn) && (
        <>
          {configuredPricing ? (
            <div className="plan-picker-period-section"><p className="plan-picker-step">Period</p>
            <div className="plan-picker-periods grid grid-cols-3 gap-2 sm:gap-3" aria-label="Choose a billing period">
              {(["weekly", "monthly", "yearly"] as const).map((period) => {
                const selected = cadence === period;
                const amount = effectivePrice(configuredPricing, period, tier, { applyPromo: false });
                return (
                  <button
                    key={period}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCadence(period)}
                    className={`relative flex min-h-[104px] flex-col items-start justify-center rounded-2xl border p-3 text-left transition ${selected ? "border-brand bg-brand/10 ring-1 ring-brand/30" : "border-subtle bg-surface-layer hover:border-brand/40"}`}
                  >
                    <span className="plan-period-mark" aria-hidden="true">{selected && <Check size={13} />}</span>
                    {period !== "weekly" ? <span className="plan-period-badge">{period === "yearly" ? (amount < effectivePrice(configuredPricing, "monthly", tier, { applyPromo: false }) * 12 ? "Best value" : "Year-round") : "Hot"}</span> : null}
                    <span className="plan-period-name text-text-primary">{period === "weekly" ? "Weekly" : period === "monthly" ? "Monthly" : "Yearly"}</span>
                    <span className="plan-period-price text-text-primary">{formatMoney(amount, configuredPricing.currency)}<span className="plan-period-unit text-text-muted"> / {period === "yearly" ? "year" : period === "weekly" ? "week" : "month"}</span></span>
                  </button>
                );
              })}
            </div></div>
          ) : priceState.loading ? (
            <p role="status" className="rounded-xl border border-subtle p-4 text-center text-sm text-text-muted">Loading your plan prices…</p>
          ) : (
            <div role="status" className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.035] px-5 py-6 text-center">
              <PlanAvailabilityIllustration />
              <h3 className="text-sm font-semibold text-text-primary">Plan prices aren’t available right now</h3>
              <p className="mt-1.5 max-w-sm text-xs leading-5 text-text-muted">Please check again in a moment.</p>
            </div>
          )}
          {!docked && <div role="status" className="plan-picker-availability flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.035] px-5 py-4 text-center sm:flex-row sm:justify-between sm:text-left">
            <p className="text-xs leading-5 text-text-muted">
              {!isSignedIn
                ? "Sign in to check checkout availability and continue securely."
                : catalog?.checkoutEnabled
                  ? "There are no active products for this tier yet."
                  : "Checkout is not available yet."}
            </p>
            {!docked && (!isSignedIn ? (
              <Link
                className="mt-3 inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white sm:mt-0"
                to="/auth?mode=sign-in&redirect=%2Fupgrade"
              >
                Sign in <ArrowRight size={16} />
              </Link>
            ) : (
              <button
                className="mt-3 inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-subtle px-4 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated sm:mt-0"
                onClick={() => void load(new AbortController().signal)}
              >
                Check again
              </button>
            ))}
          </div>}
        </>
      )}
      <section className="plan-benefits" aria-label={`${tier} plan benefits`}>
        <div className="plan-benefits-heading">
          <h3 className="capitalize">{tier} daily allowance</h3>
          <span className="plan-benefits-tag">{tier === "lite" ? "Start here" : tier === "pro" ? "Hot" : "Maximum access"}</span>
        </div>
        <ul>
          {(allowance ? [
            `${allowance.dailyChatMessages.toLocaleString()} AI Coach messages per day`,
            `${allowance.dailyVoiceMinutes.toLocaleString()} voice minutes per day`,
            `${allowance.dailyActionCredits.toLocaleString()} AI preparation credits per day`,
          ] : [tierSummary]).map((benefit) => <li key={benefit}><Check size={15} aria-hidden="true" /><span>{benefit}</span></li>)}
        </ul>
        <p className="plan-benefits-shared">All tiers include fit insights, AI Coach, Copilot, plans and document tools. Preparation credits are shared across AI actions; each tool uses a different amount.</p>
      </section>
      {checkout && (
        <div
          className="rounded-2xl border border-brand bg-brand/5 p-5"
          role="status"
        >
          <h3 className="font-semibold">Your checkout is ready</h3>
          <p className="mt-2 text-sm text-text-secondary">
            {checkout.renewalMode === "recurring"
              ? "This plan renews automatically. Review the renewal terms before paying."
              : "This is a one-time purchase. It will not renew automatically."}{" "}
            Access is added after payment is confirmed by the server.
          </p>
          <button
            className={docked ? "upgrade-docked-button" : "mt-4 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white"}
            onClick={() => {
              if (
                checkout.handoffExpiresAt &&
                Date.parse(checkout.handoffExpiresAt) <= Date.now()
              ) {
                setCheckout(null);
                setError(
                  "The secure link expired. Open your wallet to check this pending payment and resume checkout.",
                );
                return;
              }
              window.location.assign(checkout.checkoutUrl);
            }}
          >
            Continue to secure checkout{" "}
            <ArrowRight size={16} className="ml-2 inline" />
          </button>
          <Link to="/app/wallet" className="ml-4 text-sm text-brand">
            Check payment status
          </Link>
        </div>
      )}
      {docked && !checkout && (
        <div className="upgrade-docked-action">
          <p>{enabled && selectedProduct ? `${tier.charAt(0).toUpperCase() + tier.slice(1)} · ${price(selectedProduct)} · ${selectedProduct.cadence || "One-time access"}` : "Prices in USD · Access after confirmed payment"}</p>
          {!isSignedIn ? <Link className="upgrade-docked-button" to="/auth?mode=sign-in&redirect=%2Fupgrade">Sign in to continue <ArrowRight size={17} /></Link> : (
            <button className="upgrade-docked-button" disabled={!!busy || loading || (!!catalog && (!enabled || !selectedProduct))} onClick={() => {
              const selected = selectedProduct;
              if (enabled && selected) void begin(selected);
              else void load(new AbortController().signal);
            }}>{busy ? "Starting…" : loading ? "Loading checkout…" : enabled && selectedProduct ? "Continue to checkout" : catalog ? "Checkout unavailable" : "Try again"}<ArrowRight size={17} /></button>
          )}
        </div>
      )}
      <p className="text-xs leading-relaxed text-text-muted">
        Browsing and searching opportunities, including archived listings, stays
        free. Paid AI usage has plan limits.
      </p>
    </div>
  );
}
