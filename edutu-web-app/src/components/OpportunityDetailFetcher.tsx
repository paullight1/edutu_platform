import React, { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { getCachedOpportunitySync, getOpportunity } from "../services/opportunities";
import type { Opportunity } from "../types/opportunity";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";

const OpportunityDetail = React.lazy(() => import("./OpportunityDetail"));

interface OpportunityDetailFetcherProps {
  onBack: () => void;
  embedded?: boolean;
}

function isOpportunityLike(value: unknown, id: string): value is Opportunity {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Opportunity).id === id &&
      typeof (value as Opportunity).title === "string",
  );
}

function DetailSkeleton() {
  return (
    <main className="mx-auto w-full max-w-4xl animate-pulse px-4 py-6 sm:px-6 lg:px-8">
      <div className="h-4 w-28 rounded bg-surface-elevated" />
      <div className="mt-5 aspect-[16/7] w-full rounded-lg bg-surface-elevated" />
      <div className="mt-6 flex gap-2">
        <div className="h-6 w-24 rounded-md bg-surface-elevated" />
        <div className="h-6 w-16 rounded-md bg-surface-elevated" />
      </div>
      <div className="mt-4 h-8 w-3/4 rounded bg-surface-elevated" />
      <div className="mt-3 h-4 w-1/3 rounded bg-surface-elevated" />
      <div className="mt-8 space-y-3">
        <div className="h-4 w-full rounded bg-surface-elevated" />
        <div className="h-4 w-full rounded bg-surface-elevated" />
        <div className="h-4 w-5/6 rounded bg-surface-elevated" />
        <div className="h-4 w-2/3 rounded bg-surface-elevated" />
      </div>
      <div className="mt-8 h-12 w-full rounded-md bg-surface-elevated sm:w-56" />
    </main>
  );
}

const OpportunityDetailFetcher: React.FC<OpportunityDetailFetcherProps> = ({
  onBack,
  embedded = false,
}) => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  // Instant paint: prefer the opportunity handed over by the link that
  // navigated here, then the list cache — the network only fills gaps.
  const resolveInitial = (): Opportunity | null => {
    if (!id) return null;
    const fromState = (location.state as { opportunity?: unknown } | null)
      ?.opportunity;
    if (isOpportunityLike(fromState, id)) {
      return fromState;
    }
    return getCachedOpportunitySync(id);
  };

  const [opportunity, setOpportunity] = useState<Opportunity | null>(
    resolveInitial,
  );
  const [loading, setLoading] = useState(() => !opportunity && Boolean(id));

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    let isActive = true;
    const known = resolveInitial();
    setOpportunity(known);
    setLoading(!known);

    // Always revalidate so a stale cached row (edited deadline, fixed link)
    // self-corrects, but without blocking the already-painted view.
    getOpportunity(id)
      .then((result) => {
        if (!isActive) return;
        if (result) {
          setOpportunity(result);
        } else if (!known) {
          setOpportunity(null);
        }
      })
      .catch(() => {
        // Keep whatever we already rendered; cold loads fall through to the
        // not-found state below.
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id) {
    return <Navigate to="/opportunities" replace />;
  }

  if (loading && !opportunity) {
    if (embedded) {
      return <DetailSkeleton />;
    }

    return (
      <PublicEditorialShell>
        <DetailSkeleton />
      </PublicEditorialShell>
    );
  }

  if (!opportunity) {
    if (embedded) {
      return (
        <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <Seo
            title="Opportunity not found | Edutu"
            description="This Edutu opportunity could not be found. Browse updated scholarships, internships, fellowships, grants, and programs."
            path={`/opportunity/${id}`}
            noindex
          />
          <section className="rounded-2xl border border-subtle bg-surface-layer p-6 shadow-soft">
            <p className="text-sm font-semibold text-brand">
              Opportunity unavailable
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text-primary">
              This opportunity is no longer available
            </h1>
            <p className="mt-3 text-base leading-7 text-text-secondary">
              Browse the latest Edutu opportunities to find active scholarships,
              internships, fellowships, grants, and programs.
            </p>
            <Link
              to="/app/opportunities"
              className="mt-5 inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-elevated transition hover:bg-brand-700"
            >
              Browse opportunities
            </Link>
          </section>
        </main>
      );
    }

    return (
      <PublicEditorialShell mainClassName="max-w-3xl py-8">
        <Seo
          title="Opportunity not found | Edutu"
          description="This Edutu opportunity could not be found. Browse updated scholarships, internships, fellowships, grants, and programs."
          path={`/opportunity/${id}`}
          noindex
        />
        <section className="rounded-2xl border border-subtle bg-surface-layer p-6 shadow-soft">
          <p className="text-sm font-semibold text-brand">
            Opportunity unavailable
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text-primary">
            This opportunity is no longer available
          </h1>
          <p className="mt-3 text-base leading-7 text-text-secondary">
            Browse the latest Edutu opportunities to find active scholarships,
            internships, fellowships, grants, and programs.
          </p>
          <Link
            to="/opportunities"
            className="mt-5 inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-elevated transition hover:bg-brand-700"
          >
            Browse opportunities
          </Link>
        </section>
      </PublicEditorialShell>
    );
  }

  return (
    <React.Suspense
      fallback={
        embedded ? (
          <DetailSkeleton />
        ) : (
          <PublicEditorialShell>
            <DetailSkeleton />
          </PublicEditorialShell>
        )
      }
    >
      <OpportunityDetail
        opportunity={opportunity}
        onBack={onBack}
        embedded={embedded}
      />
    </React.Suspense>
  );
};

export default OpportunityDetailFetcher;
