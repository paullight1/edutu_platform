import { WorkspaceText } from "../workspace/shared";
import { useDraftRecovery, DraftRecovery } from "../workspace/useDraftRecovery";
import AccessSummary from "../feature-access/AccessSummary";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  FeaturePage,
  FeatureError,
  Loading,
  errorMessage,
  json,
  useProductSession,
} from "../workspace/shared";
import { downloadText } from "../cv/export";
import { usePaywall } from "../../hooks/usePaywall";
interface Outline {
  thesis: string;
  hook?: string;
  sections: { heading: string; points: string[] }[];
  closing?: string;
  avoid: string[];
}
interface Feedback {
  overallScore: number;
  verdict: string;
  strengths: string[];
  improvements: string[];
  lineEdits: { original: string; suggestion: string; reason?: string }[];
  revisedOpening?: string;
}
interface Essay {
  promptId: string;
  draft?: string;
  outline?: Outline;
  feedback?: Feedback;
}
interface Kit {
  id: string;
  opportunityId: string;
  updatedAt: string;
  generatedBy: string;
  profileGrounded?: boolean;
  opportunity?: { title: string; organization?: string; deadline?: string };
  checklistState: Record<string, boolean>;
  essays: Essay[];
  kit: {
    fitNote: string;
    strategy: string[];
    gaps?: string[];
    eligibilityFlags?: { flag: string; severity: string }[];
    checklist: {
      id: string;
      label: string;
      detail?: string;
      category: string;
    }[];
    essayPrompts: {
      id: string;
      prompt: string;
      guidance?: string;
      suggestedAngle?: string;
    }[];
  };
}
interface Answer {
  kitOpportunityId: string;
  opportunityTitle: string;
  promptId: string;
  prompt: string;
  draft: string;
}
export default function CopilotPage() {
  const { request, userId } = useProductSession();
  const { refreshBilling } = usePaywall();
  const { id } = useParams();
  const [params] = useSearchParams();
  const opportunityId = id || params.get("opportunityId");
  const [kits, setKits] = useState<Kit[]>([]);
  const [kit, setKit] = useState<Kit | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promptId, setPromptId] = useState("");
  const [draft, setDraft] = useState("");
  const [savedDraft, setSavedDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [referee, setReferee] = useState("");
  const [detailTab, setDetailTab] = useState<"plan" | "checklist" | "essay">("plan");
  const dirty = draft !== savedDraft;
  const recovery = useDraftRecovery(
    `edutu.essay.draft.${userId}.${opportunityId}.${promptId}`,
    draft,
    dirty,
    !loading && !!promptId,
  );
  const select = useCallback((value: Kit) => {
    setKit(value);
    const first = value.kit.essayPrompts[0]?.id || "";
    setPromptId(first);
    const text = value.essays?.find((e) => e.promptId === first)?.draft || "";
    setDraft(text);
    setSavedDraft(text);
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (opportunityId) {
        try {
          select(await request<Kit>(`/copilot/kits/${opportunityId}`));
        } catch (e) {
          if (e && typeof e === "object" && "status" in e && e.status === 404)
            setKit(null);
          else throw e;
        }
      } else {
        const [list, bank] = await Promise.all([
          request<Kit[]>("/copilot/kits"),
          request<{ answers: Answer[] }>("/copilot/answers"),
        ]);
        setKits(list);
        setAnswers(bank.answers || []);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [opportunityId, request, select]);
  useEffect(() => {
    setKit(null);
    setKits([]);
    setAnswers([]);
    setDraft("");
    setSavedDraft("");
    void load();
  }, [load, userId]);

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      window.dispatchEvent(new Event("edutu:ai-complete"));
      void refreshBilling();
    }
  };
  const prompt = kit?.kit.essayPrompts.find((p) => p.id === promptId);
  const essay = kit?.essays?.find((e) => e.promptId === promptId);
  const changePrompt = (next: string) => {
    if (dirty && !window.confirm("Discard unsaved changes to this essay?"))
      return;
    setPromptId(next);
    const text = kit?.essays?.find((e) => e.promptId === next)?.draft || "";
    setDraft(text);
    setSavedDraft(text);
  };
  const save = () =>
    act(async () => {
      if (!kit || !opportunityId) return;
      await request(`/copilot/kits/${opportunityId}/essay`, {
        method: "PATCH",
        body: json({ promptId, draft, expectedUpdatedAt: kit.updatedAt }),
      });
      setSavedDraft(draft);
      const next = await request<Kit>(`/copilot/kits/${opportunityId}`);
      setKit(next);
      setNotice("Essay saved.");
    });
  const assist = (kind: "outline" | "feedback") =>
    act(async () => {
      if (!kit || !opportunityId) return;
      if (dirty)
        throw new Error("Save your essay before requesting AI guidance.");
      await request(`/copilot/kits/${opportunityId}/${kind}`, {
        method: "POST",
        timeoutMs: 90000,
        body: json({
          promptId,
          expectedUpdatedAt: kit.updatedAt,
          ...(kind === "feedback" ? { draft } : {}),
        }),
      });
      setKit(await request<Kit>(`/copilot/kits/${opportunityId}`));
    });
  return (
    <FeaturePage
      className="tool-page"
      eyebrow=""
      title="Application Copilot"
      description=""
    >
      <FeatureError error={error} />
      {recovery.recovered && (
        <DraftRecovery
          onDiscard={recovery.discard}
          onRestore={() => {
            if (typeof recovery.recovered === "string")
              setDraft(recovery.recovered);
            recovery.discard();
          }}
        />
      )}
      {notice && (
        <p role="status" className="feature-notice">
          {notice}
        </p>
      )}
      {loading ? (
        <Loading />
      ) : error && !kit && !kits.length ? null : !opportunityId ? (
        <>
          <div className="feature-grid">
            {kits.map((k) => (
              <Link
                key={k.id}
                className="feature-panel"
                to={`/app/copilot/${k.opportunityId}`}
              >
                <p className="feature-eyebrow">
                  {k.generatedBy === "fallback"
                    ? "Starter kit"
                    : "Application kit"}
                </p>
                <h2>{k.opportunity?.title || "Application"}</h2>
                <p className="feature-muted">
                  {Object.values(k.checklistState || {}).filter(Boolean).length}{" "}
                  <WorkspaceText value="checklistItemsComplete" />
                </p>
              </Link>
            ))}
          </div>
          {!kits.length && (
            <div className="feature-panel">
              <h2>
                <WorkspaceText value="chooseAnOpportunityToBegin" />
              </h2>
              <p className="feature-muted">
                <WorkspaceText value="openAnOpportunityAndSelectPrepareApplication" />
              </p>
              <Link to="/app/opportunities" className="feature-button">
                <WorkspaceText value="exploreOpportunities" />
              </Link>
            </div>
          )}
          <section className="feature-panel mt-6">
            <h2>
              <WorkspaceText value="reusableAnswerBank" />
            </h2>
            <p className="feature-muted">
              <WorkspaceText value="yourSavedEssaysStayUsefulAcrossApplications" />
            </p>
            {answers.map((a) => (
              <article
                key={`${a.kitOpportunityId}-${a.promptId}`}
                className="feature-list-row"
              >
                <div>
                  <h3>{a.opportunityTitle}</h3>
                  <p>{a.prompt}</p>
                  <details>
                    <summary>
                      <WorkspaceText value="readSavedAnswer" />
                    </summary>
                    <p className="whitespace-pre-wrap">{a.draft}</p>
                  </details>
                </div>
                <button
                  className="feature-button secondary"
                  onClick={() => downloadText("application-answer", a.draft)}
                >
                  <WorkspaceText value="export" />
                </button>
              </article>
            ))}
          </section>
        </>
      ) : !kit ? (
        <section className="tool-empty">
          <h2>
            <WorkspaceText value="prepareThisApplication" />
          </h2>
          <p className="feature-muted">
            Create a plan, checklist and essay workspace for this opportunity.
          </p>
          <AccessSummary action="copilotKit" />
          <button
            className="feature-button"
            disabled={busy}
            onClick={() =>
              void act(async () =>
                select(
                  await request<Kit>(
                    `/copilot/kits/${opportunityId}/generate`,
                    { method: "POST", body: "{}", timeoutMs: 90000 },
                  ),
                ),
              )
            }
          >
            {busy ? "Preparing…" : "Generate application kit"}
          </button>
        </section>
      ) : (
        <>
          <div className="tool-card">
            <h2>{kit.opportunity?.title || "Application"}</h2>
            <p>{Object.values(kit.checklistState || {}).filter(Boolean).length} of {kit.kit.checklist.length} steps done</p>
          </div>
          <div className="tool-tabs copilot-tabs" role="group" aria-label="Application sections">
            <button type="button" aria-pressed={detailTab === "plan"} onClick={() => setDetailTab("plan")}>Plan</button>
            <button type="button" aria-pressed={detailTab === "checklist"} onClick={() => setDetailTab("checklist")}>Checklist</button>
            <button type="button" aria-pressed={detailTab === "essay"} onClick={() => setDetailTab("essay")}>Essay</button>
          </div>
          <div className="copilot-section" hidden={detailTab !== "plan"}>
          <div className="feature-panel">
            <p className="feature-eyebrow">
              {kit.generatedBy === "fallback"
                ? "Starter guidance · AI unavailable"
                : "Your application strategy"}
            </p>
            <h2>How to approach it</h2>
            {kit.profileGrounded === false && (
              <p className="feature-notice">
                <WorkspaceText value="completeYourProfileForMoreRelevantGuidance" />{" "}
                <Link to="/app/profile">
                  <WorkspaceText value="updateProfile" />
                </Link>
              </p>
            )}
            <p>{kit.kit.fitNote}</p>
            {kit.kit.eligibilityFlags?.map((f, i) => (
              <p key={i} className="feature-notice">
                {f.severity}: {f.flag}
              </p>
            ))}
            <ol>
              {kit.kit.strategy.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            {kit.kit.gaps?.map((g, i) => (
              <p className="feature-muted" key={i}>
                {g}
              </p>
            ))}
            <Link to={`/app/coach?opportunityId=${opportunityId}`}>
              <WorkspaceText value="discussWithAICoach" />
            </Link>
            <div className="feature-actions mt-4">
              <Link className="feature-button secondary" to="/app/documents"><WorkspaceText value="myDocuments" /></Link>
              <Link className="feature-button secondary" to={`/app/cv?opportunityId=${opportunityId}`}><WorkspaceText value="cvStudio" /></Link>
            </div>
          </div>
          </div>
          <div className="copilot-section" hidden={detailTab !== "checklist"}>
            <section className="feature-panel">
              <h2>
                <WorkspaceText value="applicationChecklist" />
              </h2>
              {kit.kit.checklist.map((item) => (
                <label className="feature-list-row" key={item.id}>
                  <input
                    type="checkbox"
                    checked={!!kit.checklistState?.[item.id]}
                    disabled={busy || dirty}
                    onChange={(e) => {
                      const done = e.target.checked;
                      void act(async () => {
                        await request(
                          `/copilot/kits/${opportunityId}/checklist`,
                          {
                            method: "PATCH",
                            body: json({ itemId: item.id, done }),
                          },
                        );
                        setKit(
                          await request<Kit>(`/copilot/kits/${opportunityId}`),
                        );
                      });
                    }}
                  />
                  <span>
                    <strong>{item.label}</strong>
                    <small className="feature-muted block">{item.detail}</small>
                  </span>
                </label>
              ))}
              <button
                className="feature-button secondary mt-4"
                onClick={() =>
                  setReferee(
                    `Subject: Recommendation request — ${kit.opportunity?.title || "my application"}\n\nDear [Referee name],\n\nI am applying for ${kit.opportunity?.title || "this opportunity"}${kit.opportunity?.organization ? ` with ${kit.opportunity.organization}` : ""}. Would you be willing to provide a recommendation?\n\n[Explain how you know each other and which experiences you hope they can highlight.]\n\n${kit.opportunity?.deadline ? `The deadline is ${new Date(kit.opportunity.deadline).toLocaleDateString()}. ` : ""}I can share my CV and application details.\n\nThank you,\n[Your name]`,
                  )
                }
              >
                <WorkspaceText value="prepareRefereeRequest" />
              </button>
              {referee && (
                <>
                  <textarea
                    aria-label="Referee request draft"
                    className="feature-field mt-3"
                    value={referee}
                    onChange={(e) => setReferee(e.target.value)}
                  />
                  <button
                    className="feature-button secondary"
                    onClick={() => downloadText("referee-request", referee)}
                  >
                    <WorkspaceText value="exportRequest" />
                  </button>
                  <p className="feature-muted">
                    <WorkspaceText value="editThePlaceholdersBeforeSharing" />
                  </p>
                </>
              )}
            </section>
          </div>
          <div className="copilot-section" hidden={detailTab !== "essay"}>
            <section className="feature-panel">
              <h2>
                <WorkspaceText value="essayWorkspace" />
              </h2>
              <AccessSummary action="copilotKit" />
              {!prompt ? (
                <p className="feature-muted">
                  <WorkspaceText value="thisKitHasNoEssayPrompts" />
                </p>
              ) : (
                <>
                  <label className="feature-label">
                    <WorkspaceText value="prompt" />
                    <select
                      className="feature-field mt-2"
                      value={promptId}
                      disabled={busy}
                      onChange={(e) => changePrompt(e.target.value)}
                    >
                      {kit.kit.essayPrompts.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.prompt}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>{prompt.guidance}</p>
                  <p className="feature-muted">{prompt.suggestedAngle}</p>
                  <textarea
                    aria-label="Essay draft"
                    className="feature-field min-h-64 mt-3"
                    maxLength={20000}
                    value={draft}
                    disabled={busy}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <p className="feature-muted">
                    {draft.trim().split(/\s+/).filter(Boolean).length}{" "}
                    <WorkspaceText value="words" />{" "}
                    {dirty ? "Unsaved changes" : "Saved version"}
                  </p>
                  <div className="feature-actions">
                    <button
                      className="feature-button"
                      disabled={busy || !dirty}
                      onClick={() => void save()}
                    >
                      <WorkspaceText value="saveEssay" />
                    </button>
                    <button
                      className="feature-button secondary"
                      disabled={busy || dirty}
                      onClick={() => void assist("outline")}
                    >
                      <WorkspaceText value="suggestOutline" />
                    </button>
                    <button
                      className="feature-button secondary"
                      disabled={busy || dirty || draft.length < 40}
                      onClick={() => void assist("feedback")}
                    >
                      <WorkspaceText value="getFeedback" />
                    </button>
                    <button
                      className="feature-button secondary"
                      onClick={() => downloadText("essay", draft)}
                    >
                      <WorkspaceText value="export" />
                    </button>
                  </div>
                  {essay?.outline && (
                    <details open className="mt-4">
                      <summary>
                        <WorkspaceText value="suggestedOutline" />
                      </summary>
                      <p>{essay.outline.thesis}</p>
                      <p>{essay.outline.hook}</p>
                      {essay.outline.sections.map((s, i) => (
                        <div key={i}>
                          <h3>{s.heading}</h3>
                          <ul>
                            {s.points.map((p, j) => (
                              <li key={j}>{p}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      <p>{essay.outline.closing}</p>
                      {essay.outline.avoid.map((a, i) => (
                        <p key={i} className="feature-muted">
                          <WorkspaceText value="avoid" /> {a}
                        </p>
                      ))}
                    </details>
                  )}
                  {essay?.feedback && (
                    <details open className="mt-4">
                      <summary>
                        <WorkspaceText value="feedback" />{" "}
                        {essay.feedback.overallScore}/100
                      </summary>
                      <p>{essay.feedback.verdict}</p>
                      <h3>
                        <WorkspaceText value="strengths" />
                      </h3>
                      {essay.feedback.strengths.map((s, i) => (
                        <p key={i}>{s}</p>
                      ))}
                      <h3>
                        <WorkspaceText value="suggestedImprovements" />
                      </h3>
                      {essay.feedback.improvements.map((s, i) => (
                        <p key={i}>{s}</p>
                      ))}
                      {essay.feedback.lineEdits.map((e, i) => (
                        <div key={i}>
                          <del>{e.original}</del>
                          <p>{e.suggestion}</p>
                          <small>{e.reason}</small>
                        </div>
                      ))}
                      <p>{essay.feedback.revisedOpening}</p>
                      <p className="feature-muted">
                        <WorkspaceText value="suggestionsDoNotChangeYourSavedEssay" />
                      </p>
                    </details>
                  )}
                </>
              )}
            </section>
          </div>
        </>
      )}
    </FeaturePage>
  );
}
