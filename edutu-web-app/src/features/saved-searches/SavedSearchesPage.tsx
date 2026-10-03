import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bell, BellOff, Plus, Search } from "lucide-react";
import { FeaturePage, Loading, errorMessage, json, useProductSession } from "../workspace/shared";
import { WorkspaceDialog, ToolError } from "../workspace/WorkspaceDialog";
import WebPushSettings from "../../components/WebPushSettings";
import "../workspace/tools.css";
interface Criteria { name: string; query: string; category: string; fundingType: string; targetRegion: string; remoteOnly: boolean; notifyEnabled: boolean }
interface SavedSearch extends Criteria { id: string; matchCount?: number; lastNotifiedAt: string | null }
interface Match { id: string; title: string; organization: string }
const empty = (): Criteria => ({ name: "", query: "", category: "", fundingType: "", targetRegion: "", remoteOnly: false, notifyEnabled: true });
export default function SavedSearchesPage() {
  const { request, userId } = useProductSession();
  const [params] = useSearchParams();
  const [rows, setRows] = useState<SavedSearch[]>([]);
  const [form, setForm] = useState<Criteria | null>(params.get("query") || params.get("category") ? {...empty(),query:params.get("query")||"",category:params.get("category")||""} : null);
  const [editing, setEditing] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, Match[]>>({});
  const [matching, setMatching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const result=await request<SavedSearch[]>("/saved-searches",{signal}); if (!signal?.aborted) {setRows(result);setError(null);} }
    catch(e) {if(!signal?.aborted)setError(errorMessage(e));}
    finally {if(!signal?.aborted)setLoading(false);}
  },[request]);
  useEffect(()=>{const abort=new AbortController();setRows([]);setLoading(true);void load(abort.signal);return ()=>abort.abort();},[load,userId]);
  const openCreate=()=>{if(rows.length>=20){setError("You can save up to 20 alerts. Delete one to add another.");return;}setEditing(null);setForm(empty());};
  async function save() {
    if (!form) return;
    setBusy(true);setError(null);
    try {await request(editing?`/saved-searches/${editing}`:"/saved-searches",{method:editing?"PATCH":"POST",body:json(form)});setForm(null);setEditing(null);await load();}
    catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  async function mutate(row:SavedSearch,remove=false){
    if(remove&&!window.confirm(`Delete “${row.name}” and its alerts?`))return;
    setBusy(true);setError(null);
    try {await request(`/saved-searches/${row.id}`,{method:remove?"DELETE":"PATCH",...(!remove?{body:json({notifyEnabled:!row.notifyEnabled})}:{})});await load();}
    catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  async function showMatches(id:string){
    if(expanded===id){setExpanded(null);return;}
    setExpanded(id);if(preview[id])return;
    setMatching(id);setError(null);
    try{const result=await request<{matches:Match[]}>(`/saved-searches/${id}/matches`);setPreview(prev=>({...prev,[id]:result.matches}));}
    catch(e){setError(errorMessage(e));}finally{setMatching(null);}
  }
  return <FeaturePage className="tool-page" eyebrow="" title="Searches & alerts" description="" actions={<button className="feature-button" data-workspace-primary-action disabled={busy} onClick={openCreate}><Plus size={16}/> New alert</button>}>
    <ToolError error={form?null:error} onRetry={()=>void load()}/>
    <div className="tool-toolbar"><p className="feature-muted">{rows.length} {rows.length===1?"alert":"alerts"}</p><button className="text-sm text-brand min-h-11" onClick={()=>setSettingsOpen(true)}>Notification settings</button></div>
    {loading?<Loading/>:rows.length===0?<div className="tool-empty"><span className="tool-icon"><Search size={25}/></span><h2>Stay ahead of new opportunities</h2><p>Save a search and get an alert when new matches appear.</p><button className="feature-button" onClick={openCreate}><Plus size={16}/> Create alert</button></div>:<div className="tool-list">{rows.map(row=><article className="tool-card" key={row.id}><div className="tool-row"><span className="tool-icon">{row.notifyEnabled?<Bell size={18}/>:<BellOff size={18}/>}</span><div><h2>{row.name}</h2><p>{[row.query,row.category,row.targetRegion,row.fundingType,row.remoteOnly?"Remote only":""].filter(Boolean).join(" · ")||"Saved criteria"}</p></div><details className="tool-menu"><summary aria-label={`Actions for ${row.name}`}>•••</summary><div><button onClick={()=>{setEditing(row.id);setForm({name:row.name,query:row.query||"",category:row.category||"",fundingType:row.fundingType||"",targetRegion:row.targetRegion||"",remoteOnly:!!row.remoteOnly,notifyEnabled:row.notifyEnabled});}}>Edit</button><button disabled={busy} onClick={()=>void mutate(row,true)}>Delete</button></div></details></div><div className="tool-card-footer"><span>{row.notifyEnabled?"Watching for matches":"Paused"}{typeof row.matchCount==="number"?` · ${row.matchCount} current`:""}</span><div className="tool-actions"><button className="text-brand min-h-11" onClick={()=>void showMatches(row.id)}>{expanded===row.id?"Hide":"Matches"}</button><button className="feature-button secondary" disabled={busy} onClick={()=>void mutate(row)}>{row.notifyEnabled?"Pause":"Resume"}</button></div></div>{expanded===row.id&&<div className="tool-list mt-3" aria-live="polite">{matching===row.id?<p className="feature-muted">Finding matches…</p>:preview[row.id]?.length?preview[row.id].map(match=><Link className="tool-row border-t border-subtle py-3 text-sm" key={match.id} to={`/app/opportunity/${match.id}`}><span className="min-w-0 flex-1"><strong>{match.title}</strong><small className="block text-text-muted">{match.organization}</small></span><span>→</span></Link>):<p className="feature-muted">No current matches. Your alert is still watching.</p>}</div>}</article>)}</div>}
    {form&&<WorkspaceDialog title={editing?"Edit alert":"Create alert"} busy={busy} onClose={()=>{setForm(null);setEditing(null);}} footer={<button className="feature-button" form="alert-editor" disabled={busy||!form.name.trim()||!(form.query||form.category||form.fundingType||form.targetRegion||form.remoteOnly)}>Save alert</button>}><ToolError error={error}/><form id="alert-editor" onSubmit={e=>{e.preventDefault();void save();}}><label className="feature-label">Alert name<input className="feature-field" value={form.name} maxLength={80} required autoFocus placeholder="e.g. Research scholarships" onChange={e=>setForm({...form,name:e.target.value})}/></label><label className="feature-label">Search words<input className="feature-field" value={form.query} maxLength={200} placeholder="What are you looking for?" onChange={e=>setForm({...form,query:e.target.value})}/></label><label className="tool-check"><input type="checkbox" checked={form.notifyEnabled} onChange={e=>setForm({...form,notifyEnabled:e.target.checked})}/> Send matching alerts</label><details className="mt-4"><summary>More filters</summary><label className="feature-label">Category<input className="feature-field" value={form.category} maxLength={80} onChange={e=>setForm({...form,category:e.target.value})}/></label><label className="feature-label">Funding type<input className="feature-field" value={form.fundingType} maxLength={80} onChange={e=>setForm({...form,fundingType:e.target.value})}/></label><label className="feature-label">Target region<input className="feature-field" value={form.targetRegion} maxLength={80} onChange={e=>setForm({...form,targetRegion:e.target.value})}/></label><label className="tool-check"><input type="checkbox" checked={form.remoteOnly} onChange={e=>setForm({...form,remoteOnly:e.target.checked})}/> Remote only</label></details></form></WorkspaceDialog>}
    {settingsOpen&&<WorkspaceDialog title="Notification settings" onClose={()=>setSettingsOpen(false)}><WebPushSettings/></WorkspaceDialog>}
  </FeaturePage>;
}
