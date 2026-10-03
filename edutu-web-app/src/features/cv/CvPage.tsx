import { WorkspaceText } from "../workspace/shared";
import { useDraftRecovery, DraftRecovery } from "../workspace/useDraftRecovery";
import AccessSummary from "../feature-access/AccessSummary";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Eye, PencilLine, Plus, Save, Sparkles, Trash2, ArrowLeft, ArrowRight, Copy, Upload, ChevronRight } from "lucide-react";
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
function formatCvDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Recently updated"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
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
    setRecord(null);
    setData(initial());
    setSaved("");
    setLoading(true);
    request<EditorCv[]>("/cv/editor", { signal: abort.signal })
      .then((rows) => {
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
    setProposal(null);
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
  async function duplicateCv(row: EditorCv) {
    setBusy(true); setError(null);
    try {
      const copy = await request<EditorCv>("/cv/editor", { method: "POST", body: json({ name: `${row.name} copy`, data: row.data, templateId: row.templateId }) });
      setCvs((rows) => [copy, ...rows]);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  useEffect(() => {
    if (view !== "ai" || search.trim().length < 2) { setMatches([]); setSearching(false); return; }
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true); setSearchError("");
      request<{id:string; title:string}[]>(`/opportunities/search?q=${encodeURIComponent(search.trim())}&limit=8`, { signal: abort.signal })
        .then(setMatches).catch((e) => { if (!abort.signal.aborted) setSearchError(errorMessage(e)); })
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
    if (kind === "tailor" || kind === "letter") {
      const feature = kind === "tailor" ? "CV tailoring" : "CV cover letters";
      if (
        !requestPremiumCvAccess(
          `${feature} is included with an Edutu paid plan. Your CV and instructions are preserved.`,
        )
      ) {
        return;
      }
    }
    setCopyOnApply(kind === "tailor");
    setProposal(null); setLetter("");
    setBusy(true);
    setError(null);
    operation.current = new AbortController();
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
            signal: operation.current.signal,
            body: json({ opportunityId: opportunity, currentCV: data }),
          },
        );
        setLetter(r.coverLetter);
      } else {
        let context: Record<string, unknown> | null = null;
        if (kind === "tailor") {
          if (!opportunity)
            throw new Error(
              "Enter an opportunity ID or open CV tailoring from an opportunity.",
            );
          context = await request<Record<string, unknown>>(
            `/opportunities/${opportunity}`,
          );
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
          signal: operation.current.signal,
          body: json(
            kind === "tailor"
              ? { currentCV: data, opportunity: context, userNotes: notes }
              : { currentCV: data, prompt: notes },
          ),
        });
        const proposed = r.tailored_cv || r.cv;
        if (!proposed)
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
      if (!handleUpgradeError(e)) setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    setBusy(true);
    setError(null);
    try {
      const r = await request<{ cv: Record<string, unknown> }>(
        "/cv/ai/import-linkedin-file",
        { method: "POST", body: form, timeoutMs: 90000 },
      );
      if (!r.cv) throw new Error("The file could not be converted into a CV.");
      setProposal({ ...data, ...r.cv, header: { ...((data.header as object) || {}), ...((r.cv.header as object) || {}) } });
      setView("ai"); setCopyOnApply(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
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
  return <FeaturePage eyebrow="" title="My CVs" description="">
    {!view && <CvError error={error}/>}
    {loading ? <Loading/> : <>
      {dirty && <button className="feature-button secondary mb-4" onClick={() => setView("edit")}>Resume draft · {name}</button>}
      <div className="cv-quick-actions">
        <button onClick={() => { if(navigateCv(null)) fileInput.current?.click(); }} disabled={busy}><Upload size={20}/><span><strong>Import LinkedIn</strong><small>LinkedIn PDF or ZIP</small></span><ChevronRight size={17}/></button>
        <button onClick={() => { setProposal(null); setLetter(""); setReturnView(null); setView("ai"); }} disabled={busy}><Sparkles size={20}/><span><strong>AI tools</strong><small>Draft, tailor & write cover letters</small></span><ChevronRight size={17}/></button>
      </div>
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
      {cvs.length > 0 && <><h2 className="cv-library-heading">Your CVs</h2><section className="cv-library-grid" aria-label="Saved CVs">{cvs.map((row) => <article className="cv-saved-card" key={row.id}>
          <button className="cv-card-preview" aria-label={`Preview ${row.name}`} onClick={() => { choose(row); setReturnView(null); setView("preview"); }}>
            <div className="cv-thumbnail-window"><CvTemplatePreview templateId={row.templateId} name={row.name} data={row.data}/></div>
          </button>
          <div className="cv-card-info"><h2>{row.name}</h2><p>Updated {formatCvDate(row.updatedAt)}</p></div>
          <div className="cv-card-actions"><button onClick={() => openEditor(row)}><PencilLine size={16}/> Edit</button>
            <details><summary aria-label={`More actions for ${row.name}`}>•••</summary><div className="cv-card-menu">
              <button disabled={busy} onClick={() => openEditor(row)}>Rename</button>
              <button disabled={busy} onClick={() => void duplicateCv(row)}><Copy size={15}/> Duplicate</button>
              <button disabled={busy} onClick={async () => { setBusy(true); try { await downloadCVPdf({ name:row.name,template_id:row.templateId || undefined,data_json:row.data as CVData }); } catch(e){setError(errorMessage(e));} finally {setBusy(false);} }}><Download size={15}/> Download PDF</button>
              <button disabled={busy} onClick={() => void removeCv(row)}><Trash2 size={15}/> Delete</button>
            </div></details></div>
        </article>)}</section></>}
    </>}
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
        <nav ref={wizardNav} className="cv-wizard-steps" aria-label="CV sections">{steps.map((key,index) => <button key={key} aria-current={section===key ? "step" : undefined} onClick={() => setSection(key)} disabled={busy}><span>{index+1}</span>{labels[key]}</button>)}</nav>
        <div className="cv-editor-form">
          <h3>{labels[section] || section[0].toUpperCase()+section.slice(1)}</h3>
          {section === "basics" && <div className="cv-document-settings">
            <label className="feature-label" htmlFor="cv-name">Version name<input id="cv-name" className="feature-field" value={name} onChange={(e)=>setName(e.target.value)} disabled={busy}/></label>
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
                    {({full_name:"Full name",email:"Email",phone:"Phone",location:"Location",linkedin:"LinkedIn",portfolio:"Portfolio"} as Record<string,string>)[key]}
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
                <label className="feature-label">
                  <WorkspaceText value="skillsCommaSeparated" />
                  <textarea
                    className="feature-field mt-2"
                    value={((data.skills as string[]) || []).join(", ")}
                    disabled={busy}
                    onChange={(e) =>
                      setData((d) => ({
                        ...d,
                        skills: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      }))
                    }
                  />
                </label>
              ) : (
                <>
                  {entries.map((item, index) => (
                    <div
                      className="border-b pb-5 mb-5"
                      key={String(item.id || index)}
                    >
                      {SECTION_FIELDS[section].map((field) => (
                        <label className="feature-label" key={field.key}>
                          {field.label}
                          <input
                            className="feature-field mt-2"
                            value={String(item[field.key] || "")}
                            disabled={busy}
                            onChange={(e) =>
                              changeEntry(index, field.key, e.target.value)
                            }
                          />
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
      {view === "preview" && <><CvPreview cv={cv}/><details className="cv-checklist"><summary>Preparation checklist · {health.score}/100</summary>{health.issues.slice(0,5).map(check=><p key={check.id}>{String(t(`cv.${check.labelKey}`,{defaultValue:check.labelKey.split(".").pop()?.replace(/([A-Z])/g," $1")||check.id,...check.values}))}</p>)}</details><div className="cv-secondary-exports"><button onClick={()=>printCV(html)}>Print</button><button onClick={()=>downloadText(name,buildCVText(cv))}>Download text</button></div></>}
      {view === "ai" && <div className="cv-ai-form">
        {!proposal && !letter && <>
          <label className="feature-label">CV to use<select className="feature-field" value={record?.id || ""} disabled={busy} onChange={e=>{const row=cvs.find(item=>item.id===e.target.value); if(row) choose(row); else navigateCv(null);}}><option value="">New CV</option>{cvs.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          {!String(header.full_name || "").trim() && <p className="feature-muted mb-4">Add your details to a CV first. <button className="cv-save-link" onClick={() => {setView("edit");setSection("basics");}}>Create or edit CV</button></p>}
          <div className="cv-ai-options">{([["draft","Improve writing","Make your experience clearer"],["tailor","Tailor to opportunity","Create a version for an application"],["letter","Cover letter","Draft from your CV"]] as const).map(([kind,title,subtitle])=><button key={kind} aria-pressed={aiKind===kind} disabled={busy} onClick={()=>{setAiKind(kind);setError(null);}}><strong>{title}{kind !== "draft" && <span className="cv-ai-pro-badge">Pro</span>}</strong><small>{subtitle}</small></button>)}</div>
          {aiKind !== "draft" && <><label className="feature-label">Find an opportunity<input className="feature-field" value={search} disabled={busy} onChange={e=>setSearch(e.target.value)} placeholder="Search by title or organisation"/></label>{searching && <p role="status">Searching…</p>}{searchError && <p role="alert">{searchError}</p>}<div className="cv-search-results">{matches.map(item=><button key={item.id} disabled={busy} aria-pressed={opportunity===item.id} onClick={()=>{setOpportunity(item.id);setOpportunityLabel(item.title);setSearch("");setMatches([]);}}>{item.title}{opportunity===item.id && " ✓"}</button>)}</div>{opportunity && <p className="feature-muted">Selected: {opportunityLabel || "Opportunity from your application"} <button className="cv-save-link" disabled={busy} onClick={() => {setOpportunity("");setOpportunityLabel("");}}>Change</button></p>}</>}
          <label className="feature-label">Instructions <span className="feature-muted">(optional)</span><textarea className="feature-field" rows={3} value={notes} disabled={busy} onChange={e=>setNotes(e.target.value)} placeholder="What would you like to improve?"/></label>
          {aiKind === "draft" || isPro ? (
            <AccessSummary action="cvAi" />
          ) : (
            <p className="feature-muted mb-4" role="status">
              {billingLoading
                ? "Checking your CV plan access…"
                : "Tailoring and cover letters are included with a paid plan. Credit top-ups do not unlock these actions."}
            </p>
          )}
          <button className="feature-button cv-ai-generate" disabled={busy || (billingLoading && !isPro && aiKind !== "draft") || !String(header.full_name || "").trim() || (aiKind!=="draft"&&!opportunity)} onClick={()=>{if(aiKind!=="draft"&&!isPro){requestPremiumCvAccess(aiKind==="tailor"?"Tailor your CV to an opportunity with an Edutu paid plan.":"Create opportunity-specific cover letters with an Edutu paid plan.");return;}void ai(aiKind);}}><Sparkles size={16}/>{busy ? "Preparing your draft…" : aiKind !== "draft" && !isPro ? "Unlock with Pro" : "Generate draft"}</button>
        </>}
            {busy && <p role="status">Preparing your draft…</p>}
            {proposal && (
              <div className="mt-6">
                <h2>
                  <WorkspaceText value="proposedVersion" />
                </h2>
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
                      if (copyOnApply) { setRecord(null); setName(`${name} tailored`); }
                      setSection("summary"); setView("edit");
                      setProposal(null);
                      setStatus("Unsaved");
                    }}
                  >
                    <WorkspaceText value="acceptChanges" />
                  </button>
                  <button
                    className="feature-button secondary"
                    onClick={() => setProposal(null)}
                  >
                    <WorkspaceText value="keepOriginal" />
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
