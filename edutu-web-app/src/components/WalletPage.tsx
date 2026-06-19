import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import PublicEditorialShell from "./PublicEditorialShell";
import { useBillingStatus } from "../hooks/useBillingStatus";
import { useAuth as useAppAuth } from "../hooks/useAuth";
import { createCheckout, type BillingInterval } from "../services/billing";
import {
  formatCreditTransactionType,
  type CreditTransaction,
  getTransactionHistory,
} from "../services/credits";

const planOptions: Array<{
  value: BillingInterval;
  label: string;
  hint: string;
}> = [
  { value: "monthly", label: "Monthly", hint: "Flexible billing" },
  { value: "yearly", label: "Yearly", hint: "Best value" },
];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatAmount(amount: number) {
  const prefix = amount >= 0 ? "+" : "-";
  return `${prefix}${Math.abs(amount)}`;
}

function formatLabel(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function TransactionRow({ transaction }: { transaction: CreditTransaction }) {
  const amountIsPositive = transaction.amount >= 0;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-950 dark:text-white">
            {transaction.description}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {formatCreditTransactionType(transaction.type)}
          </p>
        </div>
        <div
          className={`shrink-0 text-sm font-black ${
            amountIsPositive
              ? "text-emerald-600 dark:text-emerald-300"
              : "text-rose-600 dark:text-rose-300"
          }`}
        >
          {formatAmount(transaction.amount)}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 dark:bg-white/10">
          <CalendarClock size={12} />
          {formatDate(transaction.created_at)}
        </span>
        {transaction.related_type ? (
          <span className="rounded-full bg-brand-500/10 px-2 py-1 text-brand-700 dark:text-brand-300">
            {formatLabel(transaction.related_type)}
          </span>
        ) : null}
      </div>
    </article>
  );
}

export default function WalletPage() {
  const { user } = useAppAuth();
  const { getToken } = useClerkAuth();
  const {
    status,
    loading: billingLoading,
    error: billingError,
    refresh,
  } = useBillingStatus();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState<string | null>(
    null,
  );
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadTransactions() {
      if (!user?.id) {
        setTransactions([]);
        setTransactionsLoading(false);
        return;
      }

      setTransactionsLoading(true);
      setTransactionsError(null);

      try {
        const history = await getTransactionHistory(user.id, 12);
        if (!active) return;
        setTransactions(history);
      } catch (loadError) {
        if (!active) return;
        setTransactionsError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load transactions.",
        );
      } finally {
        if (active) {
          setTransactionsLoading(false);
        }
      }
    }

    void loadTransactions();

    return () => {
      active = false;
    };
  }, [user?.id]);

  const activeEntitlements = useMemo(
    () => status?.entitlements?.filter(Boolean).map(formatLabel) ?? [],
    [status?.entitlements],
  );

  const activeFeatures = useMemo(
    () =>
      Object.entries(status?.featureAccess ?? {})
        .filter(([, enabled]) => Boolean(enabled))
        .map(([feature]) => formatLabel(feature)),
    [status?.featureAccess],
  );

  const checkoutTarget = useMemo(() => {
    if (typeof window === "undefined") return "/wallet";
    return `${window.location.origin}/wallet`;
  }, []);

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    setCheckoutMessage(null);
    setCheckoutError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Unable to read the current session token.");
      }

      const response = await createCheckout(token, {
        plan: interval,
        feature: "pro",
        returnTo: checkoutTarget,
      });

      if (response.authorizationUrl) {
        window.location.assign(response.authorizationUrl);
        return;
      }

      setCheckoutMessage(
        response.message ||
          "Billing is not configured yet. The backend returned no checkout URL.",
      );
    } catch (checkoutError) {
      setCheckoutError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Unable to start checkout.",
      );
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleRefresh = async () => {
    setCheckoutError(null);
    setCheckoutMessage(null);
    try {
      await refresh();
      if (user?.id) {
        const history = await getTransactionHistory(user.id, 12);
        setTransactions(history);
      }
    } catch (refreshError) {
      setCheckoutError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh wallet data.",
      );
    }
  };

  const loading = billingLoading || transactionsLoading;

  return (
    <PublicEditorialShell mainClassName="max-w-7xl">
      <div className="space-y-6">
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                  Wallet
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                  Credits, plan, and billing
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Read-only credit balance, current subscription status, and the
                  checkout flow for Pro upgrades.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  <RefreshCcw size={15} />
                  Refresh
                </button>
              </div>
            </div>

            {checkoutError ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                {checkoutError}
              </div>
            ) : null}
            {checkoutMessage ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                {checkoutMessage}
              </div>
            ) : null}
            {billingError ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                {billingError}
              </div>
            ) : null}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm dark:border-white/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Current balance
                </p>
                <p className="mt-2 text-4xl font-black tracking-tight">
                  {loading ? "..." : (status?.credits ?? 0)}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Credits available to spend on supported features
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3 text-brand-300">
                <CreditCard size={20} />
              </div>
            </div>

            <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-300">
                  Subscription
                </span>
                <span className="rounded-full bg-brand-500/15 px-2.5 py-1 text-xs font-black text-brand-200">
                  {status?.isPro ? "Pro active" : "Free"}
                </span>
              </div>
              <div className="text-sm text-slate-300">
                {status?.subscriptionStatus
                  ? formatLabel(status.subscriptionStatus)
                  : "No billing status yet"}
              </div>
              {status?.proExpiresAt ? (
                <div className="text-xs font-semibold text-slate-400">
                  Renews or expires {formatDate(status.proExpiresAt)}
                </div>
              ) : null}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2">
              {planOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setInterval(option.value)}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    interval === option.value
                      ? "border-brand-400 bg-brand-500/15 text-white"
                      : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <span className="block text-sm font-black">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-xs font-semibold">
                    {option.hint}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCheckout}
              disabled={checkoutLoading}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {checkoutLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}
              {status?.isPro ? "Manage subscription" : "Upgrade to Pro"}
            </button>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">
                  Entitlements
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Features unlocked for the current member account.
                </p>
              </div>
              <BadgeCheck className="text-brand-500" size={18} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {activeEntitlements.length > 0 ? (
                activeEntitlements.map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-brand-500/10 px-3 py-1 text-xs font-bold text-brand-700 dark:text-brand-300"
                  >
                    {item}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  No paid entitlements yet.
                </span>
              )}
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <div className="text-sm font-black text-slate-950 dark:text-white">
                Feature access
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {activeFeatures.length > 0 ? (
                  activeFeatures.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-white/10 dark:text-slate-300"
                    >
                      {item}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    No feature flags enabled.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">
                  Payments
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Transaction history from the credits ledger.
                </p>
              </div>
              <ArrowRight className="text-slate-400" size={18} />
            </div>

            <div className="mt-4 space-y-3">
              {transactionsError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                  {transactionsError}
                </div>
              ) : null}

              {transactionsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5"
                    />
                  ))}
                </div>
              ) : transactions.length > 0 ? (
                <div className="space-y-3">
                  {transactions.map((transaction) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                  No credit transactions yet.
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <ExternalLink size={12} />
              Credit spending and grants are read-only here.
            </div>
          </div>
        </section>
      </div>
    </PublicEditorialShell>
  );
}
