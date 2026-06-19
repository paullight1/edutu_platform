import React, { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { getOpportunity } from "../services/opportunities";
import type { Opportunity } from "../types/opportunity";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";

const OpportunityDetail = React.lazy(() => import("./OpportunityDetail"));

interface OpportunityDetailFetcherProps {
  onBack: () => void;
}

const OpportunityDetailFetcher: React.FC<OpportunityDetailFetcherProps> = ({
  onBack,
}) => {
  const { id } = useParams<{ id: string }>();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    let isActive = true;
    setLoading(true);

    getOpportunity(id)
      .then((result) => {
        if (isActive) {
          setOpportunity(result);
        }
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [id]);

  if (!id) {
    return <Navigate to="/opportunities" replace />;
  }

  if (loading) {
    return (
      <PublicEditorialShell>
        <div className="flex min-h-[calc(100dvh-180px)] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      </PublicEditorialShell>
    );
  }

  if (!opportunity) {
    return (
      <PublicEditorialShell mainClassName="max-w-3xl py-8">
        <Seo
          title="Opportunity not found | Edutu"
          description="This Edutu opportunity could not be found. Browse updated scholarships, internships, fellowships, grants, and programs."
          path={`/opportunity/${id}`}
          noindex
        />
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-950">
          <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">
            Opportunity unavailable
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">
            This opportunity is no longer available
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">
            Browse the latest Edutu opportunities to find active scholarships,
            internships, fellowships, grants, and programs.
          </p>
          <Link
            to="/opportunities"
            className="mt-5 inline-flex rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
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
        <PublicEditorialShell>
          <div className="flex min-h-[calc(100dvh-180px)] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          </div>
        </PublicEditorialShell>
      }
    >
      <OpportunityDetail opportunity={opportunity} onBack={onBack} />
    </React.Suspense>
  );
};

export default OpportunityDetailFetcher;
