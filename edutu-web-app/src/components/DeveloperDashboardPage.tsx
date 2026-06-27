import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  CreditCard,
  Database,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@clerk/clerk-react";
import { createCheckout, type BillingTransaction } from "../services/billing";
import { useBillingStatus } from "../hooks/useBillingStatus";
import PublicEditorialShell from "./PublicEditorialShell";
import {
  createDeveloperProject,
  getDeveloperDashboard,
  revokeDeveloperProject,
  rotateDeveloperProject,
  type CreateDeveloperProjectResult,
  type DeveloperDashboard,
  type DeveloperEnvironment,
  type DeveloperProjectSummary,
} from "../services/developer";

const docsUrl = import.meta.env.VITE_DOCS_URL || "https://docs.edutu.org";
const apiSpecUrl =
  import.meta.env.VITE_API_OPENAPI_URL || "https://api.edutu.org/v1/openapi.json";

const scopeOptions = [
  {
    value: "opportunities:read",
    label: "Read opportunities",
    description: "Fetch lists and detail pages.",
  },
  {
    value: "opportunities:sync",
    label: "Delta sync",
    description: "Pull updates since your last sync.",
  },
  {
    value: "usage:read",
    label: "Usage read",
    description: "Show quotas and remaining requests.",
  },
  {
    value: "recommendations:read",
    label: "Recommendations",
    description: "Request ranked opportunity suggestions.",
  },
  {
    value: "events:write",
    label: "Event tracking",
    description: "Send clicks, saves, and conversions.",
  },
];

const defaultScopes = scopeOptions.map((scope) => scope.value);

type GeneratedKey = CreateDeveloperProjectResult & {
  copied?: boolean;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Never";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "Unlimited";
  return value.toLocaleString();
}

function formatBillingAmount(transaction: BillingTransaction) {
  if (transaction.type === "credit_topup") {
    return `${transaction.amount.toLocaleString()} credits`;
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: transaction.currency || "NGN",
      maximumFractionDigits: 0,
    }).format(transaction.amount);
  } catch {
    return `${transaction.currency || "NGN"} ${transaction.amount.toLocaleString()}`;
  }
}

function billingTransactionLabel(transaction: BillingTransaction) {
  if (transaction.type === "credit_topup") return "API credit top-up";
  if (transaction.description) return transaction.description;
  return "Subscription payment";
}

function statusTone(status: string) {
  switch (status) {
    case "active":
      return {
        label: "Active",
        className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
      };
    case "revoked":
      return {
        label: "Revoked",
        className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
      };
    default:
      return {
        label: status,
        className: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-300 dark:border-white/10",
      };
  }
}

function statusColor(code: number | null) {
  if (code === null) return "bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-300";
  if (code >= 500) return "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300";
  if (code >= 400) return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300";
  return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";
}

function ActivityBadge({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
      <Icon size={13} />
      {label}
    </div>
  );
}

