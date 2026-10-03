import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { PaidToolGate } from "../feature-access/PaidToolGate";
import AccessSummary from "../feature-access/AccessSummary";
import { sendCoachTurn, type CoachTurn } from "../ai-coach/stream";
import {
  FeatureError,
  errorMessage,
  json,
  useProductSession,
} from "../workspace/shared";
import { usePaywall } from "../../hooks/usePaywall";
import { OpportunityActionGrid, getOpportunityActionTitle } from "./OpportunityActionGrid";
import { OpportunityAssistResult } from "./OpportunityAssistResult";
import { OpportunityDocumentContext } from "./OpportunityDocumentContext";
import type {
  OpportunityAssistAction,
  OpportunityAssistBusy,
  OpportunityPlan,
} from "./opportunityAssistTypes";

interface OpportunityReference {
  id: string;
  title: string;
}

interface OpportunityDocument {
  id: string;
  fileName: string;
  parseStatus: string;
}

const GUIDANCE_PROMPTS: Record<Exclude<OpportunityAssistAction, "plan">, string> = {
  fit_check:
    "Assess my fit for this opportunity. Explain known requirements and anything I should verify.",
  next_move:
    "Help me decide my next practical step for this opportunity.",
  review_doc:
    "Review my uploaded document against this opportunity and suggest concrete improvements.",
  whats_missing:
    "What is missing from my preparation for this opportunity? Distinguish known gaps from requirements I need to verify.",
};

export default function OpportunityAssist({
  opportunity,
}: {
  opportunity: OpportunityReference;
}) {
  const { userId } = useProductSession();

  return (
    <div className="lg:col-span-2">
      <PaidToolGate
        feature="AI opportunity preparation"
        moduleKey="chat"
        paidByDefault={false}
      >
        <OpportunityActions
          key={`${userId}:${opportunity.id}`}
          opportunity={opportunity}
        />
      </PaidToolGate>
    </div>
  );
}

