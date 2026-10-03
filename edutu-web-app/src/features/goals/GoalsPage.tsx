import PreparationPlans from "./PreparationPlans";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CalendarDays, Check, ChevronLeft, ChevronRight, MoreHorizontal, Plus, Target } from "lucide-react";
import { FeaturePage, Loading, errorMessage, json, useProductSession } from "../workspace/shared";
import { WorkspaceDialog, ToolError } from "../workspace/WorkspaceDialog";
import { dateInputToIso, dateToInput } from "./dates";
import "../workspace/tools.css";
interface Goal {
  id: string; title: string; description: string | null; priority: "low" | "medium" | "high";
  status: "active" | "completed" | "archived"; progress: number;
  targetDate: string | null; deadline?: string | null; source?: "custom" | "template" | "imported";
  category?: string | null; templateId?: string | null;
}
interface GoalForm { title: string; description: string; priority: Goal["priority"]; status: Goal["status"]; progress: number; date: string }
const empty = (): GoalForm => ({ title: "", description: "", priority: "medium", status: "active", progress: 0, date: "" });
const goalDate = (goal: Goal) => goal.targetDate || goal.deadline || null;
const shortDate = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
export default function GoalsPage() {
  const { request, userId } = useProductSession();
  const navigate = useNavigate();
  const { id } = useParams();
  const [rows, setRows] = useState<Goal[]>([]);
  const [form, setForm] = useState<GoalForm | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [tab, setTab] = useState<"personal" | "plans">("personal");
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "archived">("all");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await request<Goal[]>("/goals", { signal });
      if (!signal?.aborted) { setRows(result); setError(null); }
    } catch (e) { if (!signal?.aborted) setError(errorMessage(e)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [request]);
  const edit = useCallback((goal: Goal) => {
    setEditing(goal.id);
    setForm({ title: goal.title, description: goal.description || "", priority: goal.priority || "medium", status: goal.status, progress: goal.progress, date: dateToInput(goalDate(goal)) });
  }, []);
  useEffect(() => { const abort = new AbortController(); setRows([]); setLoading(true); void load(abort.signal); return () => abort.abort(); }, [load, userId]);
  useEffect(() => { if (id && !form) { const found = rows.find(goal => goal.id === id); if (found) edit(found); } }, [id, rows, form, edit]);
  const closeForm = () => { if (busy) return; setForm(null); setEditing(null); if (id) navigate("/app/goals", { replace: true }); };
  async function save() {
    if (!form?.title.trim()) return;
    setBusy(true); setError(null);
    try {
      await request(editing ? `/goals/${editing}` : "/goals", { method: editing ? "PATCH" : "POST", body: json({ title: form.title.trim(), description: form.description, priority: form.priority, status: form.status, progress: form.status === "completed" ? 100 : Math.min(99, form.progress), targetDate: dateInputToIso(form.date) }) });
      closeFormAfterSave(); await load();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  function closeFormAfterSave() { setForm(null); setEditing(null); if (id) navigate("/app/goals", { replace: true }); }
  async function change(goal: Goal, status?: Goal["status"]) {
    if (!status && !window.confirm(`Delete “${goal.title}”?`)) return;
    setBusy(true); setError(null);
    try {
      await request(`/goals/${goal.id}`, { method: status ? "PATCH" : "DELETE", ...(status ? { body: json({ status, progress: status === "completed" ? 100 : status === "active" && goal.status === "completed" ? 0 : goal.progress }) } : {}) });
      await load();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  const active = rows.filter(goal => goal.status === "active").length;
  const completed = rows.filter(goal => goal.status === "completed").length;
  const rate = rows.length ? Math.round(completed / rows.length * 100) : 0;
  const shown = useMemo(() => rows.filter(goal => filter === "all" || goal.status === filter), [rows, filter]);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (month.getDay() + 6) % 7;
  return <FeaturePage className="tool-page" eyebrow="" title="Goals" description="" actions={<button data-workspace-primary-action className="feature-button" onClick={() => { setEditing(null); setForm(empty()); }} disabled={busy}><Plus size={16}/> Add goal</button>}>
    <ToolError error={form ? null : error} onRetry={() => void load()}/>
    <div className="tool-tabs" aria-label="Goal views"><button aria-pressed={tab === "personal"} onClick={() => setTab("personal")}>My goals</button><button aria-pressed={tab === "plans"} onClick={() => setTab("plans")}>Preparation plans</button></div>
    {tab === "plans" ? <PreparationPlans onImported={() => void load()}/> : <>
      <div className="tool-stats"><button aria-pressed={filter === "active"} onClick={() => setFilter(filter === "active" ? "all" : "active")}><strong>{active}</strong><span>Active</span></button><button aria-pressed={filter === "completed"} onClick={() => setFilter(filter === "completed" ? "all" : "completed")}><strong>{completed}</strong><span>Completed</span></button><div><strong>{rate}%</strong><span>Completion</span></div></div>
      <div className="tool-toolbar"><div className="tool-tabs" style={{ margin: 0, flex: 1 }} aria-label="Goal filters">{(["all", "active", "completed", "archived"] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All" : value[0].toUpperCase() + value.slice(1)}</button>)}</div><button className="tool-icon-button" aria-label={view === "list" ? "Show calendar" : "Show list"} onClick={() => setView(view === "list" ? "calendar" : "list")}><CalendarDays size={18}/></button></div>
      {loading ? <Loading/> : view === "calendar" ? <section className="tool-card"><div className="tool-row" style={{ justifyContent: "space-between" }}><button className="tool-icon-button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()-1, 1))}><ChevronLeft size={18}/></button><h2>{month.toLocaleDateString(undefined, {month:"long",year:"numeric"})}</h2><button className="tool-icon-button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()+1, 1))}><ChevronRight size={18}/></button></div><div className="goal-calendar mt-4">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => <p key={day} className="feature-muted">{day}</p>)}{Array.from({length:offset},(_,i)=><div key={`gap${i}`}/>)}{Array.from({length:days},(_,i)=>{const key = `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`;return <div className="goal-day" key={key}>{i+1}{shown.filter(goal => dateToInput(goalDate(goal)) === key).map(goal => <button key={goal.id} onClick={() => edit(goal)} className="block text-start text-brand">{goal.title}</button>)}</div>;})}</div></section> : shown.length === 0 ? <div className="tool-empty"><span className="tool-icon"><Target size={25}/></span><h2>{rows.length ? "No goals in this view" : "Start with one goal"}</h2><p>{rows.length ? "Choose another filter to see your goals." : "Set a clear target and track your progress."}</p><button className="feature-button" onClick={() => { setEditing(null); setForm(empty()); }}><Plus size={16}/> Add goal</button></div> : <div className="tool-list">{shown.map(goal => <article className="tool-card" key={goal.id}><div className="tool-row"><span className="tool-icon" data-kind={goal.source === "imported" ? "essay" : undefined}><Target size={18}/></span><div><h2>{goal.title}</h2><p>{goal.category || goal.description || (goalDate(goal) ? `Due ${shortDate(goalDate(goal))}` : "Personal goal")}</p></div><details className="tool-menu"><summary aria-label={`Actions for ${goal.title}`}><MoreHorizontal size={20}/></summary><div><button onClick={() => edit(goal)}>Edit</button><button disabled={busy} onClick={() => void change(goal, goal.status === "archived" ? "active" : "archived")}>{goal.status === "archived" ? "Unarchive" : "Archive"}</button><button disabled={busy} onClick={() => void change(goal)}>Delete</button></div></details></div><div className="goal-progress"><progress max={100} value={goal.progress} aria-label={`Progress for ${goal.title}`}/><span>{goal.progress}%</span></div><div className="tool-card-footer"><span>{goalDate(goal) ? `Due ${shortDate(goalDate(goal))}` : goal.source === "imported" ? "From roadmap" : goal.priority === "high" ? "High priority" : "No due date"}</span><button className="feature-button secondary" disabled={busy} onClick={() => void change(goal, goal.status === "completed" ? "active" : "completed")}><Check size={15}/>{goal.status === "completed" ? "Reopen" : "Complete"}</button></div></article>)}</div>}
    </>}
    {form && <WorkspaceDialog title={editing ? "Edit goal" : "Add goal"} busy={busy} onClose={closeForm} footer={<button form="goal-editor" className="feature-button" disabled={busy || form.title.trim().length < 3}>Save goal</button>}><ToolError error={error}/><form id="goal-editor" onSubmit={e => { e.preventDefault(); void save(); }}><label className="feature-label">Goal title<input className="feature-field" required minLength={3} maxLength={150} value={form.title} onChange={e => setForm({...form,title:e.target.value})} autoFocus/></label><label className="feature-label">Target date <span className="feature-muted">(optional)</span><input type="date" className="feature-field" value={form.date} onChange={e => setForm({...form,date:e.target.value})}/></label><label className="feature-label">Description <span className="feature-muted">(optional)</span><textarea className="feature-field" rows={3} maxLength={1000} value={form.description} onChange={e => setForm({...form,description:e.target.value})}/></label><label className="feature-label">Priority<select className="feature-field" value={form.priority} onChange={e => setForm({...form,priority:e.target.value as Goal["priority"]})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>{editing && <label className="feature-label">Progress · {form.progress}%<input className="w-full mt-3" type="range" min="0" max="100" value={form.progress} onChange={e => { const progress=Number(e.target.value);setForm({...form,progress,status:progress===100?"completed":"active"}); }}/></label>}</form></WorkspaceDialog>}
  </FeaturePage>;
}
