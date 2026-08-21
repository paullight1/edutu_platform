import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import {
  getMarketplaceEnrollments,
  getWallet,
  type MarketplaceEnrollment,
  type MarketplaceWallet,
  type WalletTransaction,
} from "../services/marketplace";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function transactionLabel(transaction: WalletTransaction) {
  switch (transaction.type) {
    case "marketplace_purchase":
      return "Marketplace purchase";
    case "creator_earning":
      return "Creator earning";
    case "reward":
      return "Reward";
    default:
      return transaction.type.replaceAll("_", " ");
  }
}

export default function WalletPage() {
  const { getToken } = useAuth();
  const [wallet, setWallet] = useState<MarketplaceWallet | null>(null);
  const [enrollments, setEnrollments] = useState<MarketplaceEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session has expired. Sign in again.");
      const [nextWallet, nextEnrollments] = await Promise.all([
        getWallet(token),
        getMarketplaceEnrollments(token),
      ]);
      setWallet(nextWallet);
      setEnrollments(nextEnrollments);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load your wallet.",
      );
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const creditsSpent = useMemo(
    () =>
      enrollments.reduce(
        (total, enrollment) => total + Math.max(enrollment.creditsSpent || 0, 0),
        0,
      ),
    [enrollments],
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-brand">
            <Coins size={14} aria-hidden="true" /> Wallet
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text-primary">
            Credits and marketplace activity
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
            Your balance and history come from Edutu's canonical credit ledger.
            Marketplace purchases and creator earnings are recorded atomically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-subtle bg-surface-layer px-4 text-sm font-bold text-text-secondary transition hover:border-brand/30 hover:text-brand disabled:opacity-60"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={16} aria-hidden="true" />
          )}
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-6 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {loading && !wallet ? (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-[24px] border border-subtle bg-surface-layer"
            />
          ))}
        </div>
      ) : wallet ? (
        <>
          <section className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-brand/20 bg-brand/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">
                Available balance
              </p>
              <p className="mt-2 font-display text-4xl font-semibold tracking-tight text-text-primary">
                {wallet.balance.toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-text-muted">Edutu credits</p>
            </div>
            <div className="rounded-[24px] border border-subtle bg-surface-layer p-5 shadow-soft">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">
                Marketplace enrollments
              </p>
              <p className="mt-2 font-display text-3xl font-semibold text-text-primary">
                {enrollments.length.toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-text-muted">Current and completed</p>
            </div>
            <div className="rounded-[24px] border border-subtle bg-surface-layer p-5 shadow-soft">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">
                Credits invested
              </p>
              <p className="mt-2 font-display text-3xl font-semibold text-text-primary">
                {creditsSpent.toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-text-muted">Across marketplace enrollments</p>
            </div>
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-[24px] border border-subtle bg-surface-layer shadow-soft">
              <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-text-primary">
                    Credit history
                  </h2>
                  <p className="text-xs text-text-muted">
                    Server-recorded balance activity
                  </p>
                </div>
                <ShieldCheck size={20} className="text-brand" aria-hidden="true" />
              </div>

              {wallet.transactions.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <Coins size={28} className="mx-auto text-text-muted" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold text-text-primary">
                    No credit activity yet
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    Purchases, creator earnings and rewards will appear here when they happen.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-subtle">
                  {wallet.transactions.map((transaction) => {
                    const positive = transaction.amount >= 0;
                    const Icon = positive ? ArrowDownLeft : ArrowUpRight;
                    return (
                      <li key={transaction.id} className="flex items-center gap-3 px-5 py-4">
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            positive
                              ? "bg-success/10 text-success"
                              : "bg-brand/10 text-brand"
                          }`}
                        >
                          <Icon size={17} aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold capitalize text-text-primary">
                            {transactionLabel(transaction)}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-text-muted">
                            {transaction.description || formatDate(transaction.createdAt)}
                          </p>
                          {transaction.description ? (
                            <p className="mt-0.5 text-xs text-text-muted">
                              {formatDate(transaction.createdAt)}
                            </p>
                          ) : null}
                        </div>
                        <span
                          className={`shrink-0 text-sm font-bold ${
                            positive ? "text-success" : "text-text-primary"
                          }`}
                        >
                          {positive ? "+" : ""}
                          {transaction.amount.toLocaleString()}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="h-fit rounded-[24px] border border-subtle bg-surface-layer p-5 shadow-soft">
              <div className="flex items-center gap-2">
                <ShoppingBag size={18} className="text-brand" aria-hidden="true" />
                <h2 className="font-display text-lg font-semibold text-text-primary">
                  Your marketplace access
                </h2>
              </div>
              {enrollments.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-text-muted">
                  You have not enrolled in a marketplace listing yet.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {enrollments.slice(0, 6).map((enrollment) => (
                    <li
                      key={enrollment.id}
                      className="rounded-xl border border-subtle bg-surface-body p-3"
                    >
                      <p className="line-clamp-2 text-sm font-semibold text-text-primary">
                        {enrollment.title}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-text-muted">
                        <span className="capitalize">{enrollment.status}</span>
                        <span>{enrollment.creditsSpent.toLocaleString()} credits</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