function OpportunityActions({
  opportunity,
}: {
  opportunity: OpportunityReference;
}) {
  const { request, token } = useProductSession();
  const { handleUpgradeError } = usePaywall();
  const [busy, setBusy] = useState<OpportunityAssistBusy>(null);
  const [selected, setSelected] = useState<OpportunityAssistAction>("fit_check");
  const [text, setText] = useState("");
  const [turn, setTurn] = useState<CoachTurn | null>(null);
  const [plan, setPlan] = useState<OpportunityPlan | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<OpportunityDocument[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
    };
  }, []);

  async function loadDocuments() {
    if (documentsLoading) return;
    setDocumentsOpen(true);
    setDocumentsLoading(true);
    setError(null);

    try {
      const result = await request<OpportunityDocument[]>("/uploads");
      if (mounted.current) {
        setDocuments(result.filter((document) => document.parseStatus === "done"));
      }
    } catch (requestError) {
      if (mounted.current) setError(errorMessage(requestError));
    } finally {
      if (mounted.current) setDocumentsLoading(false);
    }
  }

  function toggleDocuments() {
    if (documentsOpen) {
      setDocumentsOpen(false);
      return;
    }
    void loadDocuments();
  }

  async function run(action: OpportunityAssistAction) {
    if (busy) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setSelected(action);
    setBusy(action);
    setError(null);
    setText("");
    setPlan(null);
    setTurn(null);
    setSaved(false);

    try {
      if (action === "plan") {
        const result = await request<OpportunityPlan>(
          "/roadmaps/ai/opportunity-plan",
          {
            method: "POST",
            body: json({ opportunityId: opportunity.id }),
            timeoutMs: 120000,
            signal: controller.signal,
          },
        );
        if (!controller.signal.aborted) setPlan(result);
      } else {
        const authToken = await token();
        controller.signal.throwIfAborted();
        const result = await sendCoachTurn(
          authToken,
          {
            message: GUIDANCE_PROMPTS[action],
            intent: action,
            context: {
              surface: "opportunity_detail",
              opportunityId: opportunity.id,
              ...(documentId ? { uploadId: documentId } : {}),
            },
          },
          controller.signal,
          (value) => {
            if (!controller.signal.aborted) setText(value);
          },
        );
        if (!controller.signal.aborted) setTurn(result);
      }

      if (!controller.signal.aborted) {
        window.dispatchEvent(new Event("edutu:ai-complete"));
      }
    } catch (requestError) {
      if (!controller.signal.aborted && mounted.current) {
        handleUpgradeError(requestError);
        setError(errorMessage(requestError));
      }
    } finally {
      if (mounted.current) {
        setBusy(null);
        activeRequest.current = null;
      }
    }
  }

  function chooseAction(action: OpportunityAssistAction) {
    setSelected(action);
    if (action === "review_doc" && !documentId) {
      setError(null);
      setText("");
      setPlan(null);
      setTurn(null);
      setSaved(false);
      void loadDocuments();
      return;
    }
    void run(action);
  }

  async function savePlan() {
    if (!plan || busy || saved) return;
    setBusy("save");
    setError(null);

    try {
      const description = [
        plan.summary,
        plan.winningStrategy,
        "Checklist",
        ...plan.checklist,
        "Support",
        ...plan.supportActions,
        ...plan.requirementActions.map((item) => `${item.requirement}: ${item.action}`),
        ...plan.profileGaps.map((item) => `${item.gap}: ${item.action}`),
        ...plan.bestPractices,
      ]
        .join("\n\n")
        .slice(0, 5000);

      await request("/roadmaps/mine", {
        method: "POST",
        body: json({
          title: `Prepare: ${opportunity.title}`.slice(0, 200),
          description,
          category: "general",
          opportunityId: opportunity.id,
          steps: plan.milestones.map((milestone) => ({
            title: milestone.title,
            description: milestone.description,
          })),
        }),
        timeoutMs: 120000,
      });

      if (mounted.current) setSaved(true);
    } catch (requestError) {
      if (mounted.current) {
        handleUpgradeError(requestError);
        setError(
          `The plan wasn't confirmed as saved. Check your preparation plans before retrying. ${errorMessage(requestError)}`,
        );
      }
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-subtle bg-surface-layer p-5 sm:p-6">
      <header className="mb-5">
        <h2 className="text-lg font-semibold text-text-primary">Prepare with AI</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-text-muted">
          Get guidance for this opportunity. Confirm final requirements with the official provider.
        </p>
      </header>

      <OpportunityActionGrid
        selected={selected}
        busy={busy}
        onSelect={chooseAction}
      />

      <div className="mt-4 border-t border-subtle pt-3">
        <AccessSummary
          action={selected === "plan" ? "roadmapGeneration" : "chatMessage"}
        />
      </div>

      <OpportunityDocumentContext
        documents={documents}
        selectedId={documentId}
        isOpen={documentsOpen}
        isLoading={documentsLoading}
        onToggle={toggleDocuments}
        onChange={setDocumentId}
      />

      {busy && (
        <div role="status" className="mt-4 flex items-center gap-2 text-sm text-text-muted">
          <Loader2 className="animate-spin" size={16} aria-hidden="true" />
          <span>{busy === "save" ? "Saving your plan…" : "Preparing your guidance…"}</span>
          {busy !== "save" && (
            <button
              type="button"
              className="ml-auto min-h-9 px-2 font-medium text-text-secondary underline underline-offset-4"
              onClick={() => {
                activeRequest.current?.abort();
                setText("");
                setError(
                  "Stopped. Your request may already have used allowance; check Coach history before trying again.",
                );
              }}
            >
              Stop
            </button>
          )}
        </div>
      )}

      <FeatureError error={error} />
      <OpportunityAssistResult
        opportunityId={opportunity.id}
        selectedTitle={getOpportunityActionTitle(selected)}
        text={text}
        turn={turn}
        plan={plan}
        busy={busy}
        saved={saved}
        onSavePlan={() => void savePlan()}
      />
    </section>
  );
}
