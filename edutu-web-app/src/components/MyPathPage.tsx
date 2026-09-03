import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Compass, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Button from "./ui/Button";
import JourneyCard from "./opportunity-path/JourneyCard";
import { useWebFeatureFlag } from "../hooks/useWebFeatureFlag";
import {
  listOpportunityJourneys,
  type OpportunityJourneyView,
  type OpportunityPublicStage,
} from "../services/opportunityJourney";

const TABS: Array<{ key: OpportunityPublicStage; label: string }> = [
  { key: "pursuing", label: "Pursuing" },
  { key: "discover", label: "Shortlist" },
  { key: "applied", label: "Applied" },
  { key: "outcome", label: "Closed" },
];

export default function MyPathPage() {
  const enabled = useWebFeatureFlag("opportunity_my_path");
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [stage, setStage] = useState<OpportunityPublicStage>("pursuing");
  const [items, setItems] = useState<OpportunityJourneyView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      const token = await getToken();
      if (!token) throw new Error("Sign in to view your opportunity path.");
      const result = await listOpportunityJourneys(token, stage);
      if (active) setItems(result);
    })()
      .catch((nextError) => {
        if (active) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Unable to load your opportunity path.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [getToken, reload, stage]);

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-subtle bg-surface-layer p-6 text-text-secondary shadow-sm">
        My Path is not enabled for this account yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-600">
            Intentional opportunity journey
          </p>
          <h1 className="mt-1 text-2xl font-bold text-text-primary">My Path</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Track active opportunities and the one action that moves each forward.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setReload((value) => value + 1)}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </header>

      <div className="flex gap-2 overflow-x-auto border-b border-subtle pb-2" role="tablist" aria-label="Opportunity journey stages">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={stage === tab.key}
            onClick={() => setStage(tab.key)}
            className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-semibold transition ${
              stage === tab.key
                ? "bg-brand-500 text-white"
                : "bg-surface-layer text-text-secondary hover:bg-surface-elevated"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-text-secondary">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-subtle bg-surface-layer p-8 text-center text-sm text-text-secondary shadow-sm">
          Loading your path…
        </div>
      ) : items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <JourneyCard
              key={item.journey.id}
              item={item}
              onContinue={() =>
                navigate(
                  `/app/opportunities/${encodeURIComponent(item.journey.opportunityId)}`,
                )
              }
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-subtle bg-surface-layer p-8 text-center shadow-sm">
          <Compass className="mx-auto h-8 w-8 text-brand-600" />
          <h2 className="mt-3 font-bold text-text-primary">
            No opportunities in this stage
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Explore relevant opportunities and choose one worth your time.
          </p>
          <Button type="button" className="mt-4" onClick={() => navigate("/app/opportunities")}>
            Explore opportunities
          </Button>
        </div>
      )}
    </div>
  );
}
