import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileText, FolderOpen, GraduationCap, PenLine, Plus, Upload } from "lucide-react";
import { FeaturePage, Loading, errorMessage, useProductSession } from "../workspace/shared";
import { WorkspaceDialog, ToolError } from "../workspace/WorkspaceDialog";
import type { EditorCv } from "../cv/api";
import { downloadText } from "../cv/export";
import "../workspace/tools.css";
interface UploadRecord { id: string; kind: string; fileName: string; parseStatus: string; createdAt: string }
interface LegacyCv { id: string; title: string; textContent?: string; text_content?: string }
const icons = { cv: FileText, transcript: GraduationCap, essay: PenLine, other: FolderOpen };
const date = (value: string) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}); };
export default function DocumentsPage() {
  const { request, userId } = useProductSession();
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [cvs, setCvs] = useState<EditorCv[]>([]);
  const [legacy, setLegacy] = useState<LegacyCv[]>([]);
  const [tab, setTab] = useState<"all"|"uploaded"|"cv">("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [kind, setKind] = useState("other");
  const [selected, setSelected] = useState<File | null>(null);
  const [stage, setStage] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    const results = await Promise.allSettled([request<UploadRecord[]>("/uploads",{signal}),request<EditorCv[]>("/cv/editor",{signal}),request<LegacyCv[]|{records:LegacyCv[]}>("/cv",{signal})]);
    if (signal?.aborted) return;
    const [u,c,l]=results;
    if(u.status==="fulfilled")setUploads(u.value);else setError(errorMessage(u.reason));
    if(c.status==="fulfilled")setCvs(c.value);else setError(errorMessage(c.reason));
    if(l.status==="fulfilled")setLegacy(Array.isArray(l.value)?l.value:l.value.records||[]);
    setLoading(false);
  },[request]);
  useEffect(()=>{const abort=new AbortController();setUploads([]);setCvs([]);setLegacy([]);setLoading(true);void load(abort.signal);return ()=>abort.abort();},[load,userId]);
  async function upload() {
    if (!selected) return;
    if (selected.size>10*1024*1024){setError("Choose a file up to 10 MB.");return;}
    setBusy(true);setError(null);setStage("Uploading…");
    let uploadId:string|undefined;
    try{const form=new FormData();form.append("file",selected);form.append("kind",kind);const result=await request<{uploadId:string}>("/uploads/file",{method:"POST",body:form,timeoutMs:120000});uploadId=result.uploadId;setStage("Reading your document…");await request(`/uploads/${uploadId}/ingest`,{method:"POST",timeoutMs:90000});setStage("Document ready");setUploadOpen(false);setSelected(null);}
    catch(e){setError(uploadId?`Your file was uploaded, but reading it failed. ${errorMessage(e)}`:errorMessage(e));}
    finally{await load();setBusy(false);}
  }
  async function download(id:string) {
    setError(null);
    try{const result=await request<{url:string}>(`/uploads/${id}/download-url`);const url=new URL(result.url);if(url.protocol!=="https:")throw new Error("Document download URL is invalid");const link=document.createElement("a");link.href=url.href;link.target="_blank";link.rel="noopener noreferrer";link.click();}
    catch(e){setError(errorMessage(e));}
  }
  async function retry(id:string) {
    setBusy(true);setError(null);
    try{await request(`/uploads/${id}/ingest`,{method:"POST",timeoutMs:90000});await load();}
    catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  const showUploads=tab!=="cv",showCv=tab!=="uploaded";
  const cvCount=cvs.length+legacy.length;
  const total=uploads.length+cvCount;
  return <FeaturePage className="tool-page" eyebrow="" title="My documents" description="" actions={<button className="feature-button" data-workspace-primary-action disabled={busy} onClick={()=>{setStage("");setError(null);setUploadOpen(true);}}><Upload size={16}/> Upload file</button>}>
    {!uploadOpen&&<ToolError error={error} onRetry={()=>void load()}/>}
    <div className="tool-tabs" aria-label="Document views">{(["all","uploaded","cv"] as const).map(value=><button key={value} aria-pressed={tab===value} onClick={()=>setTab(value)}>{value==="all"?`All (${total})`:value==="uploaded"?`Files (${uploads.length})`:`CVs (${cvCount})`}</button>)}</div>
    {loading?<Loading/>:<>
      {showCv&&<section><div className="tool-section-label"><span>CVs</span><Link to="/app/cv">Open CVs →</Link></div>{cvCount?<div className="tool-list">{cvs.map(cv=><Link className="tool-card tool-row" key={`editor:${cv.id}`} to={`/app/cv?cvId=${cv.id}`}><span className="tool-icon" data-kind="cv"><FileText size={18}/></span><div><h2>{cv.name}</h2><p>Editable CV · {date(cv.updatedAt)}</p></div><span>→</span></Link>)}{legacy.map(cv=><article className="tool-card tool-row" key={`legacy:${cv.id}`}><span className="tool-icon" data-kind="cv"><FileText size={18}/></span><div><h2>{cv.title||"Earlier CV"}</h2><p>Earlier version</p></div><button className="tool-icon-button" aria-label={`Download ${cv.title||"CV"} as text`} onClick={()=>downloadText(cv.title||"CV",cv.textContent||cv.text_content||"")}><Download size={18}/></button></article>)}</div>:<Link className="tool-shortcut" to="/app/cv"><span className="tool-icon" data-kind="cv"><FileText size={18}/></span><span><strong>No CVs yet</strong><small>Create one in CV & AI tools</small></span><span>→</span></Link>}</section>}
      {showUploads&&<section><div className="tool-section-label"><span>Uploaded files</span></div>{uploads.length?<div className="tool-list">{uploads.map(row=>{const Icon=icons[row.kind as keyof typeof icons]||FolderOpen;return <article className="tool-card tool-row" key={row.id}><span className="tool-icon" data-kind={row.kind}><Icon size={18}/></span><div><h2>{row.fileName}</h2><p>{row.kind} · {row.parseStatus==="done"?"Ready":row.parseStatus==="failed"?"Needs retry":"Reading…"} · {date(row.createdAt)}</p></div><div className="tool-actions">{row.parseStatus==="failed"&&<button className="text-brand min-h-11" disabled={busy} onClick={()=>void retry(row.id)}>Retry</button>}<button className="tool-icon-button" aria-label={`Download ${row.fileName}`} onClick={()=>void download(row.id)}><Download size={18}/></button></div></article>;})}</div>:<div className="tool-empty"><span className="tool-icon"><FolderOpen size={25}/></span><h2>No files uploaded yet</h2><p>Keep transcripts, essays and supporting documents in one place.</p><button className="feature-button" onClick={()=>setUploadOpen(true)}><Plus size={16}/> Add a file</button></div>}</section>}
    </>}
    {uploadOpen&&<WorkspaceDialog title="Upload document" busy={busy} onClose={()=>{setUploadOpen(false);setSelected(null);}} footer={<button className="feature-button" disabled={busy||!selected} onClick={()=>void upload()}>{busy?stage:"Upload document"}</button>}><ToolError error={error}/><label className="feature-label">Document type<select className="feature-field" value={kind} onChange={e=>setKind(e.target.value)}><option value="other">Other document</option><option value="cv">CV</option><option value="transcript">Transcript</option><option value="essay">Essay</option></select></label><input type="file" hidden ref={file} accept=".pdf,.doc,.docx,.txt" onChange={e=>setSelected(e.target.files?.[0]||null)}/><button className="tool-shortcut w-full text-start" onClick={()=>file.current?.click()}><span className="tool-icon"><Upload size={18}/></span><span><strong>{selected?selected.name:"Choose a file"}</strong><small>PDF, Word or text · up to 10 MB</small></span><span>→</span></button>{stage&&<p role="status" className="feature-muted">{stage}</p>}</WorkspaceDialog>}
  </FeaturePage>;
}