export default function DeveloperDashboardPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const billing = useBillingStatus();
  const [dashboard, setDashboard] = useState<DeveloperDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Scholarship Engine");
  const [environment, setEnvironment] = useState<DeveloperEnvironment>("live");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(defaultScopes);
  const [monthlyQuota, setMonthlyQuota] = useState("1000");
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState("60");
  const [creating, setCreating] = useState(false);
  const [mutatingProjectId, setMutatingProjectId] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState<GeneratedKey | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Unable to read your authenticated session.");
      }

      const nextDashboard = await getDeveloperDashboard(token);
      setDashboard(nextDashboard);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load developer dashboard",
      );
    } finally {
      setLoading(false);
    }
  }, [getToken, isLoaded, isSignedIn]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const summaryCards = useMemo(
    () => [
      {
        label: "API credits",
        value: billing.status?.credits?.toLocaleString() ?? "0",
        note: billing.status?.isPro ? "Pro billing active" : "Starter billing",
        icon: CreditCard,
      },
      {
        label: "Requests this month",
        value: dashboard?.summary.totalRequestsThisMonth?.toLocaleString() ?? "0",
        note: "Tracked by project",
        icon: Terminal,
      },
      {
        label: "Remaining quota",
        value:
          dashboard?.summary.totalRemainingQuota === null
            ? "Unlimited"
            : dashboard?.summary.totalRemainingQuota?.toLocaleString() ?? "0",
        note: "Across all active projects",
        icon: ShieldCheck,
      },
      {
        label: "Active projects",
        value: dashboard?.summary.activeProjects?.toString() ?? "0",
        note: "Projects that can still call the API",
        icon: Database,
      },
    ],
    [billing.status, dashboard],
  );

  const toggleScope = (scope: string) => {
    setSelectedScopes((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope],
    );
  };

  const refresh = async () => {
    await loadDashboard();
    await billing.refresh();
  };

  const handleCreateProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = await getToken();
    if (!token) {
      setError("Unable to read your authenticated session.");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const result = await createDeveloperProject(token, {
        name: projectName.trim() || "Scholarship Engine",
        environment,
        scopes: selectedScopes.length > 0 ? selectedScopes : defaultScopes,
        ...(Number(monthlyQuota) > 0
          ? { monthlyQuota: Number(monthlyQuota) }
          : {}),
        ...(Number(rateLimitPerMinute) > 0
          ? { rateLimitPerMinute: Number(rateLimitPerMinute) }
          : {}),
      });
      setGeneratedKey(result);
      setProjectName("");
      await refresh();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create a developer project",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleRotate = async (project: DeveloperProjectSummary) => {
    const token = await getToken();
    if (!token) return;

    setMutatingProjectId(project.id);
    setError(null);
    try {
      const result = await rotateDeveloperProject(token, project.id);
      setGeneratedKey(result);
      await refresh();
    } catch (rotateError) {
      setError(
        rotateError instanceof Error
          ? rotateError.message
          : "Unable to rotate this key",
      );
    } finally {
      setMutatingProjectId(null);
    }
  };

  const handleRevoke = async (project: DeveloperProjectSummary) => {
    const token = await getToken();
    if (!token) return;

    setMutatingProjectId(project.id);
    setError(null);
    try {
      await revokeDeveloperProject(token, project.id);
      if (generatedKey?.project.id === project.id) {
        setGeneratedKey(null);
      }
      await refresh();
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "Unable to revoke this key",
      );
    } finally {
      setMutatingProjectId(null);
    }
  };

  const handleTopUpCredits = async () => {
    const token = await getToken();
    if (!token) return;

    setCheckoutLoading(true);
    setError(null);
    try {
      const checkout = await createCheckout(token, {
        feature: "api_credits",
        credits: 1000,
        returnTo: "/dashboard/developer",
      });

      if (!checkout.configured || !checkout.authorizationUrl) {
        throw new Error(
          checkout.message ||
            "Billing is not configured yet. Please contact support.",
        );
      }

      window.location.assign(checkout.authorizationUrl);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Unable to start the Paystack checkout",
      );
    } finally {
      setCheckoutLoading(false);
    }
  };

  const copyGeneratedKey = async () => {
    if (!generatedKey?.rawKey) return;
    await navigator.clipboard.writeText(generatedKey.rawKey);
    setGeneratedKey({ ...generatedKey, copied: true });
  };

  const sectionAnimation = {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-80px" },
    transition: { duration: 0.5 },
  };

  return (
    <PublicEditorialShell>
      <div className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] space-y-8 lg:space-y-10">
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="grid gap-6 lg:grid-cols-[1.06fr_0.94fr] lg:items-start"
          >
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-[#146ef5] dark:border-blue-800/50 dark:bg-[#146ef5]/10">
                <Sparkles size={14} />
                Scholarship Engine
              </div>

              <div className="space-y-4">
                <h1 className="max-w-3xl text-[clamp(2.1rem,3.8vw,3.65rem)] font-medium leading-[1.04] tracking-[-0.06em] text-slate-950 dark:text-white">
                  Create projects, issue keys, and ship against the live scholarship graph.
                </h1>
                <p className="max-w-2xl text-base leading-[1.8] sm:text-lg text-slate-500 dark:text-gray-400">
                  Your developer portal keeps API projects, metering, billing credits, and recent request logs
                  in one place. Generate a key once, rotate it when needed, and keep the whole integration
                  auditable.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <a
                  href={docsUrl}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold no-underline bg-[#146ef5] text-white transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
                >
                  Open developer docs
                  <ArrowRight size={16} />
                </a>
                <a
                  href={apiSpecUrl}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold no-underline border border-slate-200 bg-white text-slate-950 transition-all duration-300 hover:scale-[0.98] active:scale-[0.97] dark:border-white/10 dark:bg-gray-900 dark:text-white"
                >
                  Open API spec
                </a>
                <a
                  href="#create-project"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold no-underline border border-slate-200 bg-white text-slate-950 transition-all duration-300 hover:scale-[0.98] active:scale-[0.97] dark:border-white/10 dark:bg-gray-900 dark:text-white"
                >
                  Create a project
                </a>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-gray-900">
                  <div className="mb-2 flex items-center gap-2 text-[#146ef5]">
                    <CheckCircle2 size={15} />
                    <span className="text-xs font-bold uppercase tracking-[0.22em]">
                      One-time key reveal
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-slate-500 dark:text-gray-400">
                    Raw keys are shown once at creation and stored hashed afterwards.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-gray-900">
                  <div className="mb-2 flex items-center gap-2 text-[#146ef5]">
                    <ShieldCheck size={15} />
                    <span className="text-xs font-bold uppercase tracking-[0.22em]">
                      Scoped access
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-slate-500 dark:text-gray-400">
                    Keep read, sync, usage, and event permissions separate per project.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-gray-900">
                  <div className="mb-2 flex items-center gap-2 text-[#146ef5]">
                    <CreditCard size={15} />
                    <span className="text-xs font-bold uppercase tracking-[0.22em]">
                      Billing aware
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-slate-500 dark:text-gray-400">
                    Credits and subscription status come from the same account dashboard.
                  </p>
                </div>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.05 }}
              className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-white/10 dark:bg-gray-900"
            >
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#146ef5]">
                    Quickstart
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                    Call the API with your developer key
                  </h2>
                </div>
                <ActivityBadge icon={KeyRound} label="Bearer token" />
              </div>
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700 dark:border-white/10 dark:bg-gray-950 dark:text-slate-300">
{`curl -X GET https://api.edutu.org/v1/opportunities?limit=10 \\
  -H "Authorization: Bearer edu_live_your_prefix_your_secret" \\
  -H "x-request-id: req_12345"`}
              </pre>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-gray-950">
                  <div className="flex items-center gap-2 text-[#146ef5]">
                    <Database size={15} />
                    <span className="text-xs font-bold uppercase tracking-[0.22em]">
                      Billing credits
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                    {billing.loading ? "…" : billing.status?.credits?.toLocaleString() ?? "0"}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-gray-400">
                    {billing.status?.subscriptionStatus || "No subscription yet"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-gray-950">
                  <div className="flex items-center gap-2 text-[#146ef5]">
                    <Terminal size={15} />
                    <span className="text-xs font-bold uppercase tracking-[0.22em]">
                      Current usage
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                    {loading ? "…" : dashboard?.summary.totalRequestsThisMonth.toLocaleString() ?? "0"}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-gray-400">
                    {dashboard?.summary.latestActivityAt ? `Last request ${formatDate(dashboard.summary.latestActivityAt)}` : "No request activity yet"}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.section>

          {generatedKey ? (
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6 dark:border-emerald-500/20 dark:bg-emerald-500/10"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={15} />
                    <span className="text-xs font-bold uppercase tracking-[0.22em]">
                      Key created
                    </span>
                  </div>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                    Copy this key now. It will not be shown again after you leave this page.
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={copyGeneratedKey}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold bg-[#146ef5] text-white transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
                >
                  <Copy size={16} />
                  {generatedKey.copied ? "Copied" : "Copy key"}
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-emerald-200 bg-white px-4 py-3 font-mono text-sm tracking-[0.02em] text-slate-900 dark:border-emerald-500/20 dark:bg-gray-950 dark:text-white">
                {generatedKey.rawKey}
              </div>
            </motion.section>
          ) : null}

          {error ? (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </section>
          ) : null}

          <motion.section {...sectionAnimation} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-gray-900">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#146ef5]">
                        {card.label}
                      </p>
                      <p className="mt-2 text-[clamp(1.8rem,2.8vw,2.4rem)] font-semibold tracking-[-0.05em] text-slate-950 dark:text-white">
                        {card.value}
                      </p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#146ef5] dark:border-white/10 dark:bg-white/5">
                      <Icon size={18} />
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-gray-400">
                    {card.note}
                  </p>
                </div>
              );
            })}
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="grid gap-6 xl:grid-cols-[1fr_1.06fr]"
          >
            <div
              id="create-project"
              className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-gray-900"
            >
              <div className="flex items-center gap-2 text-[#146ef5]">
                <Sparkles size={15} />
                <span className="text-xs font-bold uppercase tracking-[0.22em]">
                  Create project
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                Set up your first API project
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-gray-400">
                Use a clear project name, pick an environment, and choose the scopes that your integration
                actually needs. You can rotate or revoke the key at any time.
              </p>

              <form className="mt-6 space-y-5" onSubmit={handleCreateProject}>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-950 dark:text-white">
                      Project name
                    </label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={(event) => setProjectName(event.target.value)}
                      className="w-full rounded-xl border border-border-subtle bg-surface-body px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
                      required
                    />
                    <p className="text-xs text-slate-500 dark:text-gray-400">
                      Use the product or company name that will own this integration.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-950 dark:text-white">
                      Environment
                    </label>
                    <select
                      value={environment}
                      onChange={(event) =>
                        setEnvironment(event.target.value as DeveloperEnvironment)
                      }
                      className="w-full rounded-xl border border-border-subtle bg-surface-body px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
                    >
                      <option value="live">Live</option>
                      <option value="test">Test</option>
                    </select>
                    <p className="text-xs text-slate-500 dark:text-gray-400">
                      Test keys are useful for integration work and QA.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-950 dark:text-white">
                      Monthly quota
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={monthlyQuota}
                      onChange={(event) => setMonthlyQuota(event.target.value)}
                      className="w-full rounded-xl border border-border-subtle bg-surface-body px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-950 dark:text-white">
                      Rate limit / minute
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={rateLimitPerMinute}
                      onChange={(event) => setRateLimitPerMinute(event.target.value)}
                      className="w-full rounded-xl border border-border-subtle bg-surface-body px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-950 dark:text-white">
                      Scopes
                    </label>
                    <p className="text-xs text-slate-500 dark:text-gray-400">
                      Select the smallest set of permissions your integration needs.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {scopeOptions.map((scope) => {
                      const checked = selectedScopes.includes(scope.value);
                      return (
                        <label
                          key={scope.value}
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all duration-200 ${
                            checked
                              ? 'border-[#146ef5] bg-[#146ef5]/10 dark:bg-[#146ef5]/20'
                              : 'border-slate-200 bg-white hover:-translate-y-[1px] dark:border-white/10 dark:bg-gray-900'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleScope(scope.value)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-[#146ef5] focus:ring-[#146ef5]"
                          />
                          <span>
                            <span className="block text-sm font-semibold text-slate-950 dark:text-white">
                              {scope.label}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-gray-400">
                              {scope.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={creating}
                    className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold bg-[#146ef5] text-white transition-all duration-300 hover:scale-[0.98] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {creating ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                    {creating ? "Creating..." : "Create project"}
                  </button>
                  <p className="text-xs text-slate-500 dark:text-gray-400">
                    The raw API key will only be visible immediately after creation.
                  </p>
                </div>
              </form>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-gray-900">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[#146ef5]">
                    <Database size={15} />
                    <span className="text-xs font-bold uppercase tracking-[0.22em]">
                      Projects
                    </span>
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                    Manage keys and usage
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border border-slate-200 bg-white text-slate-950 transition-all duration-300 hover:scale-[0.98] active:scale-[0.97] dark:border-white/10 dark:bg-gray-900 dark:text-white"
                >
                  <RefreshCw size={15} />
                  Refresh
                </button>
              </div>

              <div className="mt-6 space-y-4">
                {loading ? (
                  <div className="rounded-2xl border border-slate-200 p-5 dark:border-white/10">
                    <div className="h-5 w-32 animate-pulse rounded-full bg-slate-200/60 dark:bg-white/10" />
                    <div className="mt-4 space-y-3">
                      <div className="h-4 animate-pulse rounded-full bg-slate-200/50 dark:bg-white/5" />
                      <div className="h-4 w-5/6 animate-pulse rounded-full bg-slate-200/50 dark:bg-white/5" />
                      <div className="h-4 w-3/4 animate-pulse rounded-full bg-slate-200/50 dark:bg-white/5" />
                    </div>
                  </div>
                ) : dashboard?.projects.length ? (
                  dashboard.projects.map((project) => {
                    const tone = statusTone(project.status);
                    const quotaPercent =
                      project.monthlyQuota && project.monthlyQuota > 0
                        ? Math.min(
                            (project.requestCount / project.monthlyQuota) * 100,
                            100,
                          )
                        : 0;

                    return (
                      <div
                        key={project.id}
                        className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-gray-900"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
                                {project.name}
                              </h3>
                              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone.className}`}>
                                {tone.label}
                              </span>
                              <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-white/10 dark:text-slate-300">
                                {project.environment}
                              </span>
                            </div>
                            <p className="text-sm text-slate-500 dark:text-gray-400">
                              <span className="font-mono">{project.keyPrefix}</span> · {project.plan} · {project.contactEmail ?? "No contact email"}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {project.scopes.map((scope) => (
                                <span
                                  key={scope}
                                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-gray-950 dark:text-slate-300"
                                >
                                  {scope}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleRotate(project)}
                              disabled={mutatingProjectId === project.id || project.status !== "active"}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition-all duration-300 hover:scale-[0.98] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-gray-900 dark:text-white"
                            >
                              {mutatingProjectId === project.id ? (
                                <Loader2 size={15} className="animate-spin" />
                              ) : (
                                <RefreshCw size={15} />
                              )}
                              Rotate
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRevoke(project)}
                              disabled={mutatingProjectId === project.id || project.status !== "active"}
                              className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition-all duration-300 hover:scale-[0.98] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
                            >
                              <Trash2 size={15} />
                              Revoke
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#146ef5]">
                              Usage
                            </p>
                            <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">
                              {project.requestCount.toLocaleString()} requests
                            </p>
                            <p className="text-xs text-slate-500 dark:text-gray-400">
                              This month
                            </p>
                          </div>

                          <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#146ef5]">
                              Quota
                            </p>
                            <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">
                              {formatNumber(project.remainingQuota)} left
                            </p>
                            <p className="text-xs text-slate-500 dark:text-gray-400">
                              {formatNumber(project.monthlyQuota)} monthly limit
                            </p>
                          </div>

                          <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#146ef5]">
                              Last used
                            </p>
                            <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">
                              {formatDate(project.lastUsedAt)}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-gray-400">
                              {project.revokedAt ? `Revoked ${formatDate(project.revokedAt)}` : "Still active"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4">
                          <div className="h-2 rounded-full bg-slate-200/70 dark:bg-white/10">
                            <div
                              className="h-full rounded-full bg-[#146ef5]"
                              style={{ width: `${quotaPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-gray-900">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#146ef5]/10 text-[#146ef5]">
                        <Database size={18} />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
                          No projects yet
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-gray-400">
                          Create a project on the left to generate a key and start tracking usage.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="grid gap-6 xl:grid-cols-[1.06fr_0.94fr]"
          >
            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-[#146ef5]">
                <Terminal size={15} />
                <span className="text-xs font-bold uppercase tracking-[0.22em]">
                  Request history
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                Recent API activity
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-gray-400">
                Use this table to verify live traffic, debug integrations, and spot quota spikes before they
                become support issues.
              </p>

              <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10">
                  <thead className="bg-slate-50 dark:bg-white/5">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-gray-400">
                        Request
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-gray-400">
                        Endpoint
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-gray-400">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-gray-400">
                        Latency
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-gray-400">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-gray-400">
                          Loading request history...
                        </td>
                      </tr>
                    ) : dashboard?.recentRequests.length ? (
                      dashboard.recentRequests.map((request) => (
                        <tr key={request.id}>
                          <td className="px-4 py-4 text-sm font-medium text-slate-950 dark:text-white">
                            {request.requestId || request.id.slice(0, 8)}
                            <div className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                              {request.consumerName}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-950 dark:text-white">
                            {request.method} {request.endpoint}
                          </td>
                          <td className="px-4 py-4">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor(request.statusCode)}`}>
                              {request.statusCode ?? "n/a"}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-950 dark:text-white">
                            {request.latencyMs ?? "n/a"} ms
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-500 dark:text-gray-400">
                            {formatDate(request.createdAt)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-gray-400">
                          No activity yet. The next authenticated API request will appear here.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-[#146ef5]">
                <ShieldCheck size={15} />
                <span className="text-xs font-bold uppercase tracking-[0.22em]">
                  Onboarding
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                What to do next
              </h2>
              <div className="mt-6 space-y-4">
                {dashboard?.onboarding?.map((step, index) => (
                  <div
                    key={step.title}
                    className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-gray-900"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#146ef5]/10 text-sm font-bold text-[#146ef5]">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                        {step.title}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-gray-400">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/50 dark:bg-[#146ef5]/10">
                <div className="flex items-center gap-2 text-[#146ef5]">
                  <CreditCard size={15} />
                  <span className="text-xs font-bold uppercase tracking-[0.22em]">
                    Billing snapshot
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-gray-400">
                      Credits
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                      {billing.loading ? "…" : billing.status?.credits?.toLocaleString() ?? "0"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-gray-400">
                      Subscription
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                      {billing.status?.subscriptionStatus ?? "Inactive"}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-gray-400">
                  {billing.status?.proExpiresAt
                    ? `Renews or expires ${formatDate(billing.status.proExpiresAt)}`
                    : "Top up credits or start a billing plan to keep access active."}
                </p>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => void handleTopUpCredits()}
                    disabled={checkoutLoading}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold bg-[#146ef5] text-white transition-all duration-300 hover:scale-[0.98] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {checkoutLoading ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <CreditCard size={15} />
                    )}
                    Buy 1,000 credits
                  </button>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-gray-950">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#146ef5]">
                        Invoices & payments
                      </p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
                        Recent Paystack receipts and subscription records.
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-gray-900 dark:text-slate-300">
                      {billing.status?.transactions?.length ?? 0} records
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {(billing.status?.transactions ?? []).length ? (
                      billing.status!.transactions.map((transaction) => (
                        <div
                          key={transaction.id}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-gray-900"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-slate-950 dark:text-white">
                                {billingTransactionLabel(transaction)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                                {transaction.providerReference || "No reference"} ·{" "}
                                {formatDate(transaction.createdAt)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-slate-950 dark:text-white">
                                {formatBillingAmount(transaction)}
                              </p>
                              <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-[#146ef5]">
                                {transaction.status}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm leading-6 text-slate-500 dark:border-white/10 dark:text-gray-400">
                        No invoice history yet. Paystack receipts and API credit top-ups will appear here
                        after the first successful payment.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-gray-900"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[#146ef5]">
                  <KeyRound size={15} />
                  <span className="text-xs font-bold uppercase tracking-[0.22em]">
                    Docs & support
                  </span>
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                  Keep the docs and dashboard one click away
                </h2>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href={docsUrl}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold no-underline bg-[#146ef5] text-white transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
                >
                  Read docs
                </a>
                <Link
                  to="/scholarship-engine"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold no-underline border border-slate-200 bg-white text-slate-950 transition-all duration-300 hover:scale-[0.98] active:scale-[0.97] dark:border-white/10 dark:bg-gray-900 dark:text-white"
                >
                  View marketing page
                </Link>
              </div>
            </div>
          </motion.section>
        </div>
      </div>
    </PublicEditorialShell>
  );
}
