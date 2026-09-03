import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Button from "../ui/Button";
import { useWebFeatureFlag } from "../../hooks/useWebFeatureFlag";
import { useOpportunityHome } from "../../hooks/useOpportunityHome";
import { createPursuit } from "../../hooks/useOpportunityJourney";
import {
  createOpportunityJourneyIdempotencyKey,
  saveOpportunityIntent,
  type IntentRecommendationView,
  type OpportunityJourneyView,
} from "../../services/opportunityJourney";
import { passFocusedOpportunity } from "../../services/opportunityJourneySignals";
import ActivePursuitsSection from "./ActivePursuitsSection";
import CurrentFocusCard from "./CurrentFocusCard";
import CurrentFocusDialog from "./CurrentFocusDialog";
import FocusedRecommendationsSection from "./FocusedRecommendationsSection";
import NextActionCard from "./NextActionCard";

export default function IntentionalOpportunityHomeSection() {
  const enabled = useWebFeatureFlag("opportunity_pipeline_home");
  const { getToken, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [editingFocus, setEditingFocus] = useState(false);
  const [savingFocus, setSavingFocus] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<{
    opportunityId: string;
    action: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!enabled || !isSignedIn) {
      setToken(null);
      return;
    }
    void getToken().then((value) => {
      if (active) setToken(value);
    });
    return () => {
      active = false;
    };
  }, [enabled, getToken, isSignedIn]);

  const { data, error, isLoading, refresh } = useOpportunityHome({
    token,
    enabled: enabled && Boolean(token),
    recommendationLimit: 3,
  });

  const recommendations = useMemo(
    () =>
      (data?.recommendations ?? []).filter(
        (item) => !hiddenIds.includes(item.id),
      ),
    [data?.recommendations, hiddenIds],
  );

  if (!enabled || !isSignedIn) return null;

  const openOpportunity = (opportunityId: string) =>
    navigate(`/app/opportunities/${encodeURIComponent(opportunityId)}`);
  const openJourney = (item: OpportunityJourneyView) =>
    openOpportunity(item.journey.opportunityId);

  const decide = async (
    item: IntentRecommendationView,
    action: "pursue" | "shortlist",
  ) => {
    if (!token) return;
    setActionError(null);
    setBusy({ opportunityId: item.id, action });
    try {
      await createPursuit(token, item.id, action);
      setHiddenIds((current) => [...current, item.id]);
      await refresh();
    } catch (nextError) {
      setActionError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to update this opportunity.",
      );
    } finally {
      setBusy(null);
    }
  };

  const pass = async (item: IntentRecommendationView) => {
    if (!token) return;
    setActionError(null);
    setBusy({ opportunityId: item.id, action: "pass" });
    setHiddenIds((current) => [...current, item.id]);
    try {
      await passFocusedOpportunity({
        token,
        opportunityId: item.id,
        batchId:
          typeof (data as Record<string, unknown> | null)?.recommendationBatchId ===
          "string"
            ? String(
                (data as Record<string, unknown>).recommendationBatchId,
              )
            : null,
      });
    } catch (nextError) {
      setActionError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to record this decision.",
      );
    } finally {
      setBusy(null);
    }
  };

  const saveFocus = async (goalKey: string) => {
    if (!token || !data?.intent) return;
    setSavingFocus(true);
    setActionError(null);
    try {
      await saveOpportunityIntent(
        token,
        {
          goalKey,
          opportunityTypes: data.intent.opportunityTypes,
          locations: data.intent.locations,
          remotePreference: data.intent.remotePreference,
          actionHorizonDays: data.intent.actionHorizonDays,
          weeklyHours: data.intent.weeklyHours,
          readinessMode: data.intent.readinessMode,
        },
        createOpportunityJourneyIdempotencyKey("intent"),
      );
      setEditingFocus(false);
      await refresh();
    } catch (nextError) {
      setActionError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to update your focus.",
      );
    } finally {
      setSavingFocus(false);
    }
  };

  if (isLoading && !data) {
    return (
      <section className="rounded-2xl border border-subtle bg-surface-layer p-6 text-sm text-text-secondary shadow-sm">
        Preparing your opportunity path…
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-2xl border border-subtle bg-surface-layer p-5 shadow-sm">
        <h2 className="font-bold text-text-primary">
          Your opportunity path could not load
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {error instanceof Error ? error.message : "Please try again."}
        </p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </section>
    );
  }

  const priority = data.activePursuits[0] ?? null;

  return (
    <div className="space-y-6" data-testid="intentional-opportunity-home">
      {actionError ? (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-text-secondary">
          {actionError}
        </p>
      ) : null}
      <CurrentFocusCard
        intent={data.intent}
        onEdit={() => setEditingFocus(true)}
      />
      {data.nextAction && priority ? (
        <NextActionCard
          action={data.nextAction}
          progress={priority.progress}
          onContinue={() => openJourney(priority)}
        />
      ) : null}
      <ActivePursuitsSection items={data.activePursuits} onOpen={openJourney} />
      <FocusedRecommendationsSection
        items={recommendations}
        busy={busy}
        degraded={data.degraded}
        onOpen={(item) => openOpportunity(item.id)}
        onPursue={(item) => void decide(item, "pursue")}
        onShortlist={(item) => void decide(item, "shortlist")}
        onPass={(item) => void pass(item)}
      />
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate("/app/my-path")}
        >
          View My Path
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      <CurrentFocusDialog
        open={editingFocus}
        intent={data.intent}
        saving={savingFocus}
        onClose={() => setEditingFocus(false)}
        onSelect={(goalKey) => void saveFocus(goalKey)}
      />
    </div>
  );
}
