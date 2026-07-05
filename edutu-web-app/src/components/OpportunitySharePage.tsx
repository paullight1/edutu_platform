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

      <section className="rounded-3xl bg-surface-layer p-6 shadow-soft ring-1 ring-border-subtle sm:p-8">
        {loading ? (
          <div className="flex min-h-[220px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
          </div>
        ) : (
          <>
            {error ? (
              <p className="mb-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
                {error}
              </p>
            ) : null}

          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
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
