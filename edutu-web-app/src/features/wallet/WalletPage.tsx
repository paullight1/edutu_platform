import { WorkspaceText } from "../workspace/shared";
import { useSearchParams } from "react-router-dom";
import AccessSummary from "../feature-access/AccessSummary";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  FeaturePage,
  FeatureError,
  Loading,
  errorMessage,
  useProductSession,
} from "../workspace/shared";
import {
  createCheckout,
  validateBachsPortalUrl,
  checkoutUnavailableMessage,
  type BillingStatus,
} from "../../services/billing";
import { usePaywall } from "../../hooks/usePaywall";
interface Product {
  productKey: string;
  amountMinor: number;
  currency: string;
  creditQuantity: number | null;
  renewalMode: string;
  cadence: string | null;
  validityDays: number | null;
  fulfillmentKind: string;
}
interface Pending {
  productKey: string;
  idempotencyKey: string;
  intentId?: string;
  checkoutUrl?: string;
  expiresAt?: string;
}
interface Intent {
  intentId: string;
  productKey: string;
  status: string;
  fulfilled: boolean;
  expiresAt: string | null;
}
const INTENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const label = (key: string) =>
  key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const planLabel = (key: string) =>
  label(key).replace(/ Pass$/, "");
const cadenceLabel = (cadence: string | null) =>
  cadence === "weekly" ? "week" : cadence === "monthly" ? "month" : cadence === "yearly" ? "year" : null;
