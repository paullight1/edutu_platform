import { WorkspaceText } from "../workspace/shared";
import { useDraftRecovery, DraftRecovery } from "../workspace/useDraftRecovery";
import AccessSummary from "../feature-access/AccessSummary";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, PencilLine, Plus, Save, Sparkles, Trash2, ArrowLeft, ArrowRight, Upload, ChevronRight, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  FeaturePage,
  Loading,
  errorMessage,
  json,
  useProductSession,
} from "../workspace/shared";
import { usePaywall } from "../../hooks/usePaywall";
import {
  CV_TEMPLATE_COPY,
  isPremiumCvTemplate,
  resolveTemplateDesignById,
} from "./templates";
import { analyzeCv } from "./health";
import { buildCVHtml, buildCVText, downloadText, printCV, downloadCVPdf } from "./export";
import type { CVData } from "./types";
import { SECTION_FIELDS, type CvSection, type EditorCv } from "./api";
import "./cvPage.css";
import { CvPdfDownload } from "./CvExportActions";
import { CvPreview } from "./CvPreview";
import { CvDialog } from "./CvDialog";
import { CvTemplatePicker } from "./CvTemplatePicker";
import { CvTemplatePreview } from "./CvTemplatePreview";
import { CV_CREATE_EVENT } from "./cvEvents";
import { CvLibrary } from "./CvLibrary";
const initial = () => ({
  header: { full_name: "", email: "" },
  summary: "",
  skills: [],
});
const TEMPLATE_GALLERY_SAMPLE_CV = {
  header: {
    full_name: "Alex Morgan",
    email: "alex.morgan@example.com",
    location: "Lagos, Nigeria",
  },
  summary:
    "Curious product designer who turns research into clear, useful digital experiences.",
  skills: ["Research", "Product design", "Prototyping"],
  experience: [
    {
      id: "sample-experience",
      role: "Product design intern",
      company: "Northstar Studio",
      start_date: "2024",
      end_date: "2025",
      description:
        "Worked with a small team to improve onboarding and make core tasks easier to complete.",
    },
  ],
  education: [
    {
      id: "sample-education",
      degree: "BSc, Computer Science",
      institution: "University of Lagos",
      start_date: "2021",
      end_date: "2025",
    },
  ],
  projects: [
    {
      id: "sample-project",
      name: "Campus Connect",
      description:
        "Designed a mobile experience that helps students find study groups.",
    },
  ],
  research: [
    {
      id: "sample-research",
      title: "Designing more inclusive student services",
      institution: "University of Lagos",
      role: "Research assistant",
      start_date: "2024",
      description: "Interviewed students and summarized the main service gaps.",
    },
  ],
  publications: [
    {
      id: "sample-publication",
      title: "Small changes that improve student onboarding",
      journal: "Student Experience Review",
      date: "2025",
    },
  ],
  achievements: [
    {
      id: "sample-achievement",
      title: "Faculty project showcase finalist",
      description: "Selected from 40 student projects.",
      date: "2025",
    },
  ],
};
function CvError({ error }: { error: string | null }) {
  return error ? <div className="feature-error" role="alert"><p>{error}</p></div> : null;
}
function SkillsEditor({ skills, disabled, onChange }: {skills: string[];disabled: boolean;onChange: (skills: string[]) => void}) {
  const [text, setText] = useState(() => skills.join(", "));
  const canonical = skills.map(skill => skill.trim()).filter(Boolean).join(", ");
  useEffect(() => {
    setText(current => current.split(",").map(skill => skill.trim()).filter(Boolean).join(", ") === canonical ? current : canonical);
  }, [canonical]);
  return <label className="feature-label"><WorkspaceText value="skillsCommaSeparated"/><textarea className="feature-field mt-2" rows={4} value={text} disabled={disabled} placeholder="Research, Python, project coordination" onChange={event => {const next=event.target.value;setText(next);onChange(next.split(",").map(skill => skill.trim()).filter(Boolean));}}/><small className="cv-field-help">Separate skills with commas. Include tools and abilities you can demonstrate.</small></label>;
}

