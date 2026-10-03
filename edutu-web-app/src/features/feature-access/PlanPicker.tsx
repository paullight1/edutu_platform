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
export default function PlanPicker({
  active = true,
  compact = false,
}: {
  active?: boolean;
  compact?: boolean;
}) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState("pro");
  const [busy, setBusy] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<
    (CheckoutResponse & { productKey: string }) | null
  >(null);
  const keys = useRef<Record<string, string>>({});
  const owner = useRef(userId);
  owner.current = userId;
  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
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
        if (!signal.aborted)
          setError(
            e instanceof Error ? e.message : "Plans are unavailable right now.",
          );
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
      if (owner.current === account)
        setError(e instanceof Error ? e.message : "Checkout could not start.");
    } finally {
      if (owner.current === account) setBusy(null);
    }
  }
  if (!isLoaded || loading)
    return (
      <p
        role="status"
        className="flex items-center justify-center gap-2 p-6 text-sm"
      >
        <Loader2 className="animate-spin" size={18} /> Loading available plans…
      </p>
    );
  if (!isSignedIn)
    return (
      <div className="rounded-2xl border border-subtle p-6 text-center">
        <p className="mb-4 text-sm text-text-secondary">
          Sign in to see the plans available for your account.
        </p>
        <Link
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white"
          to="/auth?mode=sign-in&redirect=%2Fupgrade"
        >
          Sign in <ArrowRight size={16} />
        </Link>
      </div>
    );
  const products =
    catalog?.products.filter(
      (p) =>
        p.productKey.startsWith(`${tier}_`) ||
        (tier === "pro" && p.productKey === "season_pass"),
    ) || [];
  const enabled = !!catalog?.checkoutEnabled && isBachsCheckoutEnabled();
  return (
    <div className="space-y-5">
      <div
        className="flex gap-1 rounded-xl border border-subtle bg-surface-layer p-1"
        aria-label="Choose a plan tier"
      >
        {["lite", "pro", "scholar"].map((value) => (
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
        All paid tiers unlock preparation tools. Choose the AI and voice
        allowance that fits your workload; your wallet shows your current
        limits.
      </p>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm"
        >
          <p>{error}</p>
          <Link
            to="/app/wallet"
            className="mt-3 inline-block font-semibold text-brand"
          >
            Open wallet and check pending payments
          </Link>
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
      {!enabled && catalog && (
        <p
          role="status"
          className="rounded-xl bg-surface-layer p-4 text-sm text-text-secondary"
        >
          Payments are not available yet. You can explore the plans while
          checkout is being set up.
        </p>
      )}
      <div
        className={`grid gap-3 ${compact ? "sm:grid-cols-3" : "md:grid-cols-3"}`}
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
      </div>
      {catalog && !products.length && (
        <p className="rounded-xl border border-subtle p-5 text-sm text-text-muted">
          This tier has no purchasable plans right now. Try another tier.
        </p>
      )}
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
            className="mt-4 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white"
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
      <p className="text-xs leading-relaxed text-text-muted">
        Browsing and searching opportunities, including archived listings, stays
        free. Paid AI usage has plan limits.
      </p>
    </div>
  );
}
