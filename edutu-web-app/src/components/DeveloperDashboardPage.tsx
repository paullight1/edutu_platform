import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@clerk/clerk-react";
import { v4 as uuidv4 } from "uuid";
import {
  createCheckout,
  isBachsCheckoutEnabled,
  type BillingTransaction,
  type CheckoutResponse,
} from "../services/billing";
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
import { getDocsUrl, getOpenApiUrl, getPublicApiBaseUrl } from "../lib/apiProductUrls";

const docsUrl = getDocsUrl();
const apiBaseUrl = getPublicApiBaseUrl();
const apiSpecUrl = getOpenApiUrl();

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
  return "Payment";
}

function statusTone(status: string) {
  switch (status) {
    case "active":
      return {
        label: "Active",
        className: "bg-success/10 text-success border-success/30",
      };
    case "revoked":
      return {
        label: "Revoked",
        className: "bg-danger/10 text-danger border-danger/30",
      };
    default:
      return {
        label: status,
        className: "bg-surface-elevated text-text-secondary border-subtle",
      };
  }
}

function statusColor(code: number | null) {
  if (code === null) return "bg-surface-elevated text-text-secondary";
  if (code >= 500) return "bg-danger/10 text-danger";
  if (code >= 400) return "bg-warning/10 text-warning";
  return "bg-success/10 text-success";
}

function ActivityBadge({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-subtle bg-white px-3 py-1 text-xs font-semibold text-text-secondary">
      <Icon size={13} />
      {label}
    </div>
  );
}

