import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
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

      <section className="rounded-3xl bg-surface-layer p-6 shadow-soft ring-1 ring-border-subtle sm:p-8">
        {loading ? (
          <div
            className="min-h-[320px] animate-pulse rounded-[2rem] bg-gradient-to-br from-brand/10 via-surface-elevated to-brand/5 p-6 sm:min-h-[360px] sm:p-8"
            role="status"
            aria-label="Loading shared opportunity"
          >
            <div className="flex min-h-[272px] flex-col justify-between sm:min-h-[296px]">
              <div className="space-y-5">
                <div className="h-3 w-28 rounded-full bg-brand/20" />
                <div className="space-y-3">
                  <div className="h-8 w-4/5 rounded-lg bg-brand/15 sm:h-10" />
                  <div className="h-8 w-3/5 rounded-lg bg-brand/10 sm:h-10" />
                </div>
              </div>
              <div className="h-11 w-48 rounded-xl bg-brand/15" />
            </div>
            <span className="sr-only">Loading opportunity preview…</span>
          </div>
        ) : (
          <>
            {error ? (
              <p className="mb-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
                {error}
              </p>
            ) : null}

          <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            {preview.status}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            {preview.title}
          </h1>
          <Link
            to="/opportunities"
            className="mt-7 inline-flex h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-elevated transition hover:bg-brand-700"
          >
            Browse opportunities
          </Link>
          </>
        )}
      </section>
    </PublicEditorialShell>
  );
}