const friendlyStatus = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
export function displayPrice(amountMinor: number, currency: string) {
  const digits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(amountMinor / 10 ** digits);
}
export default function WalletPage() {
  const { request, token, userId } = useProductSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const { refreshBilling } = usePaywall();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [checkoutUnavailableReason, setCheckoutUnavailableReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [returnedIntentId, setReturnedIntentId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const storageKey = `edutu.checkout.${userId}`;
  const persist = useCallback(
    (next: Pending | null) => {
      setPending(next);
      try {
        if (next) localStorage.setItem(storageKey, JSON.stringify({productKey: next.productKey, idempotencyKey: next.idempotencyKey, intentId: next.intentId, expiresAt: next.expiresAt}));
        else localStorage.removeItem(storageKey);
      } catch {
        /* storage can be disabled */
      }
    },
    [storageKey],
  );
  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [statusResult, catalogResult] = await Promise.allSettled([
        request<BillingStatus>("/billing/status"),
        request<{ products: Product[]; checkoutEnabled: boolean; checkoutUnavailableReason?: string | null }>(
          "/billing/user-catalog",
        ),
      ]);
      if (statusResult.status === "fulfilled") {
        setStatus(statusResult.value);
      } else {
        setStatus(null);
      }
      if (catalogResult.status === "fulfilled") {
        setProducts(catalogResult.value.products);
        setEnabled(catalogResult.value.checkoutEnabled);
        setCheckoutUnavailableReason(catalogResult.value.checkoutUnavailableReason ?? null);
      } else {
        setProducts([]);
        setEnabled(false);
        setCheckoutUnavailableReason(null);
      }
      if (statusResult.status === "rejected" || catalogResult.status === "rejected") {
        const failure = statusResult.status === "rejected"
          ? statusResult.reason
          : catalogResult.status === "rejected" ? catalogResult.reason : null;
        setError(
          `Some payment details couldn't load. ${errorMessage(failure)} You can try refreshing.`,
        );
      }
      window.dispatchEvent(new Event("edutu:ai-complete"));
      void refreshBilling();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [request, refreshBilling]);
  const verify = useCallback(
    async (intentId: string) => {
      if (!INTENT_ID.test(intentId)) return;
      try {
        const value = await request<Intent>(`/billing/intents/${intentId}`);
        if (value.intentId !== intentId) return;
        setIntent(value);
        setPending((current) => current ?? {
          productKey: value.productKey,
          idempotencyKey: "",
          intentId: value.intentId,
          expiresAt: value.expiresAt ?? undefined,
        });
        if (value.fulfilled) {
          setReturnedIntentId(null);
          persist(null);
          setNotice("Payment confirmed and access applied.");
          await refresh();
        } else if (["failed", "cancelled", "canceled", "expired"].includes(value.status)) {
          setReturnedIntentId(null);
          // A terminal provider result can no longer be resumed. Keeping it in
          // local storage makes PlanPicker reject every later checkout, so
          // clear only this local recovery reminder after server verification.
          persist(null);
          setNotice(`Bachs reports this checkout as ${friendlyStatus(value.status)}. No access or credits were applied.`);
        } else {
          setNotice("Payment is still processing. Don’t pay again; Edutu will apply access after Bachs confirms it.");
        }
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [request, persist, refresh],
  );
  useEffect(() => {
    setStatus(null);
    setProducts([]);
    setPending(null);
    setIntent(null);
    setLoading(true);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const p = JSON.parse(raw) as Pending;
        if (
          typeof p.productKey === "string" &&
          typeof p.idempotencyKey === "string"
        ) {
          setPending(p);
          if (typeof p.intentId === "string") void verify(p.intentId);
        }
      }
    } catch {
      /* Ignore malformed client recovery metadata */
    }
    void refresh();
  }, [userId, storageKey, verify, refresh]);
  useEffect(() => {
    if (!pending?.intentId) return;
    let checks = 0;
    const timer = setInterval(() => {
      if (++checks > 12) {
        clearInterval(timer);
        return;
      }
      if (document.visibilityState === "visible") void verify(pending.intentId!);
    }, 5000);
    const focus = () => {
      void verify(pending.intentId!);
    };
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [pending, verify]);
  useEffect(() => {
    const intentId = searchParams.get("intentId");
    const returnState = searchParams.get("checkout");
    if (loading) return;
    if (!intentId && !returnState) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("checkout");
    nextParams.delete("intentId");
    setSearchParams(nextParams, { replace: true });
    if (!intentId || !INTENT_ID.test(intentId)) {
      setNotice("We could not verify that checkout reference. Refresh your wallet to check your purchases.");
      return;
    }
    setNotice(returnState === "cancelled"
      ? "Checkout was closed. No access or credits are applied until Bachs confirms payment."
      : "Checking your payment with Edutu. Access is applied only after Bachs confirms it.");
    setReturnedIntentId(intentId);
    void verify(intentId);
  }, [loading, searchParams, setSearchParams, verify]);
  const returnIntentId = pending?.intentId ? null : returnedIntentId;
  useEffect(() => {
    if (!returnIntentId) return;
    let checks = 0;
    const timer = window.setInterval(() => {
      if (++checks > 12) {
        window.clearInterval(timer);
        return;
      }
      if (document.visibilityState === "visible") void verify(returnIntentId);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [returnIntentId, verify]);
  const manage = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await request<{ url: string }>("/billing/portal-session", {
        method: "POST",
      });
      window.location.assign(validateBachsPortalUrl(result.url));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const buy = async (product: Product) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    let action = pending;
    if (action && action.productKey !== product.productKey) {
      setError(
        "Resolve or clear your pending checkout before starting another.",
      );
      setBusy(false);
      return;
    }
    if (!action) {
      action = {
        productKey: product.productKey,
        idempotencyKey: crypto.randomUUID(),
      };
      persist(action);
    }
    try {
      const result = await createCheckout(
        await token(),
        {
          productKey: action.productKey,
          idempotencyKey: action.idempotencyKey,
          returnSurface: "web",
        },
        "consumer",
      );
      const next = { ...action, intentId: result.intentId, expiresAt: result.expiresAt };
      persist(next);
      window.location.assign(result.checkoutUrl);
    } catch (e) {
      setError(
        `${errorMessage(e)} Retry this purchase to reuse the same checkout request.`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
      <FeaturePage
      eyebrow="accountAccess"
      title="walletTitle"
      description="walletDescription"
      actions={
        <button
          className="feature-button secondary"
          type="button"
          disabled={busy || loading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh status
        </button>
      }
    >
      <AccessSummary action="cvAi" />
      <FeatureError error={error} onRetry={() => void refresh()} />
      {notice && (
        <p className="feature-notice" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="feature-grid">
            <section className="feature-panel relative overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="feature-eyebrow"><Sparkles size={13} aria-hidden="true" className="mr-1" /> Your plan</p>
                {status && <span className="inline-flex items-center gap-1 rounded-full border border-brand/20 bg-brand/5 px-2.5 py-1 text-xs font-semibold text-brand">
                  {status.planTier === "none" ? "Free access" : <><CheckCircle2 size={13} aria-hidden="true" /> {friendlyStatus(status.subscriptionStatus || "active")}</>}
                </span>}
              </div>
              <h2 className="mt-3 !mb-2 text-3xl">{status ? `${label(status.planTier === "none" ? "free" : status.planTier)} plan` : "Access unavailable"}</h2>
              <p className="feature-muted">
                {status?.proExpiresAt && Number.isFinite(Date.parse(status.proExpiresAt))
                  ? `Current access through ${new Date(status.proExpiresAt).toLocaleDateString(undefined, { dateStyle: "medium" })}.`
                  : status?.planTier === "none"
                    ? "Discover opportunities for free. Upgrade for more application preparation."
                    : "Your access is checked with Edutu's billing service."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {status?.entitlements.map((e) => (
                  <span className="feature-badge" key={e}>{label(e)}</span>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link to="/upgrade" className="feature-button">
                  {status?.planTier === "none" ? "Explore plans" : "Compare plans"}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
                {status?.planTier !== "none" && <button
                  type="button"
                  className="feature-button secondary"
                  disabled={busy || !enabled}
                  onClick={() => void manage()}
                >
                  Manage web billing
                </button>}
              </div>
              <p className="feature-muted mt-4">
                Purchased through an app store? Manage renewal in{" "}
                <a className="font-semibold text-brand underline-offset-2 hover:underline" href="https://apps.apple.com/account/subscriptions" target="_blank" rel="noopener noreferrer">Apple Subscriptions</a>
                {" "}or{" "}
                <a className="font-semibold text-brand underline-offset-2 hover:underline" href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noopener noreferrer">Google Play</a>.
              </p>
            </section>
            <section className="feature-panel">
              <p className="feature-eyebrow"><CreditCard size={13} className="mr-1" aria-hidden="true" /> Credit balance</p>
              <h2 className="mt-3 !mb-2 text-3xl tabular-nums">{status?.credits?.toLocaleString() ?? "—"}</h2>
              <p className="text-sm font-semibold">Available account credits</p>
              <p className="feature-muted mt-2">
                Your daily plan allowance is tracked separately. Buying credits does not reset a daily plan limit.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link className="feature-button secondary" to="/app/coach">Open AI Coach <ArrowRight size={15} aria-hidden="true" /></Link>
              </div>
              <div className="mt-5 flex items-start gap-2 border-t border-subtle pt-4 text-xs text-text-muted">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                Usage and available access are verified before each AI action.
              </div>
            </section>
          </div>
          {pending && (
            <section className="feature-panel mt-6 border-brand/30" aria-label="Pending payment">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Clock3 size={20} aria-hidden="true" /></span>
                <div>
                  <h2 className="!mb-1">{intent?.fulfilled ? "Payment confirmed" : pending.intentId ? "Payment status" : "Checkout saved"}</h2>
                  <p className="text-sm font-medium">{planLabel(pending.productKey)}</p>
                  <p role="status" className="feature-muted mt-1">
                    {intent
                      ? `Provider status: ${friendlyStatus(intent.status)}`
                      : pending.intentId
                        ? "Waiting for the payment provider to report the result."
                        : "Checkout hasn't been confirmed as started. Retry the same purchase to continue."}
                  </p>
                  <p className="feature-muted mt-2">Leaving checkout or returning to Edutu does not confirm a payment. We'll update access after server verification.</p>
                </div>
              </div>
              <div className="feature-actions mt-4">
                <button
                  className="feature-button"
                  type="button"
                  disabled={busy || !pending.intentId}
                  onClick={() => void verify(pending.intentId!)}
                >
                  Check payment status
                </button>
                <button
                  className="feature-button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Clear the local checkout reminder? This does not cancel a payment or provider checkout.",
                      )
                    ) {
                      persist(null);
                      setIntent(null);
                    }
                  }}
                >
                  Clear reminder
                </button>
              </div>
            </section>
          )}
          <section className="mt-8" aria-labelledby="wallet-plans-title">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="feature-eyebrow">Your options</p>
                <h2 id="wallet-plans-title" className="text-xl font-semibold tracking-tight">Plans and passes</h2>
                <p className="feature-muted mt-1">Prices and renewal terms come from Edutu's live billing catalog.</p>
              </div>
              <Link className="feature-button secondary" to="/upgrade">Compare plan benefits <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
            {checkoutUnavailableMessage({ checkoutEnabled: enabled, checkoutUnavailableReason }) && (
              <p className="feature-notice" role="status">
                {checkoutUnavailableMessage({ checkoutEnabled: enabled, checkoutUnavailableReason })}
              </p>
            )}
            {!products.length ? (
              <div className="feature-panel">
                <WorkspaceText value="noPurchaseOptionsAreEnabledForThisEnvironment" />
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {products.map((p) => (
                  <article key={p.productKey} className="feature-panel flex flex-col">
                    <p className="feature-eyebrow">{p.fulfillmentKind === "credits" ? "Credit top-up" : "Plan access"}</p>
                    <h3 className="mt-1 text-base font-semibold tracking-tight">{planLabel(p.productKey)}</h3>
                    <div className="mt-4 flex flex-wrap items-baseline gap-2">
                      <strong className="text-3xl font-semibold tracking-tight tabular-nums">{displayPrice(p.amountMinor, p.currency)}</strong>
                      {p.renewalMode === "recurring" && cadenceLabel(p.cadence) && <span className="feature-muted">/ {cadenceLabel(p.cadence)}</span>}
                    </div>
                    <p className="feature-muted mt-2">
                      {p.creditQuantity
                        ? `${p.creditQuantity.toLocaleString()} credits added after payment confirmation`
                        : p.validityDays
                          ? `${p.validityDays} days of access`
                          : p.cadence ? `${friendlyStatus(p.cadence)} access` : "Access details shown at checkout"}
                    </p>
                    <p className="feature-muted mt-3 border-t border-subtle pt-3">
                      {p.renewalMode === "recurring"
                        ? `Renews ${p.cadence || "automatically"}. Manage or cancel through the billing provider.`
                        : "One-time payment. No automatic renewal."}
                    </p>
                    <button
                      className="feature-button mt-auto !mt-5 w-full"
                      type="button"
                      disabled={busy || !enabled}
                      onClick={() => void buy(p)}
                    >
                      {pending?.productKey === p.productKey
                        ? "Resume checkout"
                        : "Choose this plan"}
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="feature-panel mt-8" aria-labelledby="wallet-payment-history">
            <div className="mb-5 flex items-center gap-2">
              <Receipt className="text-brand" size={19} aria-hidden="true" />
              <h2 id="wallet-payment-history" className="!mb-0">Recent payments</h2>
            </div>
            {!status?.transactions?.length ? (
              <p className="feature-muted rounded-xl border border-dashed border-subtle px-4 py-6 text-center">No payment activity to show yet. Your recent payments will appear here.</p>
            ) : (
              status.transactions.map((tx) => (
                <article key={tx.id} className="feature-list-row">
                  <div>
                    <strong>{tx.description || label(tx.type)}</strong>
                    <p className="feature-muted">
                      {friendlyStatus(tx.provider)} · {friendlyStatus(tx.status)} ·{" "}
                      {tx.createdAt
                        ? new Date(tx.createdAt).toLocaleDateString()
                        : ""}
                    </p>
                  </div>
                  <span>
                    {new Intl.NumberFormat(undefined, {
                      style: "currency",
                      currency: tx.currency,
                    }).format(tx.amount)}
                  </span>
                </article>
              ))
            )}
          </section>
        </>
      )}
    </FeaturePage>
  );
}
