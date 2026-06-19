import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import {
  fetchOpportunityShareCard,
  type OpportunityShareCard,
} from "../services/opportunityShare";

function parseShareText(shareText?: string | null) {
  const lines = (shareText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const benefitsStart = lines.indexOf("Benefits:");
  const categoryIndex = lines.findIndex((line) => line.startsWith("Category:"));
  const categoryLine = lines.find((line) => line.startsWith("Category:"));
  const sponsorLine = lines.find((line) => line.startsWith("Sponsor:"));
  const countryLine = lines.find((line) =>
    line.startsWith("Eligible Country:"),
  );
  const deadlineLine = lines.find((line) => line.startsWith("Deadline:"));

  return {
    status: lines[0] ?? "Opportunity preview",
    title: lines[1] ?? "Shared opportunity",
    sponsor: sponsorLine?.replace("Sponsor:", "").trim() ?? null,
    category: categoryLine?.replace("Category:", "").trim() ?? null,
    country: countryLine?.replace("Eligible Country:", "").trim() ?? null,
    deadline: deadlineLine?.replace("Deadline:", "").trim() ?? null,
    benefits:
      benefitsStart >= 0
        ? lines
            .slice(
              benefitsStart + 1,
              categoryIndex >= 0 ? categoryIndex : lines.length,
            )
            .map((line) => line.replace(/^[•\-*⭐✅]\s*/, ""))
            .filter(Boolean)
            .slice(0, 2)
        : [],
  };
}

export default function OpportunitySharePage() {
  const { id } = useParams<{ id: string }>();
  const { isLoaded, isSignedIn } = useClerkAuth();
  const location = useLocation();
  const [shareCard, setShareCard] = useState<OpportunityShareCard | null>(null);
  const [shareText, setShareText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    let active = true;
    const opportunityId = id;

    async function loadShareCard() {
      setLoading(true);
      setError(null);

      try {
        const payload = await fetchOpportunityShareCard(opportunityId);
        if (!active) return;

        setShareCard(payload);
        setShareText(payload?.shareText ?? null);
      } catch (loadError) {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the preview.",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadShareCard();

    return () => {
      active = false;
    };
  }, [id]);

  const preview = useMemo(() => parseShareText(shareText), [shareText]);
  const authState = {
    from: {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    },
  };

  if (!id) {
    return <Navigate to="/opportunities" replace />;
  }

  return (
    <PublicEditorialShell mainClassName="max-w-5xl py-6 sm:py-8">
      <Seo
        title="Opportunity preview | Edutu"
        description="Preview a shared opportunity and sign in to open the member view."
        path={`/share/opportunity/${id}`}
        noindex
      />

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            {preview.status}
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            {preview.title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            This preview is public. The full opportunity remains member-only.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/auth?mode=sign-in"
              state={authState}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              Sign in to continue
              <ArrowRight size={16} />
            </Link>
            <Link
              to={`/opportunity/${encodeURIComponent(id)}`}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
            >
              Open member view
            </Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              ["Sponsor", preview.sponsor],
              ["Category", preview.category],
              ["Country", preview.country],
              ["Deadline", preview.deadline],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
              >
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                  {label}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
                  {value || "Not listed"}
                </div>
              </div>
            ))}
          </div>

          {preview.benefits.length > 0 ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <div className="text-sm font-black text-slate-950 dark:text-white">
                Benefits
              </div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                {preview.benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2">
                    <Sparkles
                      size={14}
                      className="mt-0.5 shrink-0 text-brand-500"
                    />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
            {loading ? (
              <div className="flex aspect-[4/5] items-center justify-center bg-slate-100 dark:bg-white/5">
                <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
              </div>
            ) : shareCard?.url ? (
              <img
                src={shareCard.url}
                alt={`${preview.title} share preview`}
                className="aspect-[4/5] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 bg-slate-100 px-6 text-center dark:bg-white/5">
                <div className="rounded-full bg-brand-500/10 p-3 text-brand-600 dark:text-brand-300">
                  <Sparkles size={20} />
                </div>
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  Preview unavailable right now.
                </p>
              </div>
            )}
          </div>

          {error || isLoaded ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              {error ? (
                <p className="font-semibold text-rose-600 dark:text-rose-300">
                  {error}
                </p>
              ) : (
                <p>
                  {isSignedIn
                    ? "You are signed in. Open the member view to see the full opportunity."
                    : "Sign in to open the full opportunity after reviewing the preview."}
                </p>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </PublicEditorialShell>
  );
}
