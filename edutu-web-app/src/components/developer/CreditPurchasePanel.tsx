import { CreditCard, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { CheckoutResponse, CreditProduct } from '../../services/billing';
import { formatMoney } from '../../lib/proPricing';

export interface CreditPurchasePanelProps {
  balance: number | null;
  products: CreditProduct[];
  productsLoading: boolean;
  productsError: string | null;
  checkoutEnabled: boolean;
  checkoutLoadingProductKey: string | null;
  checkoutToConfirm: CheckoutResponse | null;
  checkoutError: { code: string | null; message: string } | null;
  hasPendingPayment: boolean;
  paymentState: 'idle' | 'pending' | 'confirmed';
  onPurchase: (productKey: string) => void;
  onContinueToCheckout: () => void;
  onRefreshBilling: () => void;
  onRetryProducts: () => void;
}

function checkoutErrorCopy(error: CreditPurchasePanelProps['checkoutError']) {
  if (!error) return null;
  switch (error.code) {
    case 'billing_unavailable':
      return {
        title: 'Checkout is temporarily unavailable.',
        body: 'Try again later. No payment was started and no credits were added.',
      };
    case 'payment_pending':
      return {
        title: 'Payment is still processing.',
        body: 'We will show your credits after the payment provider confirms the purchase. Check your balance again shortly.',
      };
    case 'credits_exhausted':
      return {
        title: 'This API call needs credits.',
        body: 'Choose a one-time top-up below. Your project and API key remain available at zero credits.',
      };
    default:
      return {
        title: error.message,
        body: 'No credits were added. You can retry when you are ready.',
      };
  }
}

export default function CreditPurchasePanel({
  balance,
  products,
  productsLoading,
  productsError,
  checkoutEnabled,
  checkoutLoadingProductKey,
  checkoutToConfirm,
  checkoutError,
  hasPendingPayment,
  paymentState,
  onPurchase,
  onContinueToCheckout,
  onRefreshBilling,
  onRetryProducts,
}: CreditPurchasePanelProps) {
  const errorCopy = checkoutErrorCopy(checkoutError);

  return (
    <section
      id="credit-top-ups"
      aria-labelledby="credit-top-ups-title"
      className="rounded-3xl border border-brand/25 bg-brand/5 p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-brand">
            <CreditCard size={15} aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-[0.22em]">API credits</span>
          </div>
          <h2 id="credit-top-ups-title" className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-text-primary">
            {balance === null
              ? 'API credit balance unavailable'
              : balance === 0
                ? 'You have 0 API credits'
                : `${balance.toLocaleString()} API credits available`}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">
            One-time purchase. Credits never expire. Free health, usage, and category calls do not consume credits;
            chargeable API calls cost one credit.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-white px-3 py-2 text-xs font-semibold text-brand">
          <ShieldCheck size={14} aria-hidden="true" />
          Server-verified balance
        </div>
      </div>

      {paymentState === 'confirmed' ? (
        <div className="mt-5 rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-text-primary" role="status">
          <p className="font-semibold">Payment confirmed</p>
          <p className="mt-1 leading-6 text-text-muted">
            Your API credit balance has been refreshed from the verified billing status.
          </p>
        </div>
      ) : paymentState === 'pending' || hasPendingPayment ? (
        <div className="mt-5 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-text-primary" role="status">
          <p className="font-semibold">Waiting for payment confirmation</p>
          <p className="mt-1 leading-6 text-text-muted">
            Credits appear only after provider verification. Keep this dashboard open and check your balance again after returning from secure checkout.
          </p>
          <button
            type="button"
            onClick={onRefreshBilling}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-warning/30 bg-white px-4 py-2 text-sm font-semibold text-text-primary"
          >
            <RefreshCw size={14} aria-hidden="true" />
            Check balance again
          </button>
        </div>
      ) : null}

      {errorCopy ? (
        <div className="mt-5 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
          <p className="font-semibold">{errorCopy.title}</p>
          <p className="mt-1 leading-6">{errorCopy.body}</p>
        </div>
      ) : null}

      {checkoutToConfirm ? (
        <div className="mt-5 rounded-2xl border border-brand/30 bg-white p-4" aria-live="polite">
          <p className="text-sm font-semibold text-text-primary">Secure checkout is ready</p>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Continue to the approved Bachs result flow. Your balance updates after payment verification.
          </p>
          <button
            type="button"
            onClick={onContinueToCheckout}
            className="mt-3 inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
          >
            Continue to secure checkout
          </button>
        </div>
      ) : null}

      <div className="mt-6">
        {productsLoading ? (
          <div className="grid gap-3 sm:grid-cols-3" aria-label="Loading credit packs">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-36 animate-pulse rounded-2xl border border-subtle bg-white" />
            ))}
          </div>
        ) : productsError ? (
          <div className="rounded-2xl border border-subtle bg-white p-4">
            <p className="text-sm font-semibold text-text-primary">Credit packs are temporarily unavailable.</p>
            <p className="mt-1 text-sm leading-6 text-text-muted">{productsError}</p>
            <button
              type="button"
              onClick={onRetryProducts}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-subtle px-4 py-2 text-sm font-semibold text-text-primary"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : products.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => {
              const isLoading = checkoutLoadingProductKey === product.productKey;
              return (
                <div key={product.productKey} className="rounded-2xl border border-subtle bg-white p-4">
                  <p className="text-lg font-semibold text-text-primary">
                    {product.label || `${product.creditQuantity.toLocaleString()}-credit pack`}
                  </p>
                  <p className="mt-2 text-sm text-text-muted">
                    {product.creditQuantity.toLocaleString()} credits · {formatMoney(product.price, product.currency)}
                  </p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                    Never expires
                  </p>
                  <button
                    type="button"
                    disabled={!checkoutEnabled || checkoutLoadingProductKey !== null || checkoutToConfirm !== null}
                    onClick={() => onPurchase(product.productKey)}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
                    {isLoading ? 'Starting checkout…' : `Buy ${product.creditQuantity.toLocaleString()} credits`}
                  </button>
                  {!checkoutEnabled ? (
                    <p className="mt-2 text-center text-xs text-text-muted">Checkout is not available yet.</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-subtle bg-white px-4 py-5 text-sm text-text-muted">
            No credit packs are currently configured.
          </div>
        )}
      </div>
    </section>
  );
}