export default function CvPage() {
  const { request, userId } = useProductSession();
  const {
    isPro,
    billingLoading,
    openPaywall,
    handleUpgradeError,
    refreshBilling,
  } = usePaywall();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [cvs, setCvs] = useState<EditorCv[]>([]);
  const [record, setRecord] = useState<EditorCv | null>(null);
  const [name, setName] = useState("My CV");
  const [data, setData] = useState<Record<string, unknown>>(initial);
  const [template, setTemplate] = useState("minimal-ats");
  const [showTemplateChoices, setShowTemplateChoices] = useState(false);
  const changeDesignButton = useRef<HTMLButtonElement>(null);
  const focusChangeDesignButton = useRef(false);
  const [section, setSection] = useState<
    "basics" | "summary" | "skills" | CvSection
  >("basics");
  const [view, setView] = useState<"edit" | "preview" | "ai" | null>(null);
  const [returnView, setReturnView] = useState<"edit" | null>(null);
  const [aiKind, setAiKind] = useState<"draft" | "tailor" | "letter">("draft");
  const [search, setSearch] = useState("");
  const [opportunityLabel, setOpportunityLabel] = useState("");
  const [matches, setMatches] = useState<{ id: string; title: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [copyOnApply, setCopyOnApply] = useState(false);
  const [proposalOrigin, setProposalOrigin] = useState<"ai" | "import">("ai");
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [renameTarget, setRenameTarget] = useState<EditorCv | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Record<string, unknown> | null>(
    null,
  );
  const [notes, setNotes] = useState("");
  const [opportunity, setOpportunity] = useState(
    params.get("opportunityId") || "",
  );
  const [letter, setLetter] = useState("");
  const [analysis, setAnalysis] = useState<string[]>([]);
  const wizardNav = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const createCvHandler = useRef<() => void>(() => {});
  const current = json({ name, data, template });
  const dirty = !!saved && current !== saved;
  const recovery = useDraftRecovery(
    `edutu.cv.draft.${userId}.${record?.id || "new"}`,
    { name, data, template },
    dirty,
    !loading,
  );
  const cv = useMemo(
    () => ({
      name,
      template_id: template,
      data_json: data as unknown as CVData,
    }),
    [name, template, data],
  );
  const html = useMemo(() => buildCVHtml(cv), [cv]);
  const health = useMemo(
    () =>
      analyzeCv(data as unknown as CVData, resolveTemplateDesignById(template)),
    [data, template],
  );
  useEffect(() => {
    const abort = new AbortController();
    setBusy(false);
    setView(null);setReturnView(null);
    setProposal(null);setLetter("");setAnalysis([]);setError(null);
    setOpportunity(params.get("opportunityId") || "");
    setOpportunityLabel("");setSearch("");setMatches([]);
    setRecord(null);
    setName("My CV");setTemplate("minimal-ats");
    setData(initial());
    setSaved("");
    setLoading(true);
    request<EditorCv[]>("/cv/editor", { signal: abort.signal })
      .then((rows) => {
        if (abort.signal.aborted) return;
        setCvs(rows);
        if (rows[0])
          choose(rows.find((r) => r.id === params.get("cvId")) || rows[0]);
        if (params.get("opportunityId")) { setAiKind("tailor"); setView("ai"); }
        else if (params.get("cvId")) setView("preview");
        if (!rows[0])
          setSaved(
            json({ name: "My CV", data: initial(), template: "minimal-ats" }),
          );
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => {
      abort.abort();
      operation.current?.abort();
      operation.current = null;
    };
  }, [request, userId, params]);

  useEffect(() => {
    if (view !== "edit") return;
    const active = wizardNav.current?.querySelector<HTMLElement>("[aria-current]");
    active?.scrollIntoView?.({ block: "nearest", inline: "center" });
    if (wizardNav.current?.parentElement) wizardNav.current.parentElement.scrollTop = 0;
  }, [section, view]);

  useEffect(() => {
    if (!showTemplateChoices && focusChangeDesignButton.current) {
      focusChangeDesignButton.current = false;
      changeDesignButton.current?.focus();
    }
  }, [showTemplateChoices]);

  function choose(row: EditorCv) {
    setRecord(row);
    setName(row.name);
    setData(row.data);
    setTemplate(row.templateId || "minimal-ats");
    setSaved(
      json({
        name: row.name,
        data: row.data,
        template: row.templateId || "minimal-ats",
      }),
    );
    setProposal(null); setLetter(""); setAnalysis([]);
    setError(null);
    setStatus("Saved");
  }
  function navigateCv(row: EditorCv | null) {
    if (dirty && !window.confirm("Discard unsaved changes?")) return false;
    if (row) choose(row);
    else {
      setRecord(null);
      setName("My CV");
      setData(initial());
      setTemplate("minimal-ats");
      setSaved(
        json({ name: "My CV", data: initial(), template: "minimal-ats" }),
      );
      setStatus("New CV");
      setError(null);
      setProposal(null); setLetter(""); setAnalysis([]);
    }
    return true;
  }
  function requestPremiumCvAccess(reason: string) {
    if (isPro) return true;
    if (billingLoading) {
      setError("Checking your plan. Try again in a moment.");
      return false;
    }
    openPaywall({ feature: "CV Builder", reason });
    return false;
  }
  function selectTemplate(templateId: string) {
    if (templateId === template) {
      if (showTemplateChoices) {
        focusChangeDesignButton.current = true;
        setShowTemplateChoices(false);
      }
      return;
    }
    const templateName =
      CV_TEMPLATE_COPY[templateId as keyof typeof CV_TEMPLATE_COPY]?.name ||
      "this CV design";
    if (
      isPremiumCvTemplate(templateId) &&
      !requestPremiumCvAccess(
        `${templateName} is a premium design. Upgrade to apply it; your current CV and draft are preserved.`,
      )
    ) {
      return;
    }
    setError(null);
    setTemplate(templateId);
    if (showTemplateChoices) focusChangeDesignButton.current = true;
    setShowTemplateChoices(false);
  }
  function closeDialog() {
    if (busy) return;
    if (view === "preview" && returnView) { setView(returnView); setReturnView(null); return; }
    if (dirty && !window.confirm("Close without saving? Your draft stays in this browser tab.")) return;
    setView(null);
  }
  function openEditor(row: EditorCv | null) {
    if (!(dirty && record?.id === row?.id) && !navigateCv(row)) return;
    setSection("basics"); setShowTemplateChoices(false); setReturnView(null); setView("edit");
  }
  function openEditorWithTemplate(templateId: string) {
    const templateName =
      CV_TEMPLATE_COPY[templateId as keyof typeof CV_TEMPLATE_COPY]?.name ||
      "this CV design";
    if (
      isPremiumCvTemplate(templateId) &&
      !requestPremiumCvAccess(
        templateName + " is a premium design. Upgrade to start a CV with it.",
      )
    ) {
      return;
    }
    if (!(dirty && record === null) && !navigateCv(null)) return;
    setSection("basics");
    setShowTemplateChoices(false);
    setReturnView(null);
    setTemplate(templateId);
    setView("edit");
  }
  async function removeCv(row: EditorCv) {
    if (!window.confirm(`Delete “${row.name}”? This cannot be undone.`)) return;
    setBusy(true); setError(null);
    try { await request(`/cv/editor/${row.id}`, { method: "DELETE" }); setCvs((rows) => rows.filter((item) => item.id !== row.id)); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function downloadSavedCv(row: EditorCv) {
    if (busy) return;
    setBusy(true);setError(null);
    try { await downloadCVPdf({ name:row.name, template_id:row.templateId || undefined, data_json:row.data as CVData }); }
    catch(e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function renameCv() {
    if (!renameTarget || busy || !renameName.trim() || renameName.trim() === renameTarget.name) return;
    setBusy(true);setRenameError(null);
    try {
      const row = await request<EditorCv>(`/cv/editor/${renameTarget.id}`, {method:"PATCH",body:json({name:renameName.trim(),data:renameTarget.data,templateId:renameTarget.templateId,expectedUpdatedAt:renameTarget.updatedAt})});
      setCvs(rows => rows.map(item => item.id === row.id ? row : item));
      if (record?.id === row.id) {
        if (dirty) setRecord(row);
        else choose(row);
      }
      setRenameTarget(null);
    } catch(e) { setRenameError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function duplicateCv(row: EditorCv) {
    setBusy(true); setError(null);
    try {
      const copy = await request<EditorCv>("/cv/editor", { method: "POST", body: json({ name: `${row.name.slice(0,145)} copy`, data: row.data, templateId: row.templateId }) });
      setCvs((rows) => [copy, ...rows]);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  useEffect(() => {
    if (view !== "ai" || search.trim().length < 2) { setMatches([]); setSearching(false); setSearchError(""); return; }
    const abort = new AbortController();
    setMatches([]);setSearchError("");setSearching(true);
    const timer = window.setTimeout(() => {
      setSearching(true); setSearchError("");
      request<{id:string; title:string}[]>(`/opportunities/search?q=${encodeURIComponent(search.trim())}&limit=8`, { signal: abort.signal })
        .then(rows => { if (!abort.signal.aborted) setMatches(rows); }).catch((e) => { if (!abort.signal.aborted) setSearchError(errorMessage(e)); })
        .finally(() => { if (!abort.signal.aborted) setSearching(false); });
    }, 300);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [view, search, request]);
  async function save() {
    if (!name.trim() || !String((data.header as Record<string, unknown>)?.full_name || "").trim()) {
      setError("Add a CV name and your full name before saving."); setSection("basics"); return;
    }
    setBusy(true);
    setError(null);
    setStatus("Saving");
    try {
      const row = await request<EditorCv>(
        record ? `/cv/editor/${record.id}` : "/cv/editor",
        {
          method: record ? "PATCH" : "POST",
          body: json({
            name,
            data,
            templateId: template,
            ...(record ? { expectedUpdatedAt: record.updatedAt } : {}),
          }),
        },
      );
      setCvs((rows) => [row, ...rows.filter((v) => v.id !== row.id)]);
      choose(row);
      recovery.discard();
      setReturnView(null);
      setView("preview");
    } catch (e) {
      if (!handleUpgradeError(e)) setError(errorMessage(e));
      setStatus("Unsaved");
    } finally {
      setBusy(false);
    }
  }
  async function ai(kind: "draft" | "tailor" | "letter") {
    if (busy || operation.current) return;
    const feature =
      kind === "draft"
        ? "AI CV writing"
        : kind === "tailor"
          ? "AI CV tailoring"
          : "AI cover letters";
    if (
      !requestPremiumCvAccess(
        `${feature} is included with an Edutu paid plan. Your CV and instructions are preserved.`,
      )
    ) {
      return;
    }
    setCopyOnApply(kind === "tailor");
    setProposalOrigin("ai");
    setProposal(null); setLetter(""); setAnalysis([]);
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    operation.current = controller;
    const isCurrent = () => operation.current === controller && !controller.signal.aborted;
    try {
      if (kind === "letter") {
        if (!opportunity)
          throw new Error(
            "Choose an opportunity from its detail page to draft a cover letter.",
          );
        const r = await request<{ coverLetter: string }>(
          "/cv/ai/cover-letter",
          {
            method: "POST",
            timeoutMs: 90000,
            signal: controller.signal,
            body: json({ opportunityId: opportunity, currentCV: data }),
          },
        );
        if (!isCurrent()) return;
        if (typeof r.coverLetter !== "string" || !r.coverLetter.trim()) throw new Error("No cover letter was returned. Your CV has not changed.");
        setLetter(r.coverLetter);
      } else {
        let context: Record<string, unknown> | null = null;
        if (kind === "tailor") {
          if (!opportunity)
            throw new Error(
              "Find and select an opportunity to tailor this CV.",
            );
          context = await request<Record<string, unknown>>(
            `/opportunities/${opportunity}`,
            { signal: controller.signal },
          );
          if (!isCurrent()) return;
          context =
            (context?.opportunity as Record<string, unknown> | undefined) ||
            context;
        }
        const r = await request<{
          cv?: Record<string, unknown>;
          tailored_cv?: Record<string, unknown>;
          suggestions?: string[];
          improvements?: string[];
          explanation?: string;
        }>("/cv/ai/" + (kind === "tailor" ? "tailor" : "draft"), {
          method: "POST",
          timeoutMs: 90000,
          signal: controller.signal,
          body: json(
            kind === "tailor"
              ? { currentCV: data, opportunity: context, userNotes: notes }
              : { currentCV: data, prompt: notes },
          ),
        });
        if (!isCurrent()) return;
        const proposed = r.tailored_cv || r.cv;
        if (!proposed || typeof proposed !== "object" || Array.isArray(proposed))
          throw new Error("The AI response contained no CV draft.");
        setProposal({
          ...data,
          ...proposed,
          header: {
            ...((data.header as object) || {}),
            ...((proposed.header as object) || {}),
          },
        });
        setAnalysis(r.suggestions || r.improvements || []);
      }
      window.dispatchEvent(new Event("edutu:ai-complete"));
      void refreshBilling();
    } catch (e) {
      if (isCurrent() && !handleUpgradeError(e)) setError(errorMessage(e));
    } finally {
      if (operation.current === controller) { operation.current = null; setBusy(false); }
    }
  }
  async function importFile(file: File) {
    if (busy || operation.current) return;
    if (!/\.(pdf|zip)$/i.test(file.name) || file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError("Choose a LinkedIn PDF or ZIP file up to 10 MB. Empty files cannot be imported.");
      return;
    }
    if (
      !requestPremiumCvAccess(
        "Importing a LinkedIn export uses AI to prepare your CV and requires an Edutu paid plan.",
      )
    ) {
      return;
    }
    const form = new FormData();
    form.append("file", file);
    setBusy(true);
    setError(null);
    setLetter("");setAnalysis([]);setProposal(null);
    const controller = new AbortController();
    operation.current = controller;
    try {
      const r = await request<{ cv: Record<string, unknown> }>(
        "/cv/ai/import-linkedin-file",
        { method: "POST", body: form, timeoutMs: 90000, signal: controller.signal },
      );
      if (controller.signal.aborted || operation.current !== controller) return;
      if (!r.cv || typeof r.cv !== "object" || Array.isArray(r.cv)) throw new Error("The file could not be converted into a CV.");
      setProposal(r.cv);
      setProposalOrigin("import");
      setView("ai"); setCopyOnApply(true);
    } catch (e) {
      if (!controller.signal.aborted && operation.current === controller) setError(errorMessage(e));
    } finally {
      if (operation.current === controller) { operation.current = null; setBusy(false); }
    }
  }
  const header = (data.header || {}) as Record<string, string>;
  const entries = Array.isArray(data[section])
    ? (data[section] as Record<string, unknown>[])
    : [];
  const changeEntry = (index: number, key: string, value: unknown) =>
    setData((old) => ({
      ...old,
      [section]: entries.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    }));
  const steps = ["basics", "summary", "experience", "education", "skills"] as const;
  const stepIndex = steps.indexOf(section as typeof steps[number]);
  const labels: Record<string, string> = { basics: "Personal details", summary: "Summary", experience: "Experience", education: "Education", skills: "Skills" };
  createCvHandler.current = () => openEditor(null);
  useEffect(() => {
    const handleCreateCv = () => createCvHandler.current();
    window.addEventListener(CV_CREATE_EVENT, handleCreateCv);
    return () => window.removeEventListener(CV_CREATE_EVENT, handleCreateCv);
  }, []);
  return <FeaturePage className="cv-page" eyebrow="" title="cvsTitle" description="cvsDescription" actions={<button type="button" className="feature-button" disabled={busy || loading} onClick={() => openEditor(null)}><Plus size={17}/>Create CV</button>}>
    {!view && <CvError error={error}/>}
    {loading ? <Loading/> : <>
      {dirty && <button className="feature-button secondary mb-4" onClick={() => setView("edit")}>Resume draft · {name}</button>}
      <div className="cv-quick-actions">
        <button className="cv-quick-action--linkedin" onClick={() => { if (!requestPremiumCvAccess("Importing a LinkedIn export uses AI and requires an Edutu paid plan.")) return; fileInput.current?.click(); }} disabled={busy}><Upload size={20}/><span><strong>Import LinkedIn <span className="cv-ai-pro-badge">Paid plan</span></strong><small>Turn your LinkedIn PDF or ZIP into an editable CV</small></span><ChevronRight size={17}/></button>
        <button className="cv-quick-action--ai" onClick={() => { setProposal(null); setLetter(""); setReturnView(null); setView("ai"); }} disabled={busy}><Sparkles size={20}/><span><strong>AI tools <span className="cv-ai-pro-badge">Paid plan</span></strong><small>Improve your CV, tailor it or draft a cover letter</small></span><ChevronRight size={17}/></button>
      </div>
      {cvs.length > 0 && <CvLibrary cvs={cvs} busy={busy}
        onPreview={row => { if (navigateCv(row)) { setReturnView(null); setView("preview"); } }}
        onEdit={openEditor}
        onRename={row => { setRenameTarget(row); setRenameName(row.name); setRenameError(null); }}
        onDuplicate={row => void duplicateCv(row)}
        onDelete={row => void removeCv(row)}
        onDownload={row => { void downloadSavedCv(row); }}
      />}
      {!view && <CvTemplatePicker
        compact
        title="Start with a template"
        description="Preview the designs, then add your details. You can change the design later."
        value=""
        name="Alex Morgan"
        data={TEMPLATE_GALLERY_SAMPLE_CV}
        isPro={isPro}
        billingLoading={billingLoading}
        onSelect={openEditorWithTemplate}
        onUpgrade={(templateName) => {
          requestPremiumCvAccess(
            templateName + " is a premium design. Upgrade to start a CV with it.",
          );
        }}
      />}
      <input type="file" ref={fileInput} hidden accept=".pdf,.zip" onChange={(e) => { if(e.target.files?.[0]) void importFile(e.target.files[0]); e.target.value=""; }}/>
      {busy && !view && <p role="status" className="feature-muted">Working…</p>}

    </>}
    {renameTarget && <CvDialog title="Rename CV" busy={busy} onClose={() => setRenameTarget(null)} footer={<div className="cv-footer-actions"><button type="button" className="feature-button secondary" disabled={busy} onClick={() => setRenameTarget(null)}>Cancel</button><button type="button" className="feature-button" disabled={busy || !renameName.trim() || renameName.trim() === renameTarget.name} onClick={() => void renameCv()}>{busy ? "Saving…" : "Save name"}</button></div>}>
      <CvError error={renameError}/><p className="feature-muted">Choose a name that helps you find the right version for an application.</p><label className="feature-label">CV name<input className="feature-field" value={renameName} maxLength={150} disabled={busy} onChange={e => setRenameName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) {e.preventDefault();void renameCv();} }}/></label>
    </CvDialog>}
    {view && <CvDialog title={view === "edit" ? record ? "Edit CV" : "Create CV" : view === "preview" ? "CV preview" : "AI tools"} onClose={closeDialog} closeLabel={view === "preview" && returnView ? "Back to editor" : "Close"} busy={busy} footer={
      view === "edit" ? <><span className="cv-draft-status" role="status">{busy ? "Saving…" : dirty ? "Draft kept in this tab" : status || "New CV"}</span><div className="cv-footer-actions">
        <button className="feature-button secondary" disabled={busy} onClick={() => {setReturnView("edit");setView("preview");}}><Eye size={16}/> Preview</button>
        {stepIndex > 0 && <button aria-label="Previous section" className="cv-icon-button" onClick={() => setSection(steps[stepIndex-1])}><ArrowLeft size={18}/></button>}
        {stepIndex >= 0 && stepIndex < steps.length-1 ? <button className="feature-button" onClick={() => setSection(steps[stepIndex+1])} disabled={busy}>Continue <ArrowRight size={16}/></button> : <button className="feature-button" disabled={busy} onClick={() => void save()}><Save size={16}/> Save CV</button>}
        {stepIndex < steps.length-1 && <button className="cv-save-link" disabled={busy} onClick={() => void save()}>Save CV</button>}
      </div></> : view === "preview" ? <div className="cv-footer-actions">{dirty && <button className="feature-button secondary" disabled={busy} onClick={() => void save()}><Save size={16}/> Save CV</button>}<button className="feature-button secondary" onClick={() => {setReturnView(null);setView("edit");}}><PencilLine size={16}/> Edit</button><CvPdfDownload cv={cv}/></div> : <p className="cv-ai-caveat">AI can make mistakes. Review all details before saving.</p>
    }>
      <CvError error={error}/>
      {view === "edit" && <>
        {recovery.recovered && <DraftRecovery onDiscard={recovery.discard} onRestore={() => { const draft=recovery.recovered; if(draft){setName(draft.name);setData(draft.data);setTemplate(draft.template);} recovery.discard(); }}/ >}
        {error && record && <button className="feature-button secondary" disabled={busy} onClick={async () => {if(window.confirm("Reload saved version and discard edits?")) {try {choose(await request<EditorCv>(`/cv/editor/${record.id}`));}catch(e){setError(errorMessage(e));}}}}>Reload saved version</button>}
        <nav ref={wizardNav} className="cv-wizard-steps" aria-label="CV sections">{steps.map((key,index) => <button key={key} aria-label={labels[key]} aria-current={section===key ? "step" : undefined} onClick={() => setSection(key)} disabled={busy}><span aria-hidden="true">{index+1}</span>{" "}{labels[key]}</button>)}</nav>
        <div className="cv-editor-form">
          <h3>{labels[section] || section[0].toUpperCase()+section.slice(1)}</h3>
          {section === "basics" && <div className="cv-document-settings">
            <label className="feature-label" htmlFor="cv-name">CV name<input id="cv-name" aria-describedby="cv-name-hint" maxLength={150} className="feature-field" value={name} onChange={(e)=>setName(e.target.value)} disabled={busy}/></label>
            <p className="cv-field-help" id="cv-name-hint">Only used to organise your saved CVs. Your full name appears on the document.</p>
            <section className="cv-selected-design" aria-label="Selected CV design">
              <div className="cv-selected-design-preview"><CvTemplatePreview templateId={template} name={name} data={data}/></div>
              <div className="cv-selected-design-copy">
                <span className="feature-muted">Selected design</span>
                <strong>{CV_TEMPLATE_COPY[template as keyof typeof CV_TEMPLATE_COPY]?.name || "Minimal ATS"}</strong>
                <p>{CV_TEMPLATE_COPY[template as keyof typeof CV_TEMPLATE_COPY]?.description}</p>
                <button ref={changeDesignButton} type="button" className="cv-save-link" aria-expanded={showTemplateChoices} onClick={() => setShowTemplateChoices((visible) => !visible)}>
                  {showTemplateChoices ? "Done choosing" : "Change design"}
                </button>
              </div>
            </section>
            {showTemplateChoices && <CvTemplatePicker
              value={template}
              name={name}
              data={data}
              isPro={isPro}
              billingLoading={billingLoading}
              onSelect={selectTemplate}
              onUpgrade={(templateName) => {
                requestPremiumCvAccess(
                  `${templateName} is a premium design. Upgrade to apply it; your current CV and draft are preserved.`,
                );
              }}
            />}
          </div>}
              {section === "basics" ? (
                [
                  "full_name",
                  "email",
                  "phone",
                  "location",
                  "linkedin",
                  "portfolio",
                ].map((key) => (
                  <label className="feature-label" key={key}>
                    {({full_name:"Full name",email:"Email address",phone:"Phone number (optional)",location:"Location (optional)",linkedin:"LinkedIn URL (optional)",portfolio:"Portfolio URL (optional)"} as Record<string,string>)[key]}
                    <input
                      className="feature-field mt-2"
                      type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
                      autoComplete={key === "full_name" ? "name" : key === "email" ? "email" : key === "phone" ? "tel" : "off"}
                      value={header[key] || ""}
                      disabled={busy}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          header: { ...header, [key]: e.target.value },
                        }))
                      }
                    />
                  </label>
                ))
              ) : section === "summary" ? (
                <label className="feature-label">
                  <WorkspaceText value="professionalSummary" />
                  <textarea
                    className="feature-field mt-2"
                    rows={6}
                    value={String(data.summary || "")}
                    disabled={busy}
                    onChange={(e) =>
                      setData((d) => ({ ...d, summary: e.target.value }))
                    }
                  />
                </label>
              ) : section === "skills" ? (
                <SkillsEditor key={record?.id || "new"} skills={(data.skills as string[]) || []} disabled={busy} onChange={skills => setData(value => ({...value,skills}))}/>
              ) : (
                <>
                  {entries.map((item, index) => (
                    <div
                      className="cv-entry-card"
                      key={String(item.id || index)}
                    >
                      <h4>{labels[section] || section[0].toUpperCase()+section.slice(1)} · {index+1}</h4>
                      {(section === "experience" || section === "education") && <p className="cv-field-help">Use YYYY-MM or a year, for example 2024-09 or 2024.</p>}
                      {SECTION_FIELDS[section].map((field) => (
                        <label className="feature-label" key={field.key}>
                          {field.label}
                          {field.key === "description" ? <textarea className="feature-field mt-2" rows={4} value={String(item[field.key] || "")} disabled={busy} onChange={e => changeEntry(index,field.key,e.target.value)}/> : <input
                            className="feature-field mt-2"
                            value={String(item[field.key] || "")}
                            placeholder={field.key.includes("date") ? "YYYY-MM or YYYY" : undefined}
                            disabled={busy || (section === "experience" && field.key === "end_date" && !!item.current)}
                            onChange={e => changeEntry(index,field.key,e.target.value)}
                          />}
                        </label>
                      ))}
                      {section === "experience" && (
                        <label className="feature-label flex gap-2">
                          <input
                            type="checkbox"
                            checked={!!item.current}
                            disabled={busy}
                            onChange={(e) =>
                              changeEntry(index, "current", e.target.checked)
                            }
                          />{" "}
                          <WorkspaceText value="currentRole" />
                        </label>
                      )}
                      <label className="feature-label">
                        <WorkspaceText value="highlightsOnePerLine" />
                        <textarea
                          className="feature-field mt-2"
                          value={((item.highlights as string[]) || []).join(
                            "\n",
                          )}
                          disabled={busy}
                          onChange={(e) =>
                            changeEntry(
                              index,
                              "highlights",
                              e.target.value.split("\n"),
                            )
                          }
                        />
                      </label>
                      <button
                        className="feature-button secondary mt-3"
                        disabled={busy}
                        onClick={() =>
                          setData((d) => ({
                            ...d,
                            [section]: entries.filter((_, i) => i !== index),
                          }))
                        }
                      >
                        <Trash2 size={14} />{" "}
                        <WorkspaceText value="removeEntry" />
                      </button>
                    </div>
                  ))}
                  <button
                    className="feature-button secondary"
                    disabled={busy}
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        [section]: [...entries, { id: crypto.randomUUID() }],
                      }))
                    }
                  >
                    <Plus size={16} /> <WorkspaceText value="add" />{" "}
                    {section === "education" ? "education" : "entry"}
                  </button>
                </>
              )}

          <details className="cv-extra-sections"><summary>Additional sections</summary><div>{Object.keys(SECTION_FIELDS).filter(key=>key!=="experience"&&key!=="education").map(key=><button key={key} disabled={busy} className="feature-button secondary" onClick={()=>setSection(key as CvSection)}>{key[0].toUpperCase()+key.slice(1)}</button>)}</div></details>
        </div>
      </>}
      {view === "preview" && <><CvPreview cv={cv}/><section className="cv-checklist" aria-labelledby="cv-checklist-title"><div className="cv-checklist-heading"><div><h3 id="cv-checklist-title">Preparation checklist</h3><p>Practical checks for clarity and completeness. This is not an application success score.</p></div><span className="cv-checklist-score">{health.score}<small>/100</small></span></div>
        {health.issues.length ? <ul>{health.issues.map(check => <li key={check.id}><span>{String(t(`cv.${check.labelKey}`,{defaultValue:check.id,...check.values}))}</span><button type="button" className="cv-save-link" aria-label={`Fix: ${String(t(`cv.${check.labelKey}`,{defaultValue:check.id,...check.values}))}`} onClick={() => {setSection(check.id === "skills" ? "skills" : check.step === "extras" ? "experience" : check.step);setReturnView(null);setView("edit");}}>Fix <ArrowRight size={14}/></button></li>)}</ul> : <p className="cv-checklist-complete"><CheckCircle2 size={18}/>All preparation checks passed. Verify every detail before applying.</p>}
      </section><div className="cv-secondary-exports"><button onClick={()=>printCV(html)}>Print CV</button><button onClick={()=>downloadText(name,buildCVText(cv))}>Download as text</button></div></>}

      {view === "ai" && <div className="cv-ai-form">
        {!proposal && !letter && <>
          <label className="feature-label">CV to use<select className="feature-field" value={record?.id || ""} disabled={busy} onChange={e=>{const row=cvs.find(item=>item.id===e.target.value); navigateCv(row || null);}}><option value="">New CV</option>{cvs.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          {!String(header.full_name || "").trim() && <p className="feature-muted mb-4">Add your details to a CV first. <button className="cv-save-link" onClick={() => {setView("edit");setSection("basics");}}>Create or edit CV</button></p>}
          <div className="cv-ai-options">{([["draft","Improve writing","Make your experience clearer"],["tailor","Tailor to opportunity","Create a version for an application"],["letter","Cover letter","Draft from your CV"]] as const).map(([kind,title,subtitle])=><button key={kind} aria-pressed={aiKind===kind} disabled={busy} onClick={()=>{setAiKind(kind);setError(null);}}><strong>{title}</strong><small>{subtitle}</small></button>)}</div>
          {aiKind !== "draft" && <><label className="feature-label">Find an opportunity<input className="feature-field" value={search} disabled={busy} onChange={e=>setSearch(e.target.value)} placeholder="Search by title or organisation"/></label>{searching && <p role="status">Searching…</p>}{searchError && <p role="alert">{searchError}</p>}{search.trim().length >= 2 && !searching && !searchError && !matches.length && <p className="feature-muted" role="status">No opportunities found. Try another title or organisation.</p>}<div className="cv-search-results">{matches.map(item=><button key={item.id} disabled={busy} aria-pressed={opportunity===item.id} onClick={()=>{setOpportunity(item.id);setOpportunityLabel(item.title);setSearch("");setMatches([]);}}>{item.title}{opportunity===item.id && " ✓"}</button>)}</div>{opportunity && <p className="feature-muted">Selected: {opportunityLabel || "Opportunity from your application"} <button className="cv-save-link" disabled={busy} onClick={() => {setOpportunity("");setOpportunityLabel("");}}>Change</button></p>}</>}
          <label className="feature-label">Instructions <span className="feature-muted">(optional)</span><textarea className="feature-field" rows={3} value={notes} disabled={busy} onChange={e=>setNotes(e.target.value)} placeholder="What would you like to improve?"/></label>
          {isPro ? (
            <AccessSummary action="cvAi" />
          ) : (
            <p className="feature-muted mb-4" role="status">
              {billingLoading
                ? "Checking your CV plan access…"
                : "AI CV writing, tailoring, cover letters and LinkedIn import require a paid plan. Credit top-ups do not unlock these actions."}
            </p>
          )}
          <button className="feature-button cv-ai-generate" disabled={busy || (billingLoading && !isPro) || !String(header.full_name || "").trim() || (aiKind!=="draft"&&!opportunity)} onClick={()=>{if(!isPro){requestPremiumCvAccess("AI CV features require an Edutu paid plan.");return;}void ai(aiKind);}}><Sparkles size={16}/>{busy ? "Preparing…" : !isPro ? "Unlock with a paid plan" : aiKind === "letter" ? "Draft cover letter" : aiKind === "tailor" ? "Tailor CV" : "Improve CV"}</button>
        </>}
            {busy && <p role="status">Preparing your draft…</p>}
            {(proposal || letter) && <button type="button" className="cv-result-back" onClick={() => {setProposal(null);setLetter("");setAnalysis([]);setError(null);}}><ArrowLeft size={16}/>Back to AI tools</button>}
            {proposal && (
              <div className="mt-6">
                <h2>{proposalOrigin === "import" ? "Review imported CV" : "Proposed version"}</h2>
                <p className="feature-muted">{copyOnApply ? "Review the details, then save this as a separate CV. Your original stays unchanged." : "Review the changes before applying them to your working draft."}</p>
                <CvPreview title="Proposed CV" cv={{...cv,data_json:proposal as unknown as CVData}}/>
                {analysis.map((line, i) => (
                  <p className="feature-muted" key={i}>
                    {line}
                  </p>
                ))}
                <div className="feature-actions mt-4">
                  <button
                    className="feature-button"
                    onClick={() => {
                      setData(proposal);
                      if (copyOnApply) { setRecord(null); setName((proposalOrigin === "import" ? `${String((proposal.header as Record<string, unknown> | undefined)?.full_name || "Imported")} CV` : `${name} tailored`).slice(0,150)); }
                      setSection("summary"); setView("edit");
                      setProposal(null);
                      setStatus("Unsaved");
                    }}
                  >
                    {copyOnApply ? "Use as a new CV" : "Apply to draft"}
                  </button>
                  <button
                    className="feature-button secondary"
                    onClick={() => setProposal(null)}
                  >
                    Discard suggestion
                  </button>
                </div>
              </div>
            )}
            {letter && (
              <div className="mt-6">
                <h2>
                  <WorkspaceText value="coverLetterDraft" />
                </h2>
                <textarea
                  aria-label="Cover letter draft"
                  className="feature-field"
                  rows={12}
                  value={letter}
                  onChange={(e) => setLetter(e.target.value)}
                />
                <button
                  className="feature-button secondary mt-3"
                  onClick={() => downloadText(name + " cover letter", letter)}
                >
                  <WorkspaceText value="downloadDraft" />
                </button>
              </div>
            )}

      </div>}
    </CvDialog>}
  </FeaturePage>;
}
