import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../ui/Button";
import {
  createOpportunityJourney,
  createOpportunityJourneyIdempotencyKey,
  listOpportunityJourneys,
  type OpportunityJourneyView,
  type OpportunityPublicStage,
} from "../../services/opportunityJourney";
import { useOpportunityJourney } from "../../hooks/useOpportunityJourney";
import ApplicationConfirmationDialog from "./ApplicationConfirmationDialog";
import JourneyStatusBadge from "./JourneyStatusBadge";

const STAGES: OpportunityPublicStage[] = [
  "discover",
  "pursuing",
  "applied",
  "outcome",
];

export default function OpportunityJourneyActions({
  token,
  opportunityId,
  opportunityTitle,
  applicationUrl,
}: {
  token: string;
  opportunityId: string;
  opportunityTitle: string;
  applicationUrl?: string | null;
}) {
  const navigate = useNavigate();
  const [seed, setSeed] = useState<OpportunityJourneyView | null>(null);
  const [loadingSeed, setLoadingSeed] = useState(true);
  const [creating, setCreating] = useState<"shortlist" | "pursue" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingSeed(true);
    void Promise.all(STAGES.map((stage) => listOpportunityJourneys(token, stage)))
      .then((groups) => {
        if (!active) return;
        setSeed(
          groups
            .flat()
            .find((item) => item.journey.opportunityId === opportunityId) ??
            null,
        );
      })
      .catch((nextError) => {
        if (active) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Unable to load your opportunity status.",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingSeed(false);
      });
    return () => {
      active = false;
    };
  }, [opportunityId, token]);

  const journey = useOpportunityJourney({
    token,
    journeyId: seed?.journey.id,
    enabled: Boolean(seed?.journey.id),
    onChanged: setSeed,
  });
  const current = journey.data ?? seed;

  const action = useMemo(() => {
    if (!current) return "pursue" as const;
    return current.nextAction.key;
  }, [current]);

  const create = async (kind: "shortlist" | "pursue") => {
    setCreating(kind);
    setError(null);
    try {
      const result = await createOpportunityJourney(token, {
        opportunityId,
        action: kind,
        idempotencyKey: createOpportunityJourneyIdempotencyKey(kind),
      });
      setSeed(result);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to update this opportunity.",
      );
    } finally {
      setCreating(null);
    }
  };

  const openOfficialApplication = async () => {
    if (!current || !applicationUrl) return;
    const popup = window.open("about:blank", "_blank", "noopener,noreferrer");
    try {
      await journey.markApplicationOpened();
      if (popup) popup.location.href = applicationUrl;
      else window.open(applicationUrl, "_blank", "noopener,noreferrer");
    } catch (nextError) {
      popup?.close();
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to open the official application.",
      );
    }
  };

  const confirmSubmitted = async () => {
    setConfirming(true);
    try {
      await journey.confirmApplication();
    } finally {
      setConfirming(false);
    }
  };

  const withdraw = async () => {
    setConfirming(true);
    try {
      await journey.recordOutcome("withdrawn");
    } finally {
      setConfirming(false);
    }
  };

  if (loadingSeed) {
    return (
      <div className="rounded-xl border border-subtle bg-surface-layer p-4 text-sm text-text-secondary">
        Loading your opportunity status…
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-subtle bg-surface-layer p-4 shadow-sm">
      {current ? (
        <div className="flex items-center justify-between gap-3">
          <JourneyStatusBadge state={current.journey.state} />
          <span className="text-xs font-semibold text-text-muted">
            {current.progress.percent}% complete
          </span>
        </div>
      ) : null}

      {error || journey.error ? (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-text-secondary">
          {error ||
            (journey.error instanceof Error
              ? journey.error.message
              : "Unable to update this opportunity.")}
        </p>
      ) : null}

      {!current ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            disabled={Boolean(creating)}
            onClick={() => void create("pursue")}
          >
            {creating === "pursue" ? "Starting…" : "Pursue this opportunity"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={Boolean(creating)}
            onClick={() => void create("shortlist")}
          >
            {creating === "shortlist" ? "Saving…" : "Save for later"}
          </Button>
        </div>
      ) : action === "activate" ? (
        <Button
          type="button"
          className="w-full"
          disabled={journey.isMutating}
          onClick={() => void journey.transition("pursuing")}
        >
          Make this an active pursuit
        </Button>
      ) : action === "continue_task" ? (
        <Button
          type="button"
          className="w-full"
          onClick={() => navigate(`/app/my-path?journey=${current.journey.id}`)}
        >
          Continue: {current.nextAction.label}
        </Button>
      ) : action === "open_application" ? (
        <Button
          type="button"
          className="w-full"
          disabled={!applicationUrl || journey.isMutating}
          onClick={() => void openOfficialApplication()}
        >
          Open official application
        </Button>
      ) : action === "confirm_application" ? (
        <Button
          type="button"
          className="w-full"
          onClick={() => setConfirming(true)}
        >
          Confirm application status
        </Button>
      ) : action === "update_outcome" ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => navigate(`/app/my-path?journey=${current.journey.id}`)}
        >
          Update application outcome
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => navigate(`/app/my-path?journey=${current.journey.id}`)}
        >
          Review your journey
        </Button>
      )}

      {current?.nextAction.key === "open_application" && !applicationUrl ? (
        <p className="text-xs text-text-muted">
          The official application URL is not currently available. Edutu will
          not mark this opportunity as submitted.
        </p>
      ) : null}

      <ApplicationConfirmationDialog
        open={
          Boolean(current) &&
          current?.journey.state === "application_opened" &&
          confirming
        }
        opportunityTitle={opportunityTitle}
        busy={journey.isMutating}
        onSubmitted={() => void confirmSubmitted()}
        onNotYet={() => setConfirming(false)}
        onWithdraw={() => void withdraw()}
      />
    </section>
  );
}
