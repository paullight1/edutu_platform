import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";
import { fetchOpportunityShareCard } from "../services/opportunityShare";

function parseShareText(shareText?: string | null) {
  const lines = (shareText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    status: lines[0] ?? "Opportunity preview",
    title: lines[1] ?? "Shared opportunity",
  };
}

export default function OpportunitySharePage() {
  const { id } = useParams<{ id: string }>();
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

  if (!id) {
    return <Navigate to="/opportunities" replace />;
  }

  return (
    <PublicEditorialShell mainClassName="max-w-3xl py-10 sm:py-14">
      <Seo
        title="Opportunity preview | Edutu"
        description="Preview a shared Edutu opportunity."
        path={`/share/opportunity/${id}`}
        noindex
      />

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10 sm:p-8">
        {loading ? (
          <div className="flex min-h-[220px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          </div>
        ) : (
          <>
            {error ? (
              <p className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </p>
            ) : null}

          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            {preview.status}
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            {preview.title}
          </h1>
          <Link
            to="/opportunities"
            className="mt-7 inline-flex h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            Browse opportunities
          </Link>
          </>
        )}
      </section>
    </PublicEditorialShell>
  );
}