export default function DeveloperDashboardPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const reduceMotion = useReducedMotion();
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
  const [checkoutToConfirm, setCheckoutToConfirm] = useState<CheckoutResponse | null>(null);
  const checkoutActionKey = useRef<string | null>(null);
  const checkoutEnabled = isBachsCheckoutEnabled();

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
    if (!checkoutEnabled || checkoutLoading || checkoutToConfirm) return;
    const token = await getToken();
    if (!token) return;

    setCheckoutLoading(true);
    setError(null);
    try {
      const idempotencyKey = checkoutActionKey.current ?? uuidv4();
      checkoutActionKey.current = idempotencyKey;
      const checkout = await createCheckout(token, {
        productKey: "credits_700",
        returnSurface: "web",
        idempotencyKey,
      });
      checkoutActionKey.current = null;
      setCheckoutToConfirm(checkout);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Unable to start checkout",
      );
    } finally {
      setCheckoutLoading(false);
    }
  };

  const continueToCheckout = () => {
    if (!checkoutToConfirm) return;
    window.location.assign(checkoutToConfirm.checkoutUrl);
  };

  const copyGeneratedKey = async () => {
    if (!generatedKey?.rawKey) return;
    await navigator.clipboard.writeText(generatedKey.rawKey);
    setGeneratedKey({ ...generatedKey, copied: true });
  };

  const [aiPromptCopied, setAiPromptCopied] = useState(false);

  // One-shot brief for an AI coding assistant. Includes the raw key only
  // while it is still on screen (it is never retrievable later).
  const copyAiPrompt = async () => {
    const key = generatedKey?.rawKey || "<PASTE_YOUR_EDUTU_API_KEY>";
    const prompt = `Integrate the Edutu Scholarship Engine API into this project.

Base URL: ${apiBaseUrl}
Auth: send the API key in the "x-edutu-api-key" header (Bearer also works).
API key: ${key} — store it as the EDUTU_API_KEY environment variable, never hardcode it.
Full API reference (fetch and read this FIRST): ${apiBaseUrl}/llms.txt
OpenAPI spec (machine-readable): ${apiSpecUrl}

Implement:
1. A typed client for GET /opportunities with filters (q, category, type, remote, deadlineFrom/To) and cursor pagination (follow meta.nextCursor while meta.hasMore).
2. GET /opportunities/{id} for detail views.
3. Optional: delta sync via GET /opportunities/sync?updatedSince=<ISO> on a schedule, and POST /recommendations with a user profile for ranked matches.
4. Error handling by code: 429 → wait Retry-After seconds and retry; 402 (quota_exceeded / credits_exhausted) → surface to the user; 401/403 → invalid key or missing scope.
5. Send a unique x-request-id header per request so retries are never double-billed.`;

    await navigator.clipboard.writeText(prompt);
    setAiPromptCopied(true);
    window.setTimeout(() => setAiPromptCopied(false), 2500);
  };

  const sectionAnimation = reduceMotion
    ? {}
    : {
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
            initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="grid gap-6 lg:grid-cols-[1.06fr_0.94fr] lg:items-start"
          >
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-brand">
                <Sparkles size={14} />
                Scholarship Engine
              </div>

              <div className="space-y-4">
                <h1 className="max-w-3xl text-[clamp(2.1rem,3.8vw,3.65rem)] font-medium leading-[1.04] tracking-[-0.06em] text-text-primary">
                  Create projects, issue keys, and ship against the live scholarship graph.
                </h1>
                <p className="max-w-2xl text-base leading-[1.8] sm:text-lg text-text-muted">
                  Your developer portal keeps API projects, metering, one-time credits, and recent request logs
                  in one place. Clerk protects this dashboard; generated Edutu API keys authenticate your /v1 calls.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <a
                  href={docsUrl}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold no-underline bg-brand text-white transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
                >
                  Open developer docs
                  <ArrowRight size={16} />
                </a>
                <a
                  href={apiSpecUrl}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold no-underline border border-subtle bg-white text-text-primary transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
                >
                  Open API spec
                </a>
                <a
                  href="#create-project"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold no-underline border border-subtle bg-white text-text-primary transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
                >
                  Create a project
                </a>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-subtle bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-brand">
                    <CheckCircle2 size={15} />
                    <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                      One-time key reveal
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-text-muted">
                    Raw keys are shown once at creation. Production stores a peppered HMAC-SHA256 hash; legacy SHA-256 hashes remain accepted indefinitely while compatibility is enabled, with no automatic cutoff. Rotate legacy keys as an operational security action and plan any future deprecation explicitly.
                  </p>
                </div>
                <div className="rounded-2xl border border-subtle bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-brand">
                    <ShieldCheck size={15} />
                    <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                      Scoped access
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-text-muted">
                    Keep read, sync, usage, and event permissions separate per project.
                  </p>
                </div>
                <div className="rounded-2xl border border-subtle bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-brand">
                    <CreditCard size={15} />
                    <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                      Billing aware
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-text-muted">
                    Credits are one-time top-ups and never expire; API keys are managed from this dashboard.
                  </p>
                </div>
              </div>
            </div>

            <motion.div
              initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.05 }}
              className="rounded-3xl border border-subtle bg-white p-4 sm:p-5"
            >
              <div className="flex items-center justify-between gap-4 border-b border-subtle pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
                    Quickstart
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-text-primary">
                    Call the API with your developer key
                  </h2>
                </div>
                <ActivityBadge icon={KeyRound} label="Bearer token" />
              </div>
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-subtle bg-surface-elevated p-4 text-xs leading-6 text-text-secondary">
{`curl -X GET ${apiBaseUrl}/opportunities?limit=10 \\
  -H "Authorization: Bearer edu_live_your_prefix_your_secret" \\
  -H "x-request-id: req_12345"`}
              </pre>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={copyAiPrompt}
                  className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-semibold text-brand transition-all duration-300 hover:bg-brand/15 active:scale-[0.97]"
                >
                  <Sparkles size={15} />
                  {aiPromptCopied ? "Copied — paste into your AI" : "Copy AI setup prompt"}
                </button>
                <p className="text-xs leading-5 text-text-muted">
                  Paste into Claude Code, Cursor, or ChatGPT and it wires the whole
                  integration from {""}
                  <a
                    href={`${apiBaseUrl}/llms.txt`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brand underline-offset-2 hover:underline"
                  >
                    llms.txt
                  </a>
                  .
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-subtle bg-white p-4">
                  <div className="flex items-center gap-2 text-brand">
                    <Database size={15} />
                    <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                      Billing credits
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-text-primary">
                    {billing.loading ? "…" : billing.status?.credits?.toLocaleString() ?? "0"}
                  </p>
                  <p className="text-sm text-text-muted">
                    {billing.status?.credits !== undefined ? "Credits available" : "No credit top-ups yet"}
                  </p>
                </div>
                <div className="rounded-2xl border border-subtle bg-white p-4">
                  <div className="flex items-center gap-2 text-brand">
                    <Terminal size={15} />
                    <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                      Current usage
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-text-primary">
                    {loading ? "…" : dashboard?.summary.totalRequestsThisMonth.toLocaleString() ?? "0"}
                  </p>
                  <p className="text-sm text-text-muted">
                    {dashboard?.summary.latestActivityAt ? `Last request ${formatDate(dashboard.summary.latestActivityAt)}` : "No request activity yet"}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.section>

          {generatedKey ? (
            <motion.section
              initial={reduceMotion ? undefined : { opacity: 0, y: 14 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              className="rounded-3xl border border-success/30 bg-success/10 p-5 sm:p-6"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-success">
                    <CheckCircle2 size={15} />
                    <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                      Key created
                    </span>
                  </div>
                  <h2 className="mt-2 text-xl font-semibold text-text-primary">
                    Copy this key now. It will not be shown again after you leave this page.
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={copyGeneratedKey}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold bg-brand text-white transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
                >
                  <Copy size={16} />
                  {generatedKey.copied ? "Copied" : "Copy key"}
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-success/30 bg-white px-4 py-3 font-mono text-sm tracking-[0.02em] text-text-primary">
                {generatedKey.rawKey}
              </div>
            </motion.section>
          ) : null}

          {error ? (
            <section className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </section>
          ) : null}

          <motion.section {...sectionAnimation} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="rounded-2xl border border-subtle bg-white p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
                        {card.label}
                      </p>
                      <p className="mt-2 text-[clamp(1.8rem,2.8vw,2.4rem)] font-semibold tracking-[-0.05em] text-text-primary">
                        {card.value}
                      </p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-subtle bg-surface-elevated text-brand">
                      <Icon size={18} />
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-text-muted">
                    {card.note}
                  </p>
                </div>
              );
            })}
          </motion.section>

          <motion.section
            initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="grid gap-6 xl:grid-cols-[1fr_1.06fr]"
          >
            <div
              id="create-project"
              className="rounded-3xl border border-subtle bg-white p-5 sm:p-6"
            >
              <div className="flex items-center gap-2 text-brand">
                <Sparkles size={15} />
                <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                  Create project
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-text-primary">
                Set up your first API project
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">
                Use a clear project name, pick an environment, and choose the scopes that your integration
                actually needs. You can rotate or revoke the key at any time.
              </p>

              <form className="mt-6 space-y-5" onSubmit={handleCreateProject}>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-text-primary">
                      Project name
                    </label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={(event) => setProjectName(event.target.value)}
                      className="w-full rounded-xl border border-border-subtle bg-surface-body px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
                      required
                    />
                    <p className="text-xs text-text-muted">
                      Use the product or company name that will own this integration.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-text-primary">
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
                    <p className="text-xs text-text-muted">
                      Test keys are useful for integration work and QA.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-text-primary">
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
                    <label className="block text-sm font-semibold text-text-primary">
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
                    <label className="block text-sm font-semibold text-text-primary">
                      Scopes
                    </label>
                    <p className="text-xs text-text-muted">
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
                              ? 'border-brand bg-brand/10'
                              : 'border-subtle bg-white hover:-translate-y-[1px]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleScope(scope.value)}
                            className="mt-1 h-4 w-4 rounded border-subtle text-brand focus:ring-brand"
                          />
                          <span>
                            <span className="block text-sm font-semibold text-text-primary">
                              {scope.label}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-text-muted">
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
                    className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold bg-brand text-white transition-all duration-300 hover:scale-[0.98] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {creating ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                    {creating ? "Creating..." : "Create project"}
                  </button>
                  <p className="text-xs text-text-muted">
                    The raw API key will only be visible immediately after creation.
                  </p>
                </div>
              </form>
            </div>

            <div className="rounded-3xl border border-subtle bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-brand">
                    <Database size={15} />
                    <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                      Projects
                    </span>
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-text-primary">
                    Manage keys and usage
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border border-subtle bg-white text-text-primary transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
                >
                  <RefreshCw size={15} />
                  Refresh
                </button>
              </div>

              <div className="mt-6 space-y-4">
                {loading ? (
                  <div className="rounded-2xl border border-subtle p-5">
                    <div className="h-5 w-32 animate-pulse rounded-full bg-surface-elevated" />
                    <div className="mt-4 space-y-3">
                      <div className="h-4 animate-pulse rounded-full bg-surface-elevated" />
                      <div className="h-4 w-5/6 animate-pulse rounded-full bg-surface-elevated" />
                      <div className="h-4 w-3/4 animate-pulse rounded-full bg-surface-elevated" />
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
                        className="rounded-2xl border border-subtle bg-white p-5"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-text-primary">
                                {project.name}
                              </h3>
                              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone.className}`}>
                                {tone.label}
                              </span>
                              <span className="rounded-full border border-subtle px-3 py-1 text-xs font-semibold text-text-secondary">
                                {project.environment}
                              </span>
                            </div>
                            <p className="text-sm text-text-muted">
                              <span className="font-mono">{project.keyPrefix}</span> · {project.plan} · {project.contactEmail ?? "No contact email"}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {project.scopes.map((scope) => (
                                <span
                                  key={scope}
                                  className="rounded-full border border-subtle bg-surface-elevated px-3 py-1 text-xs font-medium text-text-secondary"
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
                              className="inline-flex items-center gap-2 rounded-full border border-subtle bg-white px-4 py-2 text-sm font-semibold text-text-primary transition-all duration-300 hover:scale-[0.98] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
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
                              className="inline-flex items-center gap-2 rounded-full border border-danger/30 bg-danger/10 px-4 py-2 text-sm font-semibold text-danger transition-all duration-300 hover:scale-[0.98] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Trash2 size={15} />
                              Revoke
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <div className="rounded-2xl border border-subtle p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
                              Usage
                            </p>
                            <p className="mt-2 text-lg font-semibold text-text-primary">
                              {project.requestCount.toLocaleString()} requests
                            </p>
                            <p className="text-xs text-text-muted">
                              This month
                            </p>
                          </div>

                          <div className="rounded-2xl border border-subtle p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
                              Quota
                            </p>
                            <p className="mt-2 text-lg font-semibold text-text-primary">
                              {formatNumber(project.remainingQuota)} left
                            </p>
                            <p className="text-xs text-text-muted">
                              {formatNumber(project.monthlyQuota)} monthly limit
                            </p>
                          </div>

                          <div className="rounded-2xl border border-subtle p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
                              Last used
                            </p>
                            <p className="mt-2 text-lg font-semibold text-text-primary">
                              {formatDate(project.lastUsedAt)}
                            </p>
                            <p className="text-xs text-text-muted">
                              {project.revokedAt ? `Revoked ${formatDate(project.revokedAt)}` : "Still active"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4">
                          <div className="h-2 rounded-full bg-surface-elevated">
                            <div
                              className="h-full rounded-full bg-brand"
                              style={{ width: `${quotaPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-subtle bg-surface-elevated p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                        <Database size={18} />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-text-primary">
                          No projects yet
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-text-muted">
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
            initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="grid gap-6 xl:grid-cols-[1.06fr_0.94fr]"
          >
            <div className="rounded-3xl border border-subtle bg-white p-5 sm:p-6">
              <div className="flex items-center gap-2 text-brand">
                <Terminal size={15} />
                <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                  Request history
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-text-primary">
                Recent API activity
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">
                Use this table to verify live traffic, debug integrations, and spot quota spikes before they
                become support issues.
              </p>

              <div className="mt-6 overflow-x-auto rounded-2xl border border-subtle">
                <table className="min-w-full divide-y divide-border-subtle">
                  <thead className="bg-surface-elevated">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Request
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Endpoint
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Latency
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                          Loading request history...
                        </td>
                      </tr>
                    ) : dashboard?.recentRequests.length ? (
                      dashboard.recentRequests.map((request) => (
                        <tr key={request.id}>
                          <td className="px-4 py-4 text-sm font-medium text-text-primary">
                            {request.requestId || request.id.slice(0, 8)}
                            <div className="mt-1 text-xs text-text-muted">
                              {request.consumerName}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-text-primary">
                            {request.method} {request.endpoint}
                          </td>
                          <td className="px-4 py-4">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor(request.statusCode)}`}>
                              {request.statusCode ?? "n/a"}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-text-primary">
                            {request.latencyMs ?? "n/a"} ms
                          </td>
                          <td className="px-4 py-4 text-sm text-text-muted">
                            {formatDate(request.createdAt)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                          No activity yet. The next authenticated API request will appear here.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-3xl border border-subtle bg-white p-5 sm:p-6">
              <div className="flex items-center gap-2 text-brand">
                <ShieldCheck size={15} />
                <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                  Onboarding
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-text-primary">
                What to do next
              </h2>
              <div className="mt-6 space-y-4">
                {dashboard?.onboarding?.map((step, index) => (
                  <div
                    key={step.title}
                    className="flex gap-4 rounded-2xl border border-subtle bg-white p-4"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-sm font-bold text-brand">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary">
                        {step.title}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-text-muted">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-brand/30 bg-brand/10 p-4">
                <div className="flex items-center gap-2 text-brand">
                  <CreditCard size={15} />
                  <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                    Billing snapshot
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-text-muted">
                      Credits
                    </p>
                    <p className="mt-1 text-lg font-semibold text-text-primary">
                      {billing.loading ? "…" : billing.status?.credits?.toLocaleString() ?? "0"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-text-muted">
                      Credit purchase policy
                    </p>
                    <p className="mt-1 text-lg font-semibold text-text-primary">
                      One-time top-ups
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-text-muted">
                  API credit top-ups are one-time purchases and do not expire. Free health, usage, and category
                  calls do not consume credits; chargeable API calls cost one credit.
                </p>
                <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => void handleTopUpCredits()}
                    disabled={!checkoutEnabled || checkoutLoading || checkoutToConfirm !== null}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold bg-brand text-white transition-all duration-300 hover:scale-[0.98] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {checkoutLoading ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <CreditCard size={15} />
                    )}
                    Buy 700 credits
                  </button>
                  {checkoutToConfirm ? (
                    <div className="mt-3 rounded-xl border border-brand/40 bg-brand/5 p-3" aria-live="polite">
                      <p className="text-sm text-text-secondary">
                        This is a one-time credit purchase. Credits do not renew automatically.
                      </p>
                      <button
                        type="button"
                        onClick={continueToCheckout}
                        className="mt-2 rounded-full bg-brand px-3 py-2 text-sm font-semibold text-white"
                      >
                        Continue to secure checkout
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 rounded-2xl border border-subtle bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
                        Invoices & payments
                      </p>
                      <p className="mt-1 text-sm text-text-muted">
                        Recent payment receipts and API credit top-ups.
                      </p>
                    </div>
                    <span className="rounded-full border border-subtle bg-surface-elevated px-3 py-1 text-xs font-semibold text-text-secondary">
                      {billing.status?.transactions?.length ?? 0} records
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {(billing.status?.transactions ?? []).length ? (
                      billing.status!.transactions.map((transaction) => (
                        <div
                          key={transaction.id}
                          className="rounded-xl border border-subtle bg-surface-elevated px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-text-primary">
                                {billingTransactionLabel(transaction)}
                              </p>
                              <p className="mt-1 text-xs text-text-muted">
                                {transaction.providerReference || "No reference"} ·{" "}
                                {formatDate(transaction.createdAt)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-text-primary">
                                {formatBillingAmount(transaction)}
                              </p>
                              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                                {transaction.status}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-xl border border-dashed border-subtle px-4 py-4 text-sm leading-6 text-text-muted">
                        No payment history yet. Receipts and API credit top-ups will appear here after the first
                        successful payment.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="rounded-3xl border border-subtle bg-white p-5 sm:p-6"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-brand">
                  <KeyRound size={15} />
                  <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                    Docs & support
                  </span>
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-text-primary">
                  Keep the docs and dashboard one click away
                </h2>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href={docsUrl}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold no-underline bg-brand text-white transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
                >
                  Read docs
                </a>
                <Link
                  to="/scholarship-engine"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold no-underline border border-subtle bg-white text-text-primary transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
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
