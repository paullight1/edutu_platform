import { WorkspaceText } from "../workspace/shared";
import AccessSummary from "../feature-access/AccessSummary";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FeaturePage,
  FeatureError,
  Loading,
  errorMessage,
  useProductSession,
} from "../workspace/shared";
import {
  createCheckout,
  validatePaymentHandoffUrl,
  isBachsCheckoutEnabled,
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
  status: string;
  fulfilled: boolean;
  expiresAt: string | null;
}
const label = (key: string) =>
  key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
  const { refreshBilling } = usePaywall();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
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
      const [s, c] = await Promise.all([
        request<BillingStatus>("/billing/status"),
        request<{ products: Product[]; checkoutEnabled: boolean }>(
          "/billing/user-catalog",
        ),
      ]);
      setStatus(s);
      setProducts(c.products);
      setEnabled(c.checkoutEnabled);
      window.dispatchEvent(new Event("edutu:ai-complete"));
      void refreshBilling();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [request, refreshBilling]);
  const verify = useCallback(
    async (p: Pending) => {
      if (!p.intentId) return;
      try {
        const value = await request<Intent>(`/billing/intents/${p.intentId}`);
        setIntent(value);
        if (value.fulfilled) {
          persist(null);
          setNotice("Payment confirmed and access applied.");
          await refresh();
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
          void verify(p);
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
      if (document.visibilityState === "visible") void verify(pending);
    }, 5000);
    const focus = () => {
      void verify(pending);
    };
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [pending, verify]);
  const manage = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await request<{ url: string }>("/billing/pay-shell/handoff", {
        method: "POST", body: JSON.stringify({destination: "account"}),
      });
      window.location.assign(validatePaymentHandoffUrl(result.url));
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
      eyebrow="Account and access"
      title="Wallet & payments"
      description="Review your active plan, AI credits, and payment history."
      actions={
        <button
          className="feature-button secondary"
          onClick={() => void refresh()}
        >
          <WorkspaceText value="refreshAccess" />
        </button>
      }
    >
      <AccessSummary action="cvAi" />{" "}
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
            <section className="feature-panel">
              <p className="feature-eyebrow">
                <WorkspaceText value="currentAccess" />
              </p>
              <h2>
                {status
                  ? label(status.planTier === "none" ? "free" : status.planTier)
                  : "Access unavailable"}
              </h2>
              <p className="feature-muted">
                {status?.proExpiresAt
                  ? `Access until ${new Date(status.proExpiresAt).toLocaleString()}`
                  : "Access details are confirmed by the server."}
              </p>
              <p>{status?.subscriptionStatus || ""}</p>
              {status?.entitlements.map((e) => (
                <span className="feature-tag" key={e}>
                  {label(e)}
                </span>
              ))}
              <button
                className="feature-button secondary mt-4"
                disabled={busy || !enabled}
                onClick={() => void manage()}
              >
                <WorkspaceText value="manageWebBilling" />
              </button>
              <p className="feature-muted mt-4">
                <WorkspaceText value="manageAppStoreOrPlayStoreSubscriptionsThroughThe" />
              </p>
              <a
                href="https://apps.apple.com/account/subscriptions"
                target="_blank"
                rel="noopener noreferrer"
              >
                <WorkspaceText value="appleSubscriptions" />
              </a>{" "}
              ·{" "}
              <a
                href="https://play.google.com/store/account/subscriptions"
                target="_blank"
                rel="noopener noreferrer"
              >
                <WorkspaceText value="googlePlaySubscriptions" />
              </a>
            </section>
            <section className="feature-panel">
              <p className="feature-eyebrow">
                <WorkspaceText value="aiCreditBalance" />
              </p>
              <h2>{status?.credits ?? "—"}</h2>
              <p className="feature-muted">
                <WorkspaceText value="creditsPlanAllowancesAndDailyLimitsAreSeparateBuying" />
              </p>
              <Link to="/app/coach">
                <WorkspaceText value="openAICoach" />
              </Link>
              <p className="feature-muted mt-4">
                <WorkspaceText value="theServerChecksYourAllowanceBeforeEachAIAction" />
              </p>
            </section>
          </div>
          {pending && (
            <section className="feature-panel mt-6">
              <h2>
                {intent?.fulfilled
                  ? "Payment confirmed"
                  : "Checkout awaiting confirmation"}
              </h2>
              <p role="status">
                {intent
                  ? `Server status: ${label(intent.status)}`
                  : "Your checkout request is saved so a retry can reuse it."}
              </p>
              <p className="feature-muted">
                <WorkspaceText value="aSuccessfulRedirectDoesNotProvePaymentOrFulfillment" />
              </p>
              <div className="feature-actions">
                <button
                  className="feature-button"
                  disabled={busy}
                  onClick={() => void verify(pending)}
                >
                  <WorkspaceText value="checkPayment" />
                </button>
                <button
                  className="feature-button secondary"
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
                  <WorkspaceText value="clearReminder" />
                </button>
              </div>
            </section>
          )}
          <section className="mt-8">
            <h2>
              <WorkspaceText value="availablePlansAndCredits" />
            </h2>
            <p className="feature-muted">
              <WorkspaceText value="pricesAndAccessDurationsComeFromTheConfiguredCatalog" />
            </p>
            {(!enabled || !isBachsCheckoutEnabled()) && (
              <p className="feature-notice">
                <WorkspaceText value="onlineCheckoutIsCurrentlyUnavailable" />
              </p>
            )}
            {!products.length ? (
              <div className="feature-panel">
                <WorkspaceText value="noPurchaseOptionsAreEnabledForThisEnvironment" />
              </div>
            ) : (
              <div className="feature-grid">
                {products.map((p) => (
                  <article key={p.productKey} className="feature-panel">
                    <p className="feature-eyebrow">
                      {p.fulfillmentKind === "credits"
                        ? "AI credits"
                        : "Plan access"}
                    </p>
                    <h3>{label(p.productKey)}</h3>
                    <h2>{displayPrice(p.amountMinor, p.currency)}</h2>
                    <p>
                      {p.creditQuantity
                        ? `${p.creditQuantity} credits`
                        : p.validityDays
                          ? `${p.validityDays} days of access`
                          : p.cadence || "Configured plan access"}
                    </p>
                    <p className="feature-muted">
                      {p.renewalMode === "recurring"
                        ? `Renews ${p.cadence || "on the configured billing cycle"}`
                        : "One-time purchase · no automatic renewal"}
                    </p>
                    <button
                      className="feature-button mt-4"
                      disabled={busy || !enabled || !isBachsCheckoutEnabled()}
                      onClick={() => void buy(p)}
                    >
                      {pending?.productKey === p.productKey
                        ? "Retry / continue checkout"
                        : "Continue to checkout"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="feature-panel mt-8">
            <h2>
              <WorkspaceText value="paymentHistory" />
            </h2>
            {!status?.transactions.length ? (
              <p className="feature-muted">
                <WorkspaceText value="noTransactionsToDisplay" />
              </p>
            ) : (
              status.transactions.map((tx) => (
                <article key={tx.id} className="feature-list-row">
                  <div>
                    <strong>{tx.description || label(tx.type)}</strong>
                    <p className="feature-muted">
                      {label(tx.provider)} · {label(tx.status)} ·{" "}
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
